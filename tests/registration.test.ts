import { describe, expect, it } from 'vitest'
import {
  autoReleaseDue, bookingStarted, checkStatus, checkWaitlist, countdown, currentReminder, deadlineMs, demandPhase, dueReminders, isFull, normaliseSeat,
  parseDays, seatsOpen, sortWaitlist, waitlistActive, type EventRules, type ReminderEvent, type ReminderPerson,
} from '../shared/utils/registration'

// Bedarfsabfrage bis Fr 20.11.2026 18:00 Berlin = 17:00 UTC
const DEMAND = '2026-11-20T18:00'
const DEADLINE = Date.parse('2026-11-20T17:00:00Z')
const at = (iso: string) => new Date(iso)
const DAY = 24 * 60 * 60 * 1000

const ev = (o: Partial<EventRules> = {}): EventRules => ({
  registrationOpen: true, demandClosedAt: null, demandUntil: DEMAND, bookingFrom: '', bookingUntil: '', bookingReleased: false, maxParticipants: null, ...o,
})

describe('Fristen', () => {
  it('rechnet Berliner Ortszeit in einen Zeitpunkt um', () => {
    expect(deadlineMs(DEMAND)).toBe(DEADLINE)
    expect(deadlineMs('')).toBeNull()
    expect(deadlineMs('quatsch')).toBeNull()
  })
})

describe('Phasen der Bedarfsabfrage', () => {
  it('läuft bis zur Frist', () => {
    expect(demandPhase(ev(), at('2026-11-20T16:59:00Z'))).toBe('abfrage')
    expect(demandPhase(ev(), at('2026-11-20T17:00:00Z'))).toBe('nachher')
  })
  it('vorzeitig schließen beendet sie sofort', () => {
    expect(demandPhase(ev({ registrationOpen: false, demandClosedAt: at('2026-11-01T10:00:00Z') }), at('2026-11-02T00:00:00Z'))).toBe('nachher')
  })
  it('noch nie geöffnet ist vorher, nicht nachher', () => {
    expect(demandPhase(ev({ registrationOpen: false }), at('2026-11-01T00:00:00Z'))).toBe('vorher')
  })
  it('ohne Frist gilt nur der Schalter', () => {
    expect(demandPhase(ev({ demandUntil: '' }), at('2030-01-01T00:00:00Z'))).toBe('abfrage')
  })
  it('die Frist gilt auch, wenn nie geöffnet wurde', () => {
    expect(demandPhase(ev({ registrationOpen: false }), at('2026-11-21T00:00:00Z'))).toBe('nachher')
  })
})

