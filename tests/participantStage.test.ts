import { describe, expect, it } from 'vitest'
import { compareByStage, inStageGroup, reachOf, stageOf, STAGES, unreached, type ReachInput } from '../shared/utils/participantStage'

describe('Stand', () => {
  it('Ablauf: offen → eingeladen → zugesagt → platziert → gebucht', () => {
    expect(stageOf({ registered: true, status: 'offen' })).toBe('offen')
    expect(stageOf({ registered: true, status: 'offen', contacted: true })).toBe('eingeladen')
    expect(stageOf({ registered: true, status: 'zugesagt', seat: null })).toBe('zugesagt')
    expect(stageOf({ registered: true, status: 'zugesagt', seat: 'A-81', booking: 'offen' })).toBe('platziert')
    expect(stageOf({ registered: true, status: 'zugesagt', seat: 'A-81', booking: 'gebucht' })).toBe('gebucht')
  })
  it('gebucht ohne Platz im Plan bleibt gebucht', () => {
    expect(stageOf({ registered: true, status: 'zugesagt', seat: null, booking: 'gebucht' })).toBe('gebucht')
  })
  it('Warteliste geht vor offen/eingeladen und abgesagt, nicht vor zugesagt', () => {
    expect(stageOf({ registered: true, status: 'offen', waitlist: true })).toBe('warteliste')
    expect(stageOf({ registered: true, status: 'offen', waitlist: true, contacted: true })).toBe('warteliste')
    expect(stageOf({ registered: true, status: 'abgesagt', contacted: true })).toBe('abgesagt')
    expect(stageOf({ registered: true, status: 'abgesagt', waitlist: true })).toBe('warteliste')
    expect(stageOf({ registered: true, status: 'zugesagt', seat: 'A-1', waitlist: true })).toBe('platziert')
  })
  it('abgesagt und nicht im Event', () => {
    expect(stageOf({ registered: true, status: 'abgesagt' })).toBe('abgesagt')
    expect(stageOf({ registered: false })).toBe('nicht')
  })
  it('sortiert nach Ablauf, dann Nick', () => {
    const rows = [
      { stage: 'nicht', nick: 'Gina' }, { stage: 'gebucht', nick: 'Anna' }, { stage: 'abgesagt', nick: 'Cem' },
      { stage: 'eingeladen', nick: 'Dana' }, { stage: 'warteliste', nick: 'Fritz' }, { stage: 'platziert', nick: 'Ben' },
      { stage: 'zugesagt', nick: 'Eli' }, { stage: 'eingeladen', nick: 'Bea' }, { stage: 'offen', nick: 'Otto' },
    ] as const
    expect([...rows].sort(compareByStage).map(r => r.nick)).toEqual(['Otto', 'Bea', 'Dana', 'Eli', 'Ben', 'Anna', 'Fritz', 'Cem', 'Gina'])
    expect(STAGES.map(s => s.key)).toEqual(['offen', 'eingeladen', 'zugesagt', 'platziert', 'gebucht', 'warteliste', 'abgesagt', 'nicht'])
  })
})

const base: ReachInput = { stage: 'zugesagt', discord: true, messages: {}, bookingReleased: false, offer: false }
const sent = { status: 'gesendet', at: '2026-10-18T10:00:00Z', error: null } as const
const failed = { status: 'fehler', at: null, error: 'Cannot send messages to this user' } as const

