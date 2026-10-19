import { describe, expect, it } from 'vitest'
import { visibleLinks } from '../shared/utils/moduleLinks'
import { ORGA_GROUPS, activeOrgaGroup } from '../shared/utils/orgaNav'

describe('Orga-Reiter', () => {
  it('findet die Gruppe einer Seite, auch mit Schrägstrich am Ende', () => {
    expect(activeOrgaGroup('/orga/sitzplan').label).toBe('Event')
    expect(activeOrgaGroup('/orga/discord/').label).toBe('Kommunikation')
  })
  it('fällt auf die Übersicht zurück', () => {
    expect(activeOrgaGroup('/orga/modul')).toBe(ORGA_GROUPS[0])
    expect(activeOrgaGroup('/')).toBe(ORGA_GROUPS[0])
  })
  it('jede Seite steht genau einmal drin, Seiten der Module nicht in den Gruppen', () => {
    const all = ORGA_GROUPS.flatMap(g => g.pages.map(p => p.to))
    expect(new Set(all).size).toBe(all.length)
    expect(all).not.toContain('/orga/modul')
  })
})

describe('Links der Module', () => {
  const links = [{ to: '/orga/modul', label: 'Modul', flag: 'meinModul' }, { to: '/x', label: 'Immer' }]
  it('zeigt Links, deren Schalter an oder nicht gesetzt ist', () => {
    expect(visibleLinks(links, { meinModul: true }).map(l => l.to)).toEqual(['/orga/modul', '/x'])
    expect(visibleLinks(links, {}).map(l => l.to)).toEqual(['/orga/modul', '/x'])
  })
  it('lässt Links weg, deren Schalter aus ist', () => {
    expect(visibleLinks(links, { meinModul: false }).map(l => l.to)).toEqual(['/x'])
    expect(visibleLinks(undefined, {})).toEqual([])
  })
})
