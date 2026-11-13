import { describe, expect, it } from 'vitest'
import { applyPackOps, countsOf, newRound, normalisePackState, normaliseStock, parseArticleLines, visibleQuellen } from '../shared/inventar'

describe('Inventar: Bestand', () => {
  it('räumt auf: ungültige und doppelte Einträge fallen weg, unbekannte Kisten werden gelöst', () => {
    const s = normaliseStock({
      containers: [{ id: 'k1', name: ' Euro-Box 1 ', kind: 'Kiste' }, { id: 'k1', name: 'doppelt' }, { id: 'böse id', name: 'x' }, { id: 'k2', name: 'Tasche', kind: 'Unsinn' }],
      articles: [
        { id: 'a1', name: 'Patchkabel', count: 10, container: 'k1', checked: true, source: 'stand', key: 'rj45:20' },
        { id: 'a2', name: 'Projektor', count: -3, container: 'weg', key: 'ohne-quelle' },
        { id: 'a1', name: 'doppelt', count: 1 },
        'kein Objekt',
      ],
    })
    expect(s.containers).toEqual([{ id: 'k1', name: 'Euro-Box 1', kind: 'Kiste' }, { id: 'k2', name: 'Tasche', kind: 'Kiste' }])
    expect(s.articles).toHaveLength(2)
    expect(s.articles[0]).toMatchObject({ id: 'a1', count: 10, container: 'k1', checked: true, source: 'stand', key: 'rj45:20' })
    expect(s.articles[1]).toMatchObject({ id: 'a2', count: 0, container: '', checked: false, source: '', key: '' })
  })
  it('leer bei Unsinn', () => {
    expect(normaliseStock(null)).toEqual({ containers: [], articles: [] })
    expect(normaliseStock('x')).toEqual({ containers: [], articles: [] })
  })
  it('Bestand je Artikelart eines Moduls: Zeilen derselben Art zählen zusammen', () => {
    const s = normaliseStock({ articles: [
      { id: 'a1', name: 'Netzteil', count: 3, source: 'stand', key: 'psu120' },
      { id: 'a2', name: 'Netzteil (Tasche)', count: 2, source: 'stand', key: 'psu120' },
      { id: 'a3', name: 'Banner', count: 4 },
      { id: 'a4', name: 'Fremd', count: 9, source: 'anderes', key: 'psu120' },
    ] })
    expect(countsOf(s, 'stand')).toEqual({ psu120: 5 })
    expect(countsOf(s, 'nix')).toEqual({})
  })
  it('Quellen abgeschalteter Module fehlen', () => {
    const q = [{ modul: 'a', label: 'A', arten: [] }, { modul: 'b', label: 'B', flag: 'bAn', arten: [] }]
    expect(visibleQuellen(q, { bAn: false }).map(x => x.modul)).toEqual(['a'])
    expect(visibleQuellen(q, {}).map(x => x.modul)).toEqual(['a', 'b'])
    expect(visibleQuellen(undefined, {})).toEqual([])
  })
  it('eingefügte Liste lesen', () => {
    expect(parseArticleLines('Patchkabel 20 m; 10\n4 x Fahnenstange\n\nProjektor\nBanner:\t3\n2× Y-Splitter')).toEqual([
      { name: 'Patchkabel 20 m', count: 10 }, { name: 'Fahnenstange', count: 4 }, { name: 'Projektor', count: 1 }, { name: 'Banner', count: 3 }, { name: 'Y-Splitter', count: 2 },
    ])
  })
})

describe('Inventar: Packen', () => {
  const known = new Set(['a1', 'a2'])
  const start = normalisePackState(null)
  const op = (id: string, article = 'a1', delta: 1 | -1 = 1, roundId = 'start') => ({ id, article, delta, roundId })

  it('zählt, merkt sich wer und wann', () => {
    const { state, applied } = applyPackOps(start, [op('op-0001'), op('op-0002'), op('op-0003', 'a2')], known, 'Anna', '2026-01-01T10:00:00Z')
    expect(applied).toBe(3)
    expect(state.counts).toEqual({ a1: 2, a2: 1 })
    expect(state.by.a1).toBe('Anna')
    expect(state.at.a2).toBe('2026-01-01T10:00:00Z')
    expect(start.counts).toEqual({})
  })
  it('zählt jede Kennung nur einmal (Nachsenden nach Funkloch)', () => {
    const once = applyPackOps(start, [op('op-0001')], known, 'Anna', 't').state
    const twice = applyPackOps(once, [op('op-0001'), op('op-0002')], known, 'Ben', 't')
    expect(twice.applied).toBe(1)
    expect(twice.state.counts.a1).toBe(2)
  })
  it('übergeht alte Runden und unbekannte Artikel, fällt nie unter null', () => {
    const r = applyPackOps(start, [op('op-0001', 'a1', 1, 'alt'), op('op-0002', 'weg'), op('op-0003', 'a1', -1)], known, 'Anna', 't')
    expect(r.applied).toBe(1)
    expect(r.state.counts.a1).toBe(0)
  })
  it('neue Runde beginnt bei null', () => {
    const r = newRound('rueck', 'r2')
    expect(r).toMatchObject({ round: 'rueck', roundId: 'r2', counts: {}, ops: [] })
    expect(applyPackOps(r, [op('op-0001')], known, 'Anna', 't').applied).toBe(0)
    expect(applyPackOps(r, [op('op-0001', 'a1', 1, 'r2')], known, 'Anna', 't').state.counts.a1).toBe(1)
  })
  it('liest gespeicherten Stand robust', () => {
    expect(normalisePackState({ round: 'x', counts: { a1: 2, a2: -1, a3: 'viel' }, ops: ['o', 3] })).toMatchObject({ round: 'hin', roundId: 'start', counts: { a1: 2 }, ops: ['o'] })
  })
})
