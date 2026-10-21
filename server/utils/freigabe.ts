import { and, eq } from 'drizzle-orm'
import { accessFor, mayJoinServer, MEMBER_RULES, type Access, type Approval, type MemberRule } from '#shared/utils/access'
import { resolveBranding } from '#shared/utils/branding'

/**
 * Freigabe neuer Leute: Wer weder Orga noch Kontaktperson ist und keine Clan-Rolle hat, meldet sich mit Nick und
 * Kontaktperson; die Kontaktperson bekommt eine DM mit „Annehmen“/„Ablehnen“, die Orga kann in /orga › Teilnehmer
 * entscheiden. Die Freigabe gilt dauerhaft (persons.approval). Die Regel steht in shared/utils/access.ts.
 */

/** Nur in der Entwicklung ohne Bot: diese Discord-IDs gelten als nicht auf dem Server (dev-login ?mitglied=0) */
export const devNonMembers = new Set<string>()

const roleId = (v: unknown) => typeof v === 'string' && /^\d{5,25}$/.test(v.trim()) ? v.trim() : null

/**
 * Wer ohne Freigabe durchkommt (settings, Schlüssel „freigabe“, in /orga › Teilnehmer). Nicht gesetzt = wie in der .env:
 * mit NUXT_DISCORD_MEMBER_ROLE_ID nur die Clan-Rolle, sonst jedes Server-Mitglied.
 */
export function memberRule(): { rule: MemberRule, roleId: string | null, source: 'orga' | 'env' } {
  const row = useDb().select().from(tables.settings).where(eq(tables.settings.key, 'freigabe')).get()
  const saved = row ? JSON.parse(row.value) as { rule?: unknown, roleId?: unknown } : null
  if (saved && MEMBER_RULES.includes(saved.rule as MemberRule)) return { rule: saved.rule as MemberRule, roleId: roleId(saved.roleId), source: 'orga' }
  const env = roleId(String(useRuntimeConfig().discord.memberRoleId || ''))
  return { rule: env ? 'rolle' : 'server', roleId: env, source: 'env' }
}

/** null = zurück zur .env */
export function saveMemberRule(value: { rule: MemberRule, roleId: string | null } | null) {
  const S = tables.settings
  if (!value) {
    useDb().delete(S).where(eq(S.key, 'freigabe')).run()
    return
  }
  const json = JSON.stringify(value)
  useDb().insert(S).values({ key: 'freigabe', value: json }).onConflictDoUpdate({ target: S.key, set: { value: json } }).run()
}

/** Clan-Rolle, falls die Regel sie verlangt */
export function memberRoleId() {
  const r = memberRule()
  return r.rule === 'rolle' ? r.roleId : null
}

/** Rollen auf unserem Server; null = kein Mitglied, undefined = unbekannt (Discord nicht erreichbar) */
async function serverRoles(discordId: string, approved: boolean): Promise<string[] | null | undefined> {
  // Demo-Personen der QA-Umgebung gibt es auf Discord nicht
  if (isDemoId(discordId)) return demoRoles(discordId, approved, memberRoleId())
  if (!discordConfigured()) {
    if (!botOptional()) return undefined
    // lokal ohne Bot: alle sind Mitglied mit Clan-Rolle, außer zum Testen ausgenommen
    const role = memberRoleId()
    return devNonMembers.has(discordId) ? null : role ? [role] : []
  }
  try {
    return await guildMemberRoles(discordId)
  }
  catch {
    return undefined
  }
}

/** Orga oder Kontaktperson (beides unabhängig davon, ob gerade im Orga-Bereich gehandelt wird) */
async function isTeam(discordId: string) {
  if (await isLeader(discordId)) return true
  return !!useDb().select({ id: tables.contacts.id }).from(tables.contacts).where(eq(tables.contacts.discordId, discordId)).get()
}

