import { describe, expect, it } from 'vitest'
import { buildChecklist, lanStatus, MISSED_HINT, type ChecklistEvent, type ChecklistMe } from '../shared/utils/checklist'

// Bedarfsmeldung bis Do 29.10.2026 18:00 (Winterzeit = 17:00 UTC), Buchungsstart Do 12.11. 18:00 (= Ende der Platzwahl),
// buchen bis Fr 20.11. 20:00, LAN 27.–29.11.
const ev = (o: Partial<ChecklistEvent> = {}): ChecklistEvent => ({
  startsAt: '2026-11-27T12:00', endsAt: '2026-11-29T16:00', location: 'Messehalle',
  registrationOpen: true, demandClosedAt: null,
  demandUntil: '2026-10-29T18:00', bookingFrom: '2026-11-12T18:00', bookingUntil: '2026-11-20T20:00',
  maxParticipants: null, areaSize: null, areaFixed: false,
  bookingReleased: false, bookingReleasedAt: null,
  ...o,
})
const me = (o: Partial<ChecklistMe> = {}): ChecklistMe => ({
  status: null, seat: null, swapLeft: false, waitlistPosition: null, offer: null, booking: null,
  isMember: true, roleMissing: false, contactId: null, ...o,
})
// Sa 17.10.2026 18:00 Berlin (Sommerzeit)
const NOW = new Date('2026-10-17T16:00:00Z')
const AFTER_DEMAND = new Date('2026-11-02T10:00:00Z')
const BOOKING = new Date('2026-11-14T10:00:00Z')
const released = (o: Partial<ChecklistEvent> = {}) => ev({ areaFixed: true, areaSize: 20, bookingReleased: true, bookingReleasedAt: '2026-11-12T17:00:00.000Z', ...o })
const state = (list: ReturnType<typeof buildChecklist>) => Object.fromEntries(list.steps.map(s => [s.key, s.state]))
const seg = (list: ReturnType<typeof buildChecklist>) => list.timeline.segments.map(s => s.state)

describe('Zählung: nur die eigenen Schritte', () => {
  it('zusagen, Platz, buchen; Orga-Schritte stehen dabei, zählen aber nicht', () => {
    const c = buildChecklist(ev(), me({ status: 'zugesagt', seat: 'A-1' }), 1, NOW)
    expect(c.steps.map(s => s.key)).toEqual(['zusage', 'platz', 'bereich', 'buchungsstart', 'buchung'])
    expect(c.steps.filter(s => s.orga).map(s => s.key)).toEqual(['bereich', 'buchungsstart'])
    expect([c.done, c.total]).toEqual([2, 3])
  })
  it('Discord-Beitritt zählt nur mit, wenn er gezeigt wird', () => {
    expect(buildChecklist(ev(), me({ isMember: false }), 0, NOW).total).toBe(4)
    expect(buildChecklist(ev(), me({ isMember: null }), 0, NOW).steps.some(s => s.key === 'discord')).toBe(false)
  })
  it('Orga-Schritte sind nie jetzt dran oder verpasst', () => {
    for (const [e, now] of [[ev(), NOW], [ev(), AFTER_DEMAND], [ev({ areaFixed: true }), AFTER_DEMAND], [released(), BOOKING]] as const) {
      for (const s of buildChecklist(e, me({ status: 'zugesagt' }), 1, now).steps.filter(x => x.orga)) expect(['done', 'later']).toContain(s.state)
    }
  })
})

describe('Phase vorher', () => {
  it('alles kommt noch', () => {
    const c = buildChecklist(ev({ registrationOpen: false }), me(), 0, NOW)
    expect(state(c)).toEqual({ zusage: 'later', platz: 'later', bereich: 'later', buchungsstart: 'later', buchung: 'later' })
    expect(c.focus?.kind).toBe('next')
    expect(c.timeline.summary).toBe('Bedarfsmeldung startet bald · Platzwahl bis 12.11. · Buchen bis 20.11.')
    expect(seg(c)).toEqual(['future', 'future', 'future', 'future'])
    expect(c.timeline.marker).toBe(0)
  })
})

