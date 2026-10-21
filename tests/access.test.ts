import { describe, expect, it } from 'vitest'
import { accessFor, mayJoinServer, type AccessInput } from '../shared/utils/access'

const base: AccessInput = { team: false, approval: null, registered: false, roles: [], rule: 'server', memberRoleId: null }
const CLAN = '111'

describe('Zugang zum Planner', () => {
  it('Orga und Kontaktpersonen immer', () => {
    expect(accessFor({ ...base, team: true, roles: null, approval: 'abgelehnt' })).toBe('ok')
  })
  it('Regel „server“: jedes Server-Mitglied', () => {
    expect(accessFor(base)).toBe('ok')
  })
  it('Regel „rolle“: nur wer die Clan-Rolle hat, sonst Freigabe anfragen', () => {
    const rolle = { ...base, rule: 'rolle' as const, memberRoleId: CLAN }
    expect(accessFor({ ...rolle, roles: [CLAN] })).toBe('ok')
    expect(accessFor({ ...rolle, roles: ['222'] })).toBe('approval_needed')
    expect(accessFor({ ...rolle, memberRoleId: null, roles: [CLAN] })).toBe('approval_needed')
  })
  it('Regel „keine“: auch Server-Mitglieder mit Rolle fragen an, Freigegebene bleiben drin', () => {
    const keine = { ...base, rule: 'keine' as const, memberRoleId: CLAN }
    expect(accessFor({ ...keine, roles: [CLAN] })).toBe('approval_needed')
    expect(accessFor({ ...keine, approval: 'frei', roles: [] })).toBe('ok')
    expect(accessFor({ ...keine, team: true })).toBe('ok')
  })
  it('Fremde ohne Server: Freigabe anfragen statt beitreten', () => {
    expect(accessFor({ ...base, roles: null })).toBe('approval_needed')
    expect(mayJoinServer(base)).toBe(false)
  })
  it('wartend und abgelehnt bleiben draußen, auch als Server-Mitglied', () => {
    expect(accessFor({ ...base, approval: 'wartet' })).toBe('approval_pending')
    expect(accessFor({ ...base, approval: 'abgelehnt', roles: [CLAN], rule: 'rolle', memberRoleId: CLAN })).toBe('approval_rejected')
    expect(mayJoinServer({ team: false, approval: 'wartet' })).toBe(false)
  })
  it('freigegeben: ohne Rolle drin, ohne Server zum Beitritt', () => {
    expect(accessFor({ ...base, approval: 'frei', rule: 'rolle', memberRoleId: CLAN, roles: [] })).toBe('ok')
    expect(accessFor({ ...base, approval: 'frei', roles: null })).toBe('not_member')
    expect(mayJoinServer({ team: false, approval: 'frei' })).toBe(true)
  })
  it('Teilnahme im Event reicht (Gast der Orga), Discord unbekannt sonst „unknown“', () => {
    expect(accessFor({ ...base, approval: 'frei', registered: true, roles: undefined })).toBe('ok')
    expect(accessFor({ ...base, roles: undefined })).toBe('unknown')
  })
})
