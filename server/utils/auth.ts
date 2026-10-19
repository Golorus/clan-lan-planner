/// <reference path="../../shared/types/auth.d.ts" />
import type { H3Event } from 'h3'

/** Notzugang: die feste Discord-ID aus NUXT_LEADER_DISCORD_ID ist immer Projektleiter */
export function isLeaderId(discordId: string | undefined | null) {
  const leader = String(useRuntimeConfig().leaderDiscordId || '').trim()
  if (discordId && demoMode() && discordId === DEMO_IDS.orga) return true
  return !!leader && !!discordId && discordId === leader
}

/**
 * Projektleiter (Zugang zu /orga): die feste ID oder wer auf unserem Discord-Server die Orga-Rolle
 * (NUXT_DISCORD_ORGA_ROLE_ID) hat. Die Rolle wird bei jeder Anfrage geprüft (60 s zwischengespeichert),
 * wer sie in Discord verliert, verliert also auch hier den Zugang. Ist dieselbe ID auch als Event-Rolle
 * eingetragen, gilt sie nicht (sonst wäre jeder Zugesagte Orga).
 */
export async function isLeader(discordId: string | undefined | null) {
  if (!discordId) return false
  if (isLeaderId(discordId)) return true
  const roleId = roleConfig().orgaRoleId
  if (!roleId || !discordConfigured()) return false
  try {
    return (await guildMemberRoles(discordId))?.includes(roleId) ?? false
  }
  catch (e) {
    console.error('[auth] Orga-Rolle nicht prüfbar:', e instanceof Error ? e.message : e)
    return false
  }
}

/** Bricht mit 401/403 ab, wenn kein Projektleiter angemeldet ist */
export async function requireLeader(event: H3Event) {
  const session = await getUserSession(event)
  if (!session.user) throw createError({ statusCode: 401, statusMessage: 'Nicht angemeldet' })
  const leader = await isLeader(session.user.discordId)
  await syncLeaderFlag(event, leader)
  if (!leader) throw createError({ statusCode: 403, statusMessage: 'Nur für die Orga' })
  return session.user
}

/** isLeader in der Sitzung steuert nur die Anzeige (Orga-Knopf); bei geänderter Rolle nachziehen */
export async function syncLeaderFlag(event: H3Event, leader: boolean) {
  const { user } = await getUserSession(event)
  if (user && user.isLeader !== leader) await setUserSession(event, { user: { ...user, isLeader: leader } })
}

/** Nur relative Ziele innerhalb der Seite zulassen (kein //andere-seite.de) */
export function safeRedirect(target: unknown, fallback = '/') {
  const t = typeof target === 'string' ? target : ''
  return t.startsWith('/') && !t.startsWith('//') && !t.startsWith('/\\') ? t : fallback
}