describe('Erreicht', () => {
  it('zugesagt: auf die Info-Nachricht kommt es an', () => {
    expect(reachOf(base)).toMatchObject({ state: 'fehlt', label: 'Info fehlt', kind: 'registrierung' })
    expect(reachOf({ ...base, messages: { registrierung: sent } })).toMatchObject({ state: 'ok', label: 'Info angekommen' })
    expect(reachOf({ ...base, messages: { registrierung: failed } })).toMatchObject({ state: 'fehler', error: failed.error })
    expect(reachOf({ ...base, messages: { registrierung: { status: 'entfallen', at: null, error: null } } }).state).toBe('ok')
  })
  it('nach Freigabe der Buchung: auf die Buchungsnachricht', () => {
    const r = reachOf({ ...base, stage: 'platziert', bookingReleased: true, messages: { registrierung: sent } })
    expect(r).toMatchObject({ state: 'fehlt', label: 'Buchung fehlt', kind: 'buchung' })
    expect(reachOf({ ...base, stage: 'platziert', bookingReleased: true, messages: { buchung: { status: 'wartet', at: null, error: null } } }).state).toBe('wartet')
  })
  it('offen: noch nicht angeschrieben ist kein Fehler; wartende oder gescheiterte Nachricht wird gezeigt', () => {
    const r = reachOf({ ...base, stage: 'offen' })
    expect(r).toMatchObject({ state: 'offen', label: 'noch nicht angeschrieben' })
    expect(unreached(r)).toBe(false)
    expect(reachOf({ ...base, stage: 'offen', messages: { erinnerung_offen: failed } })).toMatchObject({ state: 'fehler', label: 'Erinnerung: Fehler' })
    expect(reachOf({ ...base, stage: 'offen', messages: { manuell: { status: 'wartet', at: null, error: null } } })).toMatchObject({ state: 'wartet', label: 'Nachricht wartet' })
    // „entfallen“ heißt bei der Erinnerung nur: nicht mehr nötig gewesen
    expect(reachOf({ ...base, stage: 'offen', messages: { erinnerung_offen: { status: 'entfallen', at: null, error: null } } }).state).toBe('offen')
  })
  it('eingeladen: Erinnerung oder Nachricht von Hand ist angekommen', () => {
    expect(reachOf({ ...base, stage: 'eingeladen', messages: { erinnerung_offen: sent } }).label).toBe('Erinnerung angekommen')
    expect(reachOf({ ...base, stage: 'eingeladen', messages: { manuell: sent } }).label).toBe('Nachricht angekommen')
    // früher angekommen, die letzte Erinnerung scheiterte: zeigt den Fehler
    expect(reachOf({ ...base, stage: 'eingeladen', messages: { erinnerung_offen: failed, manuell: sent } }).state).toBe('fehler')
  })
  it('Warteliste: nur mit Angebot zählt das Angebot', () => {
    expect(reachOf({ ...base, stage: 'warteliste' }).state).toBe('none')
    expect(reachOf({ ...base, stage: 'warteliste', offer: true })).toMatchObject({ state: 'fehlt', label: 'Angebot fehlt' })
    expect(reachOf({ ...base, stage: 'warteliste', offer: true, messages: { angebot: sent } }).state).toBe('ok')
  })
  it('gebucht ist erledigt, auch wenn eine Nachricht scheiterte', () => {
    expect(reachOf({ ...base, stage: 'gebucht' }).state).toBe('ok')
    expect(reachOf({ ...base, stage: 'gebucht', messages: { buchung: failed } })).toMatchObject({ state: 'ok', label: 'hat gebucht' })
  })
  it('ohne Discord: nicht erreicht; abgesagt und nicht im Event: egal', () => {
    expect(unreached(reachOf({ ...base, discord: false }))).toBe(true)
    expect(reachOf({ ...base, stage: 'abgesagt', discord: false }).state).toBe('none')
    expect(reachOf({ ...base, stage: 'nicht' }).state).toBe('none')
  })
})

describe('zusammengefasste Stände', () => {
  it('„nicht gebucht“ = zugesagt oder platziert, „nicht zugesagt“ = offen oder eingeladen', () => {
    expect(STAGES.filter(s => inStageGroup(s.key, 'nicht_gebucht')).map(s => s.key)).toEqual(['zugesagt', 'platziert'])
    expect(STAGES.filter(s => inStageGroup(s.key, 'nicht_zugesagt')).map(s => s.key)).toEqual(['offen', 'eingeladen'])
  })
})