describe('Bedarfsmeldung läuft', () => {
  it('offen: Zusagen ist jetzt dran mit Frist und Restzeit', () => {
    const c = buildChecklist(ev(), me({ status: 'offen' }), 3, NOW)
    expect(c.focus?.step).toMatchObject({ key: 'zusage', state: 'now', action: 'zusagen', dueText: 'bis Do 29.10.2026, 18:00', left: 'noch 12 Tage 1 Std.' })
    expect(c.timeline.summary).toBe('Bedarfsmeldung noch 12 Tage · Platzwahl bis 12.11. · Buchen bis 20.11.')
    expect(c.timeline.short).toBe('Bedarfsmeldung noch 12 Tage')
    expect(c.timeline.segments.map(s => [s.key, s.label, s.date, s.state])).toEqual([
      ['bedarf', 'Bedarfsmeldung', 'bis 29.10.', 'current'],
      ['platzwahl', 'Platzwahl', 'bis 12.11.', 'future'],
      ['buchung', 'Buchung', '12.11.–20.11.', 'future'],
      ['lan', 'LAN', '27.11.–29.11.', 'future'],
    ])
  })
  it('mit Platz: Hinweis, dass Umsetzen bis zum Buchungsstart geht; gebucht nicht mehr', () => {
    expect(buildChecklist(ev(), me({ status: 'zugesagt', seat: 'A-1' }), 1, NOW).steps.find(s => s.key === 'platz')?.detail).toBe('Umsetzen kannst du dich selbst bis Do 12.11.2026, 18:00.')
    expect(buildChecklist(ev(), me({ status: 'zugesagt', seat: 'A-1', booking: { status: 'gebucht', bookedSeat: null } }), 1, NOW).steps.find(s => s.key === 'platz')?.detail).toBeUndefined()
  })
  it('zugesagt ohne Platz: Platz wählen bis zum Buchungsstart', () => {
    const c = buildChecklist(ev(), me({ status: 'zugesagt' }), 3, NOW)
    expect(c.focus?.step).toMatchObject({ key: 'platz', state: 'now', action: 'platz', dueText: 'bis Do 12.11.2026, 18:00' })
  })
  it('alle Plätze vergeben: Warteliste statt Zusage', () => {
    const c = buildChecklist(ev({ maxParticipants: 3 }), me({ status: 'offen' }), 3, NOW)
    expect(c.focus?.step).toMatchObject({ key: 'zusage', state: 'now', action: 'warteliste' })
  })
  it('ohne geplanten Buchungsstart: Platzwahl ohne Frist, „Buchungsstart folgt“', () => {
    const c = buildChecklist(ev({ bookingFrom: '' }), me({ status: 'zugesagt' }), 3, NOW)
    expect(c.focus?.step.dueText).toBeUndefined()
    expect(c.steps.find(s => s.key === 'buchungsstart')?.detail).toBe('Termin folgt.')
    expect(c.timeline.summary).toContain('Buchungsstart folgt')
  })
})

describe('Platzwahl nach der Bedarfsmeldung', () => {
  it('ohne Platz: weiter jetzt dran, Abschnitt Platzwahl läuft', () => {
    const c = buildChecklist(ev(), me({ status: 'zugesagt' }), 3, AFTER_DEMAND)
    expect(state(c).platz).toBe('now')
    expect(seg(c)).toEqual(['past', 'current', 'future', 'future'])
    expect(c.timeline.summary).toBe('Platzwahl noch 10 Tage · Buchen bis 20.11.')
  })
  it('offen geblieben: Zusage verpasst, Warteliste möglich', () => {
    const c = buildChecklist(ev(), me({ status: 'offen' }), 3, AFTER_DEMAND)
    expect(c.focus?.step).toMatchObject({ key: 'zusage', state: 'missed', action: 'warteliste', detail: MISSED_HINT })
  })
  it('vorzeitig geschlossen: Ende ist der Zeitpunkt des Schließens', () => {
    const c = buildChecklist(ev({ registrationOpen: false, demandClosedAt: '2026-10-20T08:00:00.000Z' }), me({ status: 'offen' }), 3, new Date('2026-10-21T10:00:00Z'))
    expect(state(c).zusage).toBe('missed')
    expect(c.timeline.segments[0]).toMatchObject({ key: 'bedarf', date: 'bis 20.10.', state: 'past' })
  })
  it('Bereich geblockt: Orga-Info erledigt, Platz im Bereich', () => {
    const c = buildChecklist(ev({ areaFixed: true, areaSize: 10 }), me({ status: 'zugesagt' }), 5, AFTER_DEMAND)
    expect(state(c)).toMatchObject({ platz: 'now', bereich: 'done', buchungsstart: 'later' })
    expect(c.focus?.step.detail).toContain('Im gemeldeten Bereich')
  })
})

