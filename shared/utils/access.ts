/**
 * Wer darf in den Planner? Orga und Kontaktpersonen immer; wer sich selbst gemeldet hat, erst nach Freigabe;
 * sonst wer auf unserem Discord-Server ist und, falls eingestellt, die Clan-Rolle hat (NUXT_DISCORD_MEMBER_ROLE_ID).
 * Server: server/utils/freigabe.ts
 */
export type Approval = 'frei' | 'wartet' | 'abgelehnt'

export type Access =
  | 'ok'
  /** freigegeben, aber noch nicht auf unserem Discord-Server: darf beitreten */
  | 'not_member'
  /** unbekannt: muss eine Freigabe anfragen */
  | 'approval_needed'
  | 'approval_pending'
  | 'approval_rejected'
  /** Discord nicht erreichbar */
  | 'unknown'

export interface AccessInput {
  /** Orga oder Kontaktperson */
  team: boolean
  /** Freigabe der Person; null = keine Person bei uns */
  approval: Approval | null
  /** hat eine Teilnahme im aktuellen Event (z. B. ein Gast der Orga) */
  registered: boolean
  /** Rollen auf unserem Server; null = kein Mitglied, undefined = unbekannt */
  roles: string[] | null | undefined
  /** Clan-Rolle; leer = jedes Mitglied des Servers gilt als bekannt */
  memberRoleId: string | null
}

export function accessFor(i: AccessInput): Access {
  if (i.team) return 'ok'
  if (i.approval === 'wartet') return 'approval_pending'
  if (i.approval === 'abgelehnt') return 'approval_rejected'
  if (i.registered) return 'ok'
  if (i.roles === undefined) return 'unknown'
  const approved = i.approval === 'frei'
  if (i.roles === null) return approved ? 'not_member' : 'approval_needed'
  if (approved || !i.memberRoleId || i.roles.includes(i.memberRoleId)) return 'ok'
  return 'approval_needed'
}

/** Beitritt zum Discord-Server über den Planner (guilds.join): nur Team und Freigegebene, nie Unbekannte */
export function mayJoinServer(i: Pick<AccessInput, 'team' | 'approval'>) {
  return i.team || i.approval === 'frei'
}