export async function accessOf(discordId: string): Promise<{ access: Access, person: typeof tables.persons.$inferSelect | null }> {
  const db = useDb()
  const person = findPersonByDiscordId(db, discordId)
  const team = await isTeam(discordId)
  const ev = currentEvent(db)
  const R = tables.registrations
  const registered = !!(ev && person && db.select({ id: R.id }).from(R).where(and(eq(R.eventId, ev.id), eq(R.personId, person.id))).get())
  const { rule } = memberRule()
  const approved = person?.approval === 'frei'
  // Discord fragen nur, wenn die Antwort etwas ändert: bei Regel „keine“ zählt für Unbekannte nur die Freigabe
  const skip = team || registered || (!!person && !approved) || (rule === 'keine' && !approved)
  const roles = skip ? [] : await serverRoles(discordId, approved)
  return { access: accessFor({ team, approval: person?.approval ?? null, registered, roles, rule, memberRoleId: memberRoleId() }), person }
}

export async function mayJoin(discordId: string) {
  const person = findPersonByDiscordId(useDb(), discordId)
  return mayJoinServer({ team: await isTeam(discordId), approval: person?.approval ?? null })
}

const GATE_TEXT: Record<Exclude<Access, 'ok'>, [number, string]> = {
  not_member: [403, 'Du bist freigegeben. Tritt jetzt noch unserem Discord-Server bei.'],
  approval_needed: [403, 'Der Planner ist nur für Leute, die wir kennen. Frag bitte eine Freigabe an.'],
  approval_pending: [403, 'Deine Anfrage wartet auf Freigabe durch deine Kontaktperson.'],
  approval_rejected: [403, 'Deine Anfrage wurde nicht freigegeben. Bei Fragen wende dich an die Orga.'],
  unknown: [503, 'Discord ist gerade nicht erreichbar, bitte gleich noch einmal versuchen.'],
}

/** Bricht ab, wenn actor nicht in den Planner darf; data.code sagt der Seite, was sie zeigen soll */
export async function requireAccess(discordId: string) {
  const { access } = await accessOf(discordId)
  if (access === 'ok') return
  const [statusCode, statusMessage] = GATE_TEXT[access]
  throw createError({ statusCode, statusMessage, data: { code: access } })
}

function logIfEvent(actor: { discordId: string, name: string } | null, action: string, nick: string, detail: string) {
  const ev = currentEvent(useDb())
  if (ev) writeLog(useDb(), ev.id, actor, { action, registration: { id: null, nick }, detail })
}

/** Freigabe anfragen (oder bei wartender Anfrage Nick/Kontaktperson ändern und erneut fragen) */
export async function requestApproval(actor: { discordId: string, name: string, username: string }, nickRaw: string, contactId: number) {
  const { access, person } = await accessOf(actor.discordId)
  if (access === 'approval_rejected') throw createError({ statusCode: 403, statusMessage: GATE_TEXT.approval_rejected[1] })
  if (access !== 'approval_needed' && access !== 'approval_pending') throw createError({ statusCode: 409, statusMessage: 'Du brauchst keine Freigabe.' })
  const db = useDb()
  const contact = db.select().from(tables.contacts).where(eq(tables.contacts.id, contactId)).get()
  if (!contact) throw createError({ statusCode: 400, statusMessage: 'Bitte eine Kontaktperson auswählen.' })
  const nick = validNick(db, nickRaw, person?.id)
  const now = new Date()
  const P = tables.persons
  let personId: number
  if (person) {
    db.update(P).set({ nick, contactId, discordName: actor.username, approval: 'wartet', approvalAt: null, approvalBy: null, updatedAt: now }).where(eq(P.id, person.id)).run()
    personId = person.id
  }
  else {
    const avatar = db.select({ avatar: tables.users.avatar }).from(tables.users).where(eq(tables.users.discordId, actor.discordId)).get()?.avatar ?? null
    personId = db.insert(P).values({ discordId: actor.discordId, discordName: actor.username, nick, contactId, avatar, approval: 'wartet', createdAt: now, updatedAt: now })
      .returning({ id: P.id }).get().id
  }
  logIfEvent(actor, 'freigabe angefragt', nick, `Kontaktperson ${contact.nick}`)
  const sent = await notifyContact(contact.discordId, personId, nick, actor.username)
  return { personId, notified: sent }
}

async function notifyContact(contactDiscordId: string, personId: number, nick: string, username: string) {
  if (!discordConfigured()) return false
  const text = `**${nick}** (Discord: ${username}) möchte in den ${appName()} und hat dich als Kontaktperson gewählt. Kennst du die Person und soll sie mitmachen dürfen?`
    + (interactionsEnabled() ? '' : `\nFreigeben kann die Orga im Planner unter Orga › Teilnehmer.`)
  try {
    await sendDirectMessage(contactDiscordId, text, approvalButtons(personId))
    return true
  }
  catch (e) {
    console.error('[freigabe] Nachricht an die Kontaktperson ging nicht:', e instanceof Error ? e.message : e)
    return false
  }
}