describe('genau an der Frist (auf die Minute wie im Backend)', () => {
  it('Zusage: eine Minute vorher dran, genau an der Frist verpasst', () => {
    const before = new Date('2026-10-29T16:59:00Z'), at = new Date('2026-10-29T17:00:00Z')
    expect(buildChecklist(ev(), me({ status: 'offen' }), 0, before).focus?.step).toMatchObject({ key: 'zusage', state: 'now', left: 'noch 1 Min.' })
    expect(state(buildChecklist(ev(), me({ status: 'offen' }), 0, at)).zusage).toBe('missed')
  })
  it('Platzwahl endet genau mit dem Buchungsstart, auch wenn der Takt noch nicht freigegeben hat', () => {
    const before = new Date('2026-11-12T16:59:00Z'), at = new Date('2026-11-12T17:00:00Z')
    expect(state(buildChecklist(ev(), me({ status: 'zugesagt' }), 1, before)).platz).toBe('now')
    const c = buildChecklist(ev(), me({ status: 'zugesagt' }), 1, at)
    expect(state(c).platz).toBe('missed')
    expect(seg(c)).toEqual(['past', 'past', 'current', 'future'])
  })
  it('Buchen genau an der Frist verpasst', () => {
    const m = me({ status: 'zugesagt', seat: 'A-1', booking: { status: 'offen', bookedSeat: null } })
    expect(state(buildChecklist(released(), m, 1, new Date('2026-11-20T18:59:00Z'))).buchung).toBe('now')
    expect(state(buildChecklist(released(), m, 1, new Date('2026-11-20T19:00:00Z'))).buchung).toBe('missed')
  })
})

describe('Buchung', () => {
  it('freigegeben, nicht gemeldet: Buchen und melden ist dran', () => {
    const c = buildChecklist(released(), me({ status: 'zugesagt', seat: 'A-1', booking: { status: 'offen', bookedSeat: null } }), 5, BOOKING)
    expect(state(c)).toEqual({ zusage: 'done', platz: 'done', bereich: 'done', buchungsstart: 'done', buchung: 'now' })
    expect(c.focus?.step).toMatchObject({ key: 'buchung', action: 'buchen', label: 'Buchen und hier melden', dueText: 'bis Fr 20.11.2026, 20:00' })
    expect(c.steps.find(s => s.key === 'buchungsstart')?.dueText).toBe('am Do 12.11.2026, 18:00')
    expect(c.timeline.summary).toBe('Buchen noch 6 Tage')
    expect(c.timeline.marker).toBeGreaterThan(2 / 4)
    expect(c.timeline.marker).toBeLessThan(3 / 4)
  })
  it('von Hand früher freigegeben: Platzwahl endet dort, Zeitstrahl nimmt das Datum der Freigabe', () => {
    const e = ev({ bookingReleased: true, bookingReleasedAt: '2026-11-05T09:00:00.000Z' })
    const c = buildChecklist(e, me({ status: 'zugesagt' }), 1, new Date('2026-11-06T10:00:00Z'))
    expect(state(c).platz).toBe('missed')
    expect(c.timeline.segments.find(s => s.key === 'platzwahl')).toMatchObject({ date: 'bis 05.11.', state: 'past' })
  })
  it('nach dem Buchungsstart ohne Platz: im Bereich noch wählen', () => {
    expect(state(buildChecklist(released(), me({ status: 'zugesagt', booking: { status: 'offen', bookedSeat: null } }), 5, BOOKING)).platz).toBe('now')
  })
  it('gemeldet: alles erledigt; abweichender Platz ist eine Warnung', () => {
    const ok = buildChecklist(released(), me({ status: 'zugesagt', seat: 'A-1', booking: { status: 'gebucht', bookedSeat: 'A-1' } }), 5, BOOKING)
    expect([ok.done, ok.total]).toEqual([3, 3])
    expect(ok.focus).toBeNull()
    const off = buildChecklist(released(), me({ status: 'zugesagt', seat: 'A-1', booking: { status: 'gebucht', bookedSeat: 'A-2' } }), 5, BOOKING)
    expect(off.steps.find(s => s.key === 'buchung')).toMatchObject({ state: 'done', label: 'Buchung gemeldet: Platz A-2', warn: true })
  })
  it('der Buchungscode kommt in der Checkliste nicht vor', () => {
    const c = buildChecklist(released(), me({ status: 'zugesagt', seat: 'A-1', booking: { status: 'offen', bookedSeat: null, code: 'GEHEIM' } as ChecklistMe['booking'] }), 5, BOOKING)
    expect(JSON.stringify(c)).not.toContain('GEHEIM')
  })
})

