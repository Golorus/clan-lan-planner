import { describe, expect, it } from 'vitest'
import { berlinToUtcIso, formatEventRange, utcToBerlinLocal } from '../shared/utils/eventTime'

describe('UTC → Berliner Ortszeit', () => {
  it('rechnet einen Zeitpunkt in Berliner Ortszeit um, auch über die Zeitumstellung', () => {
    expect(utcToBerlinLocal(new Date('2026-10-17T16:00:00Z'))).toBe('2026-10-17T18:00')
    expect(utcToBerlinLocal(new Date('2026-10-29T17:00:00Z'))).toBe('2026-10-29T18:00')
    expect(utcToBerlinLocal(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01T00:30')
  })
})

describe('Berliner Ortszeit → UTC (für Discord)', () => {
  it('Winterzeit: eine Stunde zurück', () => {
    expect(berlinToUtcIso('2026-11-20T18:00')).toBe('2026-11-20T17:00:00.000Z')
  })

  it('Sommerzeit: zwei Stunden zurück', () => {
    expect(berlinToUtcIso('2027-07-10T12:30')).toBe('2027-07-10T10:30:00.000Z')
  })

  it('rund um die Zeitumstellung', () => {
    expect(berlinToUtcIso('2026-03-29T01:30')).toBe('2026-03-29T00:30:00.000Z') // noch Winterzeit
    expect(berlinToUtcIso('2026-03-29T03:30')).toBe('2026-03-29T01:30:00.000Z') // schon Sommerzeit
    expect(berlinToUtcIso('2026-10-25T04:00')).toBe('2026-10-25T03:00:00.000Z') // wieder Winterzeit
  })

  it('lehnt anderes Format ab', () => {
    expect(() => berlinToUtcIso('20.11.2026 18:00')).toThrow()
  })
})

describe('Zeitraum anzeigen', () => {
  it('über mehrere Tage', () => {
    expect(formatEventRange('2026-11-20T18:00', '2026-11-22T14:00')).toBe('Fr 20.11.2026, 18:00 – So 22.11.2026, 14:00')
  })

  it('am selben Tag kürzer', () => {
    expect(formatEventRange('2026-11-20T18:00', '2026-11-20T23:30')).toBe('Fr 20.11.2026, 18:00–23:30')
  })
})
