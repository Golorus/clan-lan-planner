import { describe, expect, it } from 'vitest'
import { framableBy, visibleEmbeds } from '../shared/utils/moduleFrames'

describe('Seiten von Modulen einrahmen', () => {
  const frameSelf = ['/modul/seite', '/modul/rahmen/']
  it('erlaubt genau die genannten Pfade und alles unter einem Eintrag mit „/“ am Ende', () => {
    expect(framableBy('/modul/seite', frameSelf)).toBe(true)
    expect(framableBy('/modul/seite?x=1', frameSelf)).toBe(true)
    expect(framableBy('/modul/rahmen/a', frameSelf)).toBe(true)
  })
  it('verbietet alles andere', () => {
    expect(framableBy('/modul/seite/mehr', frameSelf)).toBe(false)
    expect(framableBy('/modul/seitex', frameSelf)).toBe(false)
    expect(framableBy('/modul/rahmen', frameSelf)).toBe(false)
    expect(framableBy('/orga', frameSelf)).toBe(false)
    expect(framableBy('/orga', undefined)).toBe(false)
  })
})

describe('eingebundene Seiten der Module', () => {
  const embeds = [{ src: '/a', title: 'A', flag: 'modulA' }, { src: '/b', title: 'B' }]
  it('lässt Seiten weg, deren Schalter aus ist', () => {
    expect(visibleEmbeds(embeds, {}).map(e => e.src)).toEqual(['/a', '/b'])
    expect(visibleEmbeds(embeds, { modulA: false }).map(e => e.src)).toEqual(['/b'])
    expect(visibleEmbeds(undefined, {})).toEqual([])
  })
})
