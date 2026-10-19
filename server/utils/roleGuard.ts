/**
 * Schutz für die Discord-Rollen. Reiner Code ohne Nuxt-Auto-Imports, damit er sich mit vitest prüfen lässt.
 *
 * Der Bot darf genau eine Rolle anfassen: die Event-Rolle für die Zugesagten des aktuellen Events
 * (NUXT_DISCORD_EVENT_ROLE_ID oder in /orga gesetzt). Die Orga-Rolle (Zugang zu /orga) liest er nur.
 * Sind beide gleich eingetragen, wäre jeder Zugesagte Orga: dann gilt keine von beiden.
 */

const SNOWFLAKE = /^\d{5,25}$/

export interface RoleConfig {
  /** Rolle für den Zugang zu /orga, null = keine (nur der Projektleiter) */
  orgaRoleId: string | null
  /** Rolle, die der Bot vergibt und entfernt, null = der Bot fasst keine Rolle an */
  eventRoleId: string | null
  /** beide gleich eingetragen: keine von beiden gilt */
  clash: boolean
}

const clean = (v: unknown) => {
  const s = String(v ?? '').trim()
  return SNOWFLAKE.test(s) ? s : null
}

export function resolveRoles(orgaRoleId: unknown, eventRoleId: unknown): RoleConfig {
  const orga = clean(orgaRoleId), ev = clean(eventRoleId)
  if (orga && ev && orga === ev) return { orgaRoleId: null, eventRoleId: null, clash: true }
  return { orgaRoleId: orga, eventRoleId: ev, clash: false }
}

export class RoleGuardError extends Error {}

/**
 * Vor jedem Rollen-Aufruf an Discord: roleId muss genau die konfigurierte Event-Rolle sein.
 * Gibt den Pfad für PUT/DELETE /guilds/{guild}/members/{user}/roles/{role} zurück, sonst Abbruch.
 */
export function eventRolePath(cfg: RoleConfig, guildId: string, userId: string, roleId: string) {
  if (!cfg.eventRoleId) throw new RoleGuardError('Keine Event-Rolle eingetragen.')
  if (roleId !== cfg.eventRoleId) throw new RoleGuardError('Der Bot darf nur die Event-Rolle vergeben.')
  if (cfg.orgaRoleId && roleId === cfg.orgaRoleId) throw new RoleGuardError('Die Event-Rolle darf nicht die Orga-Rolle sein.')
  if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(userId)) throw new RoleGuardError('Ungültige Server- oder Nutzer-ID.')
  return `/guilds/${guildId}/members/${userId}/roles/${roleId}`
}
