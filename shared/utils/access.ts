/**
 * Wer darf in den Planner? Orga und Kontaktpersonen immer; wer sich selbst gemeldet hat, erst nach Freigabe;
 * sonst je nach Regel (MemberRule) jedes Mitglied unseres Discord-Servers, nur wer die Clan-Rolle hat, oder niemand.
 * Server: server/utils/freigabe.ts
 */
export type Approval = 'frei' | 'wartet' | 'abgelehnt'

/**
 * Wer ohne Freigabe durchkommt: „server“ = jedes Mitglied unseres Discord-Servers, „rolle“ = nur mit der Clan-Rolle,
 * „keine“ = niemand, jede neue Person fragt an (wer schon als Person bei uns ist, bleibt frei)
 */
export type MemberRule = 'server' | 'rolle' | 'keine'
export const MEMBER_RULES: readonly MemberRule[] = ['server', 'rolle', 'keine']

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
  /** wer ohne Freigabe durchkommt */
  rule: MemberRule
  /** Clan-Rolle für rule „rolle“; fehlt sie, kommt niemand ohne Freigabe durch */
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
  if (approved || i.rule === 'server') return 'ok'
  if (i.rule === 'rolle' && i.memberRoleId && i.roles.includes(i.memberRoleId)) return 'ok'
  return 'approval_needed'
}

/** Beitritt zum Discord-Server über den Planner (guilds.join): nur Team und Freigegebene, nie Unbekannte */
export function mayJoinServer(i: Pick<AccessInput, 'team' | 'approval'>) {
  return i.team || i.approval === 'frei'
}
