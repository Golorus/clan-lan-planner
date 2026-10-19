import { eq } from 'drizzle-orm'
import { countdown, deadlineMs } from '#shared/utils/registration'
import { formatEventRange } from '#shared/utils/eventTime'
import { threadChanges, type ThreadPlan } from './threadMembers'

/**
 * Ankündigung eines Events in #organisation (mit @everyone) und der private Thread dazu, wie bisher von Hand.
 * Im Thread sind Orga und Kontaktpersonen immer, dazu alle Zugesagten (= wer die Event-Rolle hat): Zusage bzw.
 * Nachrücken holt jemanden hinein, Absage nimmt ihn heraus. Gilt nur für den Thread des aktuellen Events.
 */

/** Platzhalter der Ankündigung: {event} {datum} {ort} {frist} {countdown} {link} */
export function renderAnnouncement(body: string, ev: EventRow) {
  const vars: Record<string, string> = {
    event: ev.name,
    datum: formatEventRange(ev.startsAt, ev.endsAt),
    ort: ev.location ? ` in ${ev.location}` : '',
    frist: formatDeadline(ev.demandUntil),
    countdown: countdown(deadlineMs(ev.demandUntil), new Date()) || 'ohne Frist',
    link: appUrl(),
  }
  return body.replace(/\{(event|datum|ort|frist|countdown|link)\}/g, (_, k: string) => vars[k]!)
}

function currentThread() {
  const ev = currentEvent()
  return ev?.discordThreadId && discordConfigured() ? { ev, threadId: ev.discordThreadId } : null
}

/** Orga (Projektleiter und Orga-Rolle) und Kontaktpersonen: gehören immer in den Thread */
async function teamMembers() {
  const team = new Map<string, string>()
  const leader = String(useRuntimeConfig().leaderDiscordId || '').trim()
  if (leader) team.set(leader, 'Projektleitung')
  const { orgaRoleId } = roleConfig()
  if (orgaRoleId) for (const m of await membersWithRole(orgaRoleId)) team.set(m.discordId, m.name)
  for (const c of useDb().select().from(tables.contacts).all()) team.set(c.discordId, c.nick)
  return team
}

export interface ThreadSyncResult { configured: boolean, url: string | null, added: string[], removed: string[], errors: { nick: string, error: string }[] }

/** Thread an den Planner angleichen; Änderungen und Fehler ins Protokoll */
export async function syncEventThread(actor: Pick<Actor, 'discordId' | 'name'> | null): Promise<ThreadSyncResult> {
  const cur = currentThread()
  const result: ThreadSyncResult = { configured: !!cur, url: cur ? channelUrl(cur.threadId) : null, added: [], removed: [], errors: [] }
  if (!cur) return result
  const { ev, threadId } = cur
  const regs = loadRegistrations(useDb(), ev.id)
  let plan: ThreadPlan
  try {
    const want = await teamMembers()
    for (const r of regs) if (r.status === 'zugesagt' && r.discordId) want.set(r.discordId, r.nick)
    const removable = new Set(regs.filter(r => r.status !== 'zugesagt' && r.discordId).map(r => r.discordId!))
    plan = threadChanges(want, await threadMemberIds(threadId), await botUserId(), removable)
  }
  catch (e) {
    result.errors.push({ nick: 'Discord', error: channelErrorText(e) })
    return result
  }
  const nickOf = new Map(regs.map(r => [r.discordId, r.nick]))
  const work = [...plan.add.map(a => ({ ...a, on: true })), ...plan.remove.map(id => ({ discordId: id, nick: nickOf.get(id) ?? id, on: false }))]
  for (const c of work) {
    try {
      await setThreadMember(threadId, c.discordId, c.on)
      ;(c.on ? result.added : result.removed).push(c.nick)
      writeLog(useDb(), ev.id, actor, { action: c.on ? 'thread hinzugefügt' : 'thread entfernt', registration: { id: null, nick: c.nick }, detail: 'Thread abgleichen' })
    }
    catch (e) {
      const error = channelErrorText(e)
      result.errors.push({ nick: c.nick, error })
      writeLog(useDb(), ev.id, actor, { action: 'thread fehler', registration: { id: null, nick: c.nick }, detail: error })
      if (e instanceof DiscordError && (e.code === 50013 || e.code === 10003)) break
    }
  }
  return result
}