describe('Zusagen, Absagen, Warteliste', () => {
  const before = at('2026-11-10T12:00:00Z'), after = at('2026-11-21T12:00:00Z')
  it('Zusagen nur während der Bedarfsabfrage', () => {
    expect(checkStatus('self', ev(), before, 0, 'offen', 'zugesagt')).toEqual({ ok: true })
    expect(checkStatus('self', ev(), after, 0, 'offen', 'zugesagt')).toMatchObject({ ok: false, waitlist: true })
    expect(checkStatus('self', ev({ registrationOpen: false }), before, 0, 'offen', 'zugesagt')).toMatchObject({ ok: false, status: 403 })
  })
  it('Absagen geht immer, auch nach der Frist', () => {
    expect(checkStatus('self', ev(), after, 0, 'zugesagt', 'abgesagt')).toEqual({ ok: true })
    expect(checkStatus('contact', ev(), after, 0, 'zugesagt', 'abgesagt')).toEqual({ ok: true })
  })
  it('der Projektleiter darf alles', () => {
    expect(checkStatus('leader', ev(), after, 99, 'abgesagt', 'zugesagt')).toEqual({ ok: true })
    expect(checkStatus('leader', ev(), after, 0, 'abgesagt', 'offen')).toEqual({ ok: true })
  })
  it('Kontaktpersonen sagen nicht für andere zu, offen setzt nur die Orga', () => {
    expect(checkStatus('contact', ev(), before, 0, 'offen', 'zugesagt')).toMatchObject({ ok: false, status: 403 })
    expect(checkStatus('self', ev(), before, 0, 'abgesagt', 'offen')).toMatchObject({ ok: false, status: 403 })
  })
  it('Höchstzahl erreicht: Warteliste schon vor der Frist', () => {
    const full = ev({ maxParticipants: 2 })
    expect(isFull(full, 2)).toBe(true)
    expect(checkStatus('self', full, before, 2, 'offen', 'zugesagt')).toMatchObject({ ok: false, waitlist: true })
    expect(waitlistActive(full, before, 1)).toBe(false)
    expect(waitlistActive(full, before, 2)).toBe(true)
  })
  it('fixierter Bereich begrenzt die Zusagen auf seine Plätze', () => {
    expect(isFull(ev({ areaSize: 30 }), 29)).toBe(false)
    expect(isFull(ev({ areaSize: 30 }), 30)).toBe(true)
    expect(isFull(ev({ areaSize: 30, maxParticipants: 20 }), 20)).toBe(true)
    expect(waitlistActive(ev({ areaSize: 2 }), before, 2)).toBe(true)
  })
  it('keine Warteliste vor dem Ende der Bedarfsabfrage', () => {
    expect(checkWaitlist(ev(), before, 0, 'offen', false)).toMatchObject({ ok: false, status: 409 })
    expect(checkWaitlist(ev(), after, 0, 'offen', false)).toEqual({ ok: true })
    expect(checkWaitlist(ev(), after, 0, 'abgesagt', false)).toEqual({ ok: true })
    expect(checkWaitlist(ev(), after, 0, 'zugesagt', false)).toMatchObject({ ok: false })
    expect(checkWaitlist(ev(), after, 0, 'offen', true)).toMatchObject({ ok: false })
  })
  it('Reihenfolge: von Hand gesetzte Ränge, sonst Zeitpunkt des Eintrags', () => {
    const list = [
      { id: 1, waitlistAt: at('2026-11-21T10:00:00Z'), waitlistRank: null },
      { id: 2, waitlistAt: at('2026-11-21T09:00:00Z'), waitlistRank: null },
      { id: 3, waitlistAt: at('2026-11-21T11:00:00Z'), waitlistRank: 1 },
      { id: 4, waitlistAt: null, waitlistRank: null },
    ]
    expect(sortWaitlist(list).map(e => e.id)).toEqual([3, 2, 1])
  })
})

describe('Platzwahl', () => {
  // Buchungsstart Fr 27.11.2026 18:00 Berlin = 17:00 UTC
  const START = '2026-11-27T18:00'
  it('läuft über die Bedarfsabfrage hinaus bis zum Buchungsstart, auf die Minute', () => {
    const e = ev({ bookingFrom: START })
    expect(seatsOpen(e, at('2026-11-10T10:00:00Z'))).toBe(true)
    expect(seatsOpen(e, at('2026-11-21T10:00:00Z'))).toBe(true)
    expect(seatsOpen(e, at('2026-11-27T16:59:00Z'))).toBe(true)
    expect(seatsOpen(e, at('2026-11-27T17:00:00Z'))).toBe(false)
  })
  it('ohne Buchungsstart offen bis zur Freigabe; vorher (nie geöffnet) zu', () => {
    expect(seatsOpen(ev(), at('2026-12-20T10:00:00Z'))).toBe(true)
    expect(seatsOpen(ev({ bookingReleased: true }), at('2026-11-10T10:00:00Z'))).toBe(false)
    expect(seatsOpen(ev({ registrationOpen: false }), at('2026-11-01T00:00:00Z'))).toBe(false)
  })
  it('von Hand vorgezogene Freigabe beendet die Platzwahl sofort', () => {
    expect(seatsOpen(ev({ bookingFrom: START, bookingReleased: true }), at('2026-11-21T10:00:00Z'))).toBe(false)
  })
  it('der Takt gibt genau ab dem Buchungsstart frei, und nur einmal', () => {
    const e = ev({ bookingFrom: START })
    expect(autoReleaseDue(e, at('2026-11-27T16:59:00Z'))).toBe(false)
    expect(autoReleaseDue(e, at('2026-11-27T17:00:00Z'))).toBe(true)
    expect(autoReleaseDue({ ...e, bookingReleased: true }, at('2026-11-27T17:00:00Z'))).toBe(false)
    expect(autoReleaseDue(ev(), at('2030-01-01T00:00:00Z'))).toBe(false)
    expect(bookingStarted(e, at('2026-11-27T17:00:00Z'))).toBe(true)
  })
})