const appName = () => resolveBranding(useRuntimeConfig().public).appName

/**
 * Entscheiden: „frei“ oder „abgelehnt“; „zurück“ setzt eine Ablehnung zurück, die Person kann neu anfragen.
 * by.asContact: es entscheidet jemand per Knopf in der DM – nur die gewählte Kontaktperson oder die Orga.
 */
export async function decideApproval(personId: number, decision: Approval | 'zurück', by: { discordId: string, name: string, asContact?: boolean }) {
  const db = useDb()
  const P = tables.persons
  const person = db.select().from(P).where(eq(P.id, personId)).get()
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Diese Anfrage gibt es nicht mehr.' })
  if (by.asContact) {
    const contact = person.contactId ? db.select().from(tables.contacts).where(eq(tables.contacts.id, person.contactId)).get() : null
    if (contact?.discordId !== by.discordId && !(await isLeader(by.discordId))) {
      throw createError({ statusCode: 403, statusMessage: 'Das entscheidet die gewählte Kontaktperson oder die Orga.' })
    }
  }
  const to: Approval = decision === 'zurück' ? 'frei' : decision
  if (decision === 'zurück') {
    // Ablehnung aufheben: die Person verschwindet, damit sie neu anfragen kann (ohne Teilnahmen, sonst bleibt sie frei)
    if (person.approval !== 'abgelehnt') return { changed: false, approval: person.approval, nick: person.nick }
    const R = tables.registrations
    const hasRegs = !!db.select({ id: R.id }).from(R).where(eq(R.personId, person.id)).get()
    if (hasRegs) db.update(P).set({ approval: 'frei', approvalAt: new Date(), approvalBy: by.name, updatedAt: new Date() }).where(eq(P.id, person.id)).run()
    else db.delete(P).where(eq(P.id, person.id)).run()
    logIfEvent(by, 'freigabe zurückgesetzt', person.nick, '')
    return { changed: true, approval: hasRegs ? 'frei' as const : null, nick: person.nick }
  }
  if (person.approval === to) return { changed: false, approval: to, nick: person.nick }
  // per Knopf nur offene Anfragen; eine schon getroffene Entscheidung ändert nur die Orga
  if (by.asContact && person.approval !== 'wartet') return { changed: false, approval: person.approval, nick: person.nick }
  const now = new Date()
  db.update(P).set({ approval: to, approvalAt: now, approvalBy: by.name, updatedAt: now }).where(eq(P.id, person.id)).run()
  logIfEvent(by, to === 'frei' ? 'freigegeben' : 'abgelehnt', person.nick, `Freigabe durch ${by.name}`)
  if (person.discordId && discordConfigured()) {
    const text = to === 'frei'
      ? `Du bist für den ${appName()} freigegeben. Hier geht es weiter: ${appUrl()}`
      : `Deine Anfrage für den ${appName()} wurde leider nicht freigegeben.`
    // geht nur, wenn die Person schon auf einem Server mit dem Bot ist; sonst sieht sie es auf der Seite
    await sendDirectMessage(person.discordId, text).catch(() => {})
  }
  return { changed: true, approval: to, nick: person.nick }
}

/** Offene und abgelehnte Anfragen für /orga */
export function approvalRequests() {
  const db = useDb()
  const P = tables.persons
  const contacts = new Map(db.select().from(tables.contacts).all().map(c => [c.id, c.nick]))
  return db.select().from(P).all()
    .filter(p => p.approval !== 'frei')
    .map(p => ({
      personId: p.id,
      nick: p.nick,
      discordName: p.discordName,
      contactNick: p.contactId ? contacts.get(p.contactId) ?? null : null,
      approval: p.approval,
      requestedAt: p.updatedAt,
      decidedAt: p.approvalAt,
      decidedBy: p.approvalBy,
    }))
    .sort((a, b) => (a.approval === b.approval ? b.requestedAt.getTime() - a.requestedAt.getTime() : a.approval === 'wartet' ? -1 : 1))
}
