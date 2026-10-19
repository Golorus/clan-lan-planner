import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookingButtons, offerButtons, parseCustomId, statusButtons, testButtons } from '../server/utils/buttons'

/** buttons.ts nutzt Nuxt-Auto-Imports (useRuntimeConfig, appUrl); hier stehen sie als Platzhalter */
function setup(publicKey: string) {
  vi.stubGlobal('useRuntimeConfig', () => ({ discord: { publicKey } }))
  vi.stubGlobal('appUrl', () => 'https://planner.example.de/')
}
afterEach(() => vi.unstubAllGlobals())

type Row = { components: { style: number, custom_id?: string, url?: string, label: string }[] }
const all = (rows: unknown[]) => (rows as Row[]).flatMap(r => r.components)

describe('Knöpfe je Einstellung', () => {
  it('mit Public Key: echte Knöpfe', () => {
    setup('ab'.repeat(32))
    expect(all(statusButtons(7)).map(b => b.custom_id).filter(Boolean)).toEqual(['st:zu:7', 'st:ab:7', 'rem:aus:7'])
    expect(all(bookingButtons(7, 'https://buchung.example.de/')).map(b => b.custom_id ?? b.url)).toEqual(['https://buchung.example.de/', 'bk:7'])
    expect(all(offerButtons(3)).map(b => b.custom_id)).toEqual(['of:ja:3', 'of:nein:3'])
    expect(all(testButtons()).map(b => b.custom_id)).toEqual(['test:knopf', 'test:formular'])
  })

  it('ohne Public Key: nur Links zur Seite, keine Test-Knöpfe', () => {
    setup('')
    for (const rows of [statusButtons(7), offerButtons(3)]) expect(all(rows).every(b => b.url && !b.custom_id)).toBe(true)
    expect(all(bookingButtons(7, 'https://buchung.example.de/')).every(b => b.url && !b.custom_id)).toBe(true)
    expect(testButtons()).toEqual([])
  })

  it('Buchungslink nur, wenn es eine http(s)-Adresse ist', () => {
    setup('ab'.repeat(32))
    expect(all(bookingButtons(7, '')).map(b => b.custom_id)).toEqual(['bk:7'])
  })

  it('custom_id lesen', () => {
    expect(parseCustomId('test:formular')).toEqual({ kind: 'test', what: 'formular' })
    expect(parseCustomId('bk:12')).toEqual({ kind: 'booked', registrationId: 12 })
    expect(parseCustomId('bk:abc')).toBeNull()
  })
})