describe('Erinnerungen', () => {
  it('nimmt den jüngsten erreichten Zeitpunkt und überspringt verpasste', () => {
    expect(currentReminder([14, 7, 2], DEADLINE, new Date(DEADLINE - 15 * DAY))).toBeNull()
    expect(currentReminder([14, 7, 2], DEADLINE, new Date(DEADLINE - 14 * DAY))).toBe(14)
    expect(currentReminder([14, 7, 2], DEADLINE, new Date(DEADLINE - 5 * DAY))).toBe(7)
    expect(currentReminder([14, 7, 2], DEADLINE, new Date(DEADLINE - 1 * DAY))).toBe(2)
    expect(currentReminder([14, 7, 2], DEADLINE, new Date(DEADLINE))).toBeNull()
    expect(currentReminder([], DEADLINE, new Date(DEADLINE - DAY))).toBeNull()
  })

  const rev = (o: Partial<ReminderEvent> = {}): ReminderEvent => ({
    ...ev(), id: 7, remindDays: [14, 7, 2], bookingRemindDays: [7, 2], ...o,
  })
  const person = (o: Partial<ReminderPerson>): ReminderPerson => ({
    id: 1, status: 'offen', seat: null, booking: 'offen', remindersOff: false, discordId: '100', onWaitlist: false, ...o,
  })

  it('erinnert Offene vor dem Ende der Bedarfsabfrage, mit eindeutigem Schlüssel', () => {
    const now = new Date(DEADLINE - 6 * DAY)
    const due = dueReminders(rev(), [person({ id: 1 }), person({ id: 2, status: 'abgesagt' }), person({ id: 3, remindersOff: true }), person({ id: 4, discordId: null })], now)
    expect(due).toEqual([{ registrationId: 1, kind: 'erinnerung_offen', key: 'offen:7:1:7' }])
  })
  it('erinnert Zugesagte ohne Platz an den Buchungsstart, auch nach der Bedarfsabfrage', () => {
    const now = at('2026-11-26T17:00:00Z')
    expect(dueReminders(rev(), [person({ id: 5, status: 'zugesagt' })], now)).toEqual([])
    const due = dueReminders(rev({ bookingFrom: '2026-11-27T18:00' }), [person({ id: 5, status: 'zugesagt' }), person({ id: 6, status: 'zugesagt', seat: 'A-81' })], now)
    expect(due).toEqual([{ registrationId: 5, kind: 'erinnerung_platz', key: 'platz:7:5:2' }])
  })
  it('erinnert Zugesagte ohne Buchung erst nach der Freigabe', () => {
    const booking = rev({ bookingUntil: '2026-12-01T12:00', demandUntil: '2026-11-01T12:00' })
    const now = at('2026-11-25T12:00:00Z')
    const people = [person({ id: 8, status: 'zugesagt', seat: 'A-81' }), person({ id: 9, status: 'zugesagt', seat: 'A-83', booking: 'gebucht' })]
    expect(dueReminders(booking, people, now)).toEqual([])
    expect(dueReminders({ ...booking, bookingReleased: true }, people, now)).toEqual([{ registrationId: 8, kind: 'erinnerung_buchung', key: 'buchung:7:8:7' }])
  })
  it('liest die Tage aus /orga', () => {
    expect(parseDays('14, 7 2;2 x 0 100')).toEqual([14, 7, 2])
    expect(parseDays([2, 7])).toEqual([7, 2])
  })
})

describe('Anzeige', () => {
  it('Countdown', () => {
    expect(countdown(DEADLINE, new Date(DEADLINE - 3 * DAY - 4 * 3600_000))).toBe('3 Tage 4 Std.')
    expect(countdown(DEADLINE, new Date(DEADLINE - DAY))).toBe('1 Tag')
    expect(countdown(DEADLINE, new Date(DEADLINE - 5 * 3600_000 - 12 * 60_000))).toBe('5 Std. 12 Min.')
    expect(countdown(DEADLINE, new Date(DEADLINE + 1))).toBe('vorbei')
    expect(countdown(null, new Date())).toBe('')
  })
  it('Platz-ID aus der Eingabe', () => {
    expect(normaliseSeat('a 81')).toBe('A-81')
    expect(normaliseSeat('AB-7')).toBe('AB-7')
    expect(normaliseSeat('A81')).toBe('A-81')
    expect(normaliseSeat('Tisch 3')).toBeNull()
  })
})
