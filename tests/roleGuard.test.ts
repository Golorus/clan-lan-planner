import { describe, expect, it } from 'vitest'
import { eventRolePath, resolveRoles, RoleGuardError } from '../server/utils/roleGuard'

const ORGA = '444444444444444444'
const EVENT = '555555555555555555'
const GUILD = '111111111111111111'
const USER = '222222222222222222'

describe('resolveRoles', () => {
  it('nimmt beide Rollen, wenn sie verschieden sind', () => {
    expect(resolveRoles(ORGA, EVENT)).toEqual({ orgaRoleId: ORGA, eventRoleId: EVENT, clash: false })
  })
  it('lässt beide weg, wenn dieselbe ID eingetragen ist', () => {
    expect(resolveRoles(EVENT, EVENT)).toEqual({ orgaRoleId: null, eventRoleId: null, clash: true })
    expect(resolveRoles(` ${EVENT} `, EVENT).clash).toBe(true)
  })
  it('ignoriert leere und ungültige Werte', () => {
    expect(resolveRoles('', undefined)).toEqual({ orgaRoleId: null, eventRoleId: null, clash: false })
    expect(resolveRoles('abc', '12')).toEqual({ orgaRoleId: null, eventRoleId: null, clash: false })
  })
})

describe('eventRolePath', () => {
  const cfg = resolveRoles(ORGA, EVENT)
  it('baut den Pfad nur für die Event-Rolle', () => {
    expect(eventRolePath(cfg, GUILD, USER, EVENT)).toBe(`/guilds/${GUILD}/members/${USER}/roles/${EVENT}`)
  })
  it('bricht bei jeder anderen Rolle ab, auch bei der Orga-Rolle', () => {
    expect(() => eventRolePath(cfg, GUILD, USER, ORGA)).toThrow(RoleGuardError)
    expect(() => eventRolePath(cfg, GUILD, USER, '333333333333333333')).toThrow(RoleGuardError)
  })
  it('macht nichts ohne konfigurierte Rolle', () => {
    expect(() => eventRolePath(resolveRoles(ORGA, ''), GUILD, USER, EVENT)).toThrow(RoleGuardError)
    expect(() => eventRolePath(resolveRoles(EVENT, EVENT), GUILD, USER, EVENT)).toThrow(RoleGuardError)
  })
  it('lässt keine fremden Zeichen in den Pfad', () => {
    expect(() => eventRolePath(cfg, GUILD, '../roles', EVENT)).toThrow(RoleGuardError)
    expect(() => eventRolePath(cfg, `${GUILD}/x`, USER, EVENT)).toThrow(RoleGuardError)
  })
})