/** Nach Zusage/Absage einzelner Personen: in den Thread holen bzw. herausnehmen (Orga und Kontaktpersonen bleiben drin) */
export function applyEventThread(eventId: number, changes: RoleChange[]) {
  const cur = currentThread()
  if (!cur || cur.ev.id !== eventId || !changes.length) return
  void (async () => {
    for (const c of changes) {
      try {
        if (!c.on) {
          const isContact = useDb().select({ id: tables.contacts.id }).from(tables.contacts).where(eq(tables.contacts.discordId, c.discordId)).get()
          if (isContact || await isLeader(c.discordId)) continue
        }
        await setThreadMember(cur.threadId, c.discordId, c.on)
        writeLog(useDb(), eventId, null, { action: c.on ? 'thread hinzugefügt' : 'thread entfernt', registration: { id: null, nick: c.nick } })
      }
      catch (e) {
        writeLog(useDb(), eventId, null, { action: 'thread fehler', registration: { id: null, nick: c.nick }, detail: channelErrorText(e) })
      }
    }
  })()
}

/**
 * „Ankündigen“: Text mit @everyone in den Kanal, privaten Thread anlegen, Orga, Kontaktpersonen und Zugesagte
 * hineinholen. Nur für das aktuelle Event (der Thread folgt dessen Zusagen) und nur einmal.
 */
export async function announceEvent(actor: Pick<Actor, 'discordId' | 'name'>, eventId: number, channelId: string, body: string) {
  if (!discordConfigured()) throw createError({ statusCode: 500, statusMessage: 'Der Discord-Bot ist nicht eingerichtet (NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_GUILD_ID).' })
  const E = tables.events
  const ev = useDb().select().from(E).where(eq(E.id, eventId)).get()
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Dieses Event gibt es nicht.' })
  if (!ev.isCurrent) throw createError({ statusCode: 409, statusMessage: 'Erst zum aktuellen Event machen: der Thread folgt den Zusagen des aktuellen Events.' })
  if (ev.discordThreadId) throw createError({ statusCode: 409, statusMessage: 'Dieses Event ist schon angekündigt.' })
  saveDiscordSettings({ announceChannelId: channelId, announceBody: body })

  const content = renderAnnouncement(body, ev)
  let messageId: string, threadId: string
  try {
    messageId = await postChannelMessage(channelId, content, content.includes('@everyone'))
  }
  catch (e) {
    throw createError({ statusCode: 502, statusMessage: 'Ankündigung nicht gesendet: ' + channelErrorText(e) })
  }
  try {
    threadId = await createPrivateThread(channelId, ev.name)
    await postChannelMessage(threadId, renderAnnouncement('Hier geht es weiter für alle, die bei {event} dabei sind. Wer im Planner zusagt, kommt automatisch dazu: {link}', ev))
  }
  catch (e) {
    useDb().update(E).set({ announceChannelId: channelId, announceMessageId: messageId }).where(eq(E.id, ev.id)).run()
    throw createError({ statusCode: 502, statusMessage: 'Angekündigt, aber der Thread ließ sich nicht anlegen: ' + channelErrorText(e) })
  }
  useDb().update(E).set({ announceChannelId: channelId, announceMessageId: messageId, discordThreadId: threadId }).where(eq(E.id, ev.id)).run()
  writeLog(useDb(), ev.id, actor, { action: 'angekündigt', detail: 'mit privatem Thread' })
  const sync = await syncEventThread(actor)
  return { messageUrl: channelUrl(channelId, messageId), threadUrl: channelUrl(threadId), sync }
}
