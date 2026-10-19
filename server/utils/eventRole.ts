import { and, eq } from 'drizzle-orm'

/**
 * Die Event-Rolle steht immer für die Zugesagten des aktuellen Events. Der Bot gibt sie bei Zusage
 * (auch beim Nachrücken) und nimmt sie bei Absage oder Löschen; „Rolle abgleichen“ in /orga bringt Discord
 * und Planner wieder überein. Ohne eingetragene Rolle oder ohne Bot passiert nichts. Fehler landen im Protokoll,
 * damit die Orga sie sieht; der Abgleich behebt sie später.
 */

export interface RoleChange { discordId: string, nick: string, on: boolean }

function roleReady() {
  const { eventRoleId } = roleConfig()
  return eventRoleId && discordConfigured() ? eventRoleId : null
}

/** Rolle für einzelne Personen setzen, im Hintergrund nach der Transaktion */
export function applyEventRole(eventId: number, changes: RoleChange[]) {
  const roleId = roleReady()
  if (!roleId || !changes.length) return
  void (async () => {
    for (const c of changes) {
      try {
        await setMemberRole(c.discordId, roleId, c.on)
        writeLog(useDb(), eventId, null, { action: c.on ? 'rolle vergeben' : 'rolle entfernt', registration: { id: null, nick: c.nick }, detail: branding().eventRoleName })
      }
      catch (e) {
        writeLog(useDb(), eventId, null, { action: 'rolle fehler', registration: { id: null, nick: c.nick }, detail: roleErrorText(e) })
      }
    }
  })()
}

/** Rolle passend zum neuen Status: nur im aktuellen Event, nur mit Discord-ID */
export function roleChangeFor(reg: { eventId: number, discordId: string | null, nick: string }, status: string): RoleChange[] {
  if (!reg.discordId) return []
  const ev = currentEvent()
  if (!ev || ev.id !== reg.eventId) return []
  return [{ discordId: reg.discordId, nick: reg.nick, on: status === 'zugesagt' }]
}

export interface RoleSyncResult {
  configured: boolean
  added: string[]
  removed: string[]
  errors: { nick: string, error: string }[]
}

/**
 * Discord an den Planner angleichen: Zugesagte des aktuellen Events bekommen die Rolle, alle anderen verlieren sie.
 * Läuft auch, wenn ein neues Event aktuell wird. Änderungen und Fehler ins Protokoll.
 */
export async function syncEventRole(actor: Pick<Actor, 'discordId' | 'name'> | null): Promise<RoleSyncResult> {
  const roleId = roleReady()
  const result: RoleSyncResult = { configured: !!roleId, added: [], removed: [], errors: [] }
  const ev = currentEvent()
  if (!roleId || !ev) return result

  const R = tables.registrations
  const P = tables.persons
  const want = new Map(useDb().select({ discordId: P.discordId, nick: P.nick }).from(R).innerJoin(P, eq(P.id, R.personId))
    .where(and(eq(R.eventId, ev.id), eq(R.status, 'zugesagt'))).all()
    .filter((p): p is { discordId: string, nick: string } => !!p.discordId).map(p => [p.discordId, p.nick]))

  let have: GuildMember[]
  try {
    have = await membersWithRole(roleId)
  }
  catch (e) {
    result.errors.push({ nick: 'Discord', error: roleErrorText(e) })
    return result
  }
  const haveIds = new Set(have.map(m => m.discordId))
  const work: RoleChange[] = [
    ...[...want].filter(([id]) => !haveIds.has(id)).map(([discordId, nick]) => ({ discordId, nick, on: true })),
    ...have.filter(m => !want.has(m.discordId)).map(m => ({ discordId: m.discordId, nick: m.name, on: false })),
  ]
  for (const c of work) {
    try {
      await setMemberRole(c.discordId, roleId, c.on)
      ;(c.on ? result.added : result.removed).push(c.nick)
      writeLog(useDb(), ev.id, actor, { action: c.on ? 'rolle vergeben' : 'rolle entfernt', registration: { id: null, nick: c.nick }, detail: 'Rolle abgleichen' })
    }
    catch (e) {
      const error = roleErrorText(e)
      result.errors.push({ nick: c.nick, error })
      writeLog(useDb(), ev.id, actor, { action: 'rolle fehler', registration: { id: null, nick: c.nick }, detail: error })
      // fehlt die Berechtigung, scheitern alle weiteren genauso
      if (e instanceof DiscordError && e.code === 50013) break
    }
  }
  return result
}