describe('Sonderfälle', () => {
  it('abgesagt in der Bedarfsmeldung: eine Zeile mit Frist zum Umentscheiden', () => {
    const c = buildChecklist(ev(), me({ status: 'abgesagt' }), 3, NOW)
    expect(c.mode).toBe('abgesagt')
    expect(c.steps).toEqual([])
    expect(c.declined).toEqual({ action: 'zusagen', text: 'Du hast abgesagt. Du kannst es dir bis Do 29.10.2026, 18:00 noch anders überlegen.' })
  })
  it('abgesagt nach der Frist: auf die Warteliste', () => {
    expect(buildChecklist(ev(), me({ status: 'abgesagt' }), 3, AFTER_DEMAND).declined?.action).toBe('warteliste')
  })
  it('Warteliste: Schritt Zusage zeigt den Platz in der Liste', () => {
    const c = buildChecklist(ev(), me({ status: 'abgesagt', waitlistPosition: 2 }), 3, AFTER_DEMAND)
    expect(c.mode).toBe('liste')
    expect(c.steps.find(s => s.key === 'zusage')).toMatchObject({ state: 'later', label: 'Auf der Warteliste, Platz 2' })
  })
  it('offenes Platzangebot steht ganz oben als jetzt dran, zählt nicht mit', () => {
    const c = buildChecklist(ev(), me({ status: 'offen', waitlistPosition: 1, offer: { seat: 'B-4', expiresAt: '2026-11-03T10:00:00.000Z' } }), 3, AFTER_DEMAND)
    expect(c.steps[0]).toMatchObject({ key: 'angebot', state: 'now', action: 'angebot', label: 'Ein Platz ist frei geworden: B-4', left: 'noch 1 Tag' })
    expect(c.focus?.step.key).toBe('angebot')
    expect(c.total).toBe(3)
  })
  it('fehlende Event-Rolle: Warnung, kein Schritt; nur für Zugesagte', () => {
    const c = buildChecklist(ev(), me({ status: 'zugesagt', roleMissing: true }), 1, NOW)
    expect(c.warnings).toEqual(['Dir fehlt auf Discord die Event-Rolle. Melde dich bitte bei der Orga.'])
    expect(c.total).toBe(3)
    expect(buildChecklist(ev(), me({ status: 'offen', roleMissing: true }), 1, NOW).warnings).toEqual([])
  })
})

describe('LAN', () => {
  it('zählt Kalendertage in Berlin', () => {
    expect(lanStatus(ev(), NOW).text).toBe('noch 41 Tage bis zur LAN')
    expect(lanStatus(ev(), new Date('2026-11-26T22:59:00Z')).text).toBe('noch 1 Tag bis zur LAN')
    expect(lanStatus(ev(), new Date('2026-11-27T08:00:00Z')).text).toBe('LAN beginnt heute')
  })
  it('während der LAN Tag n von m, danach vorbei', () => {
    expect(lanStatus(ev(), new Date('2026-11-27T11:00:00Z'))).toEqual({ state: 'current', text: 'LAN läuft, Tag 1 von 3' })
    expect(lanStatus(ev(), new Date('2026-11-28T23:30:00Z')).text).toBe('LAN läuft, Tag 3 von 3')
    expect(lanStatus(ev(), new Date('2026-11-29T15:00:00Z'))).toEqual({ state: 'past', text: 'LAN vorbei' })
  })
  it('während der LAN: Zahlenzeile leer, der Kopf zeigt „Tag n von m“', () => {
    const c = buildChecklist(released(), me({ status: 'zugesagt', seat: 'A-1' }), 1, new Date('2026-11-28T10:00:00Z'))
    expect(c.timeline.summary).toBe('')
    expect(c.event.countdown).toBe('LAN läuft, Tag 2 von 3')
  })
})
