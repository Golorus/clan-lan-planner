import { describe, expect, it } from 'vitest'
import { actsAsOrga, isOrgaPage, ORGA_HEADER, orgaHeaders } from '../shared/utils/orgaContext'

describe('Orga-Rechte nur im Orga-Bereich', () => {
  it('Orga-Endpunkte immer mit Orga-Rechten', () => {
    expect(actsAsOrga(true, '/api/orga/events', undefined)).toBe(true)
    expect(actsAsOrga(true, '/api/orga', undefined)).toBe(true)
  })
  it('gemeinsame Endpunkte nur von /orga-Seiten aus', () => {
    expect(actsAsOrga(true, '/api/sitzplan/platz', undefined)).toBe(false)
    expect(actsAsOrga(true, '/api/sitzplan/platz', '1')).toBe(true)
    expect(actsAsOrga(true, '/api/team/uebersicht', '0')).toBe(false)
  })
  it('ohne Orga-Rolle hilft auch die Kennzeichnung nicht', () => {
    expect(actsAsOrga(false, '/api/sitzplan/platz', '1')).toBe(false)
    expect(actsAsOrga(false, '/api/orga/events', '1')).toBe(false)
  })
  it('kein Treffer für Pfade, die nur ähnlich anfangen', () => {
    expect(actsAsOrga(true, '/api/organisation', undefined)).toBe(false)
    expect(isOrgaPage('/organisation')).toBe(false)
  })
  it('Seiten unter /orga kennzeichnen ihre Anfragen, die Startseite nicht', () => {
    expect(orgaHeaders('/orga/sitzplan')).toEqual({ [ORGA_HEADER]: '1' })
    expect(orgaHeaders('/orga')).toEqual({ [ORGA_HEADER]: '1' })
    expect(orgaHeaders('/')).toEqual({})
    expect(orgaHeaders('/kontakt')).toEqual({})
  })
})
