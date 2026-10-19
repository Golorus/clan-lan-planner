import { describe, expect, it } from 'vitest'
import { checkDouble, checkMove, coveredSeats, occupancy, rowTables, seatRole, type SeatActor, type SeatHolder, type SeatRow } from '../shared/utils/seating'

// Reihe A: A-81 … A-120, Tische (A-81|A-82), (A-83|A-84) …; untere Zeile A-81 … A-100, obere A-101 … A-120
const rows: SeatRow[] = [{ letter: 'A', start: 81 }, { letter: 'B', start: 1 }]

const LEADER: SeatActor = { discordId: '1', isLeader: true, contactId: null }
const KONTAKT_ROT: SeatActor = { discordId: '2', isLeader: false, contactId: 10 }
const KONTAKT_BLAU: SeatActor = { discordId: '3', isLeader: false, contactId: 20 }
const ANNA: SeatActor = { discordId: '100', isLeader: false, contactId: null }
const FREMD: SeatActor = { discordId: '999', isLeader: false, contactId: null }

function people(): SeatHolder[] {
  return [
    { id: 1, discordId: '100', contactId: 10, seat: 'A-82', double: false }, // Anna, rot
    { id: 2, discordId: '101', contactId: 10, seat: 'A-84', double: false }, // Ben, rot
    { id: 3, discordId: '102', contactId: 20, seat: 'A-86', double: false }, // Cem, blau
    { id: 4, discordId: '103', contactId: 10, seat: null, double: false }, // Dana, rot, ohne Platz
    { id: 5, discordId: '104', contactId: 20, seat: 'A-89', double: true }, // Eli, blau, doppelt (A-89 + A-90)
    { id: 6, discordId: '2', contactId: 20, seat: 'B-2', double: false }, // die rote Kontaktperson, selbst registriert bei Blau
  ]
}

function move(actor: SeatActor, holderId: number, target: string | null, seatsOpen = true, holders = people()) {
  return checkMove({ actor, rows, holders, holderId, target, seatsOpen })
}

describe('Aufbau der Reihen', () => {
  it('40 Plätze in zwei Zeilen à 10 Tische, gezählt ab der unteren Zeile, links die niedrigere Nummer', () => {
    const [top, bottom] = rowTables(rows[0]!)
    expect(top).toHaveLength(10)
    expect(bottom).toHaveLength(10)
    expect(bottom![0]).toEqual({ left: 81, right: 82 })
    expect(bottom!.at(-1)).toEqual({ left: 99, right: 100 })
    expect(top![0]).toEqual({ left: 101, right: 102 })
    expect(top!.at(-1)).toEqual({ left: 119, right: 120 })
  })

  it('doppelt breit belegt den ganzen Tisch, aber nur von links', () => {
    expect(coveredSeats({ seat: 'A-89', double: true }, rows)).toEqual(['A-89', 'A-90'])
    expect(coveredSeats({ seat: 'A-90', double: true }, rows)).toEqual([])
    expect(occupancy(people(), rows).get('A-90')).toBe(5)
  })
})

describe('Teilnehmer', () => {
  it('setzt sich selbst auf einen freien Platz', () => {
    expect(move(ANNA, 1, 'A-99')).toEqual({ ok: true, swapWith: null, target: 'A-99' })
  })

  it('darf niemand anderen bewegen', () => {
    expect(move(ANNA, 2, 'A-99')).toMatchObject({ ok: false, status: 403 })
    expect(move(FREMD, 1, 'A-99')).toMatchObject({ ok: false, status: 403 })
  })

  it('kann keinen belegten Platz nehmen und nicht tauschen', () => {
    expect(move(ANNA, 1, 'A-84')).toMatchObject({ ok: false, status: 409 })
    expect(move(ANNA, 1, 'A-90')).toMatchObject({ ok: false, status: 409 }) // rechte Hälfte von Elis Doppelplatz
  })

  it('kann seinen Platz freigeben', () => {
    expect(move(ANNA, 1, null)).toMatchObject({ ok: true, target: null })
  })

  it('darf nach der Platzwahl nichts mehr ändern', () => {
    expect(move(ANNA, 1, 'A-99', false)).toMatchObject({ ok: false, status: 403 })
  })

  it('kann keine Plätze außerhalb der Reihen nehmen', () => {
    expect(move(ANNA, 1, 'A-121')).toMatchObject({ ok: false, status: 400 })
    expect(move(ANNA, 1, 'Z-1')).toMatchObject({ ok: false, status: 400 })
    expect(move(ANNA, 1, 'quatsch')).toMatchObject({ ok: false, status: 400 })
  })
})

describe('Kontaktperson', () => {
  it('setzt ihre eigenen Leute auf freie Plätze', () => {
    expect(move(KONTAKT_ROT, 4, 'A-99')).toMatchObject({ ok: true, target: 'A-99' })
    expect(move(KONTAKT_ROT, 2, 'A-99')).toMatchObject({ ok: true })
  })

  it('tauscht ihre eigenen Leute untereinander', () => {
    expect(move(KONTAKT_ROT, 1, 'A-84')).toEqual({ ok: true, swapWith: 2, target: 'A-84' })
  })

  it('darf Leute anderer Kontaktpersonen nicht bewegen', () => {
    expect(move(KONTAKT_ROT, 3, 'A-99')).toMatchObject({ ok: false, status: 403 })
    expect(move(KONTAKT_BLAU, 1, 'A-99')).toMatchObject({ ok: false, status: 403 })
  })

  it('darf eigene Leute nicht mit Leuten anderer Kontaktpersonen tauschen', () => {
    expect(move(KONTAKT_ROT, 1, 'A-86')).toMatchObject({ ok: false, status: 403 })
  })

  it('bleibt bei der eigenen Registrierung Teilnehmerin (sie gehört zu Blau)', () => {
    // Ihre eigene Registrierung darf sie wie jeder Teilnehmer umsetzen …
    expect(move(KONTAKT_ROT, 6, 'B-9')).toMatchObject({ ok: true })
    // … aber Blau darf sie als Kontaktperson ebenfalls bewegen
    expect(move(KONTAKT_BLAU, 6, 'B-9')).toMatchObject({ ok: true })
  })

  it('darf nach der Platzwahl nicht mehr umsetzen (nur die Orga)', () => {
    expect(move(KONTAKT_ROT, 4, 'A-99', false)).toMatchObject({ ok: false, status: 403 })
  })

  it('kann niemanden ohne Platz gegen einen Belegten tauschen', () => {
    expect(move(KONTAKT_ROT, 4, 'A-82')).toMatchObject({ ok: false, status: 409 })
  })
})

describe('Projektleiter', () => {
  it('darf alle bewegen und tauschen', () => {
    expect(move(LEADER, 3, 'A-99')).toMatchObject({ ok: true })
    expect(move(LEADER, 1, 'A-86')).toEqual({ ok: true, swapWith: 3, target: 'A-86' })
    expect(move(LEADER, 3, null, false)).toMatchObject({ ok: true })
  })

  it('kann nicht verschieden breite Plätze tauschen', () => {
    expect(move(LEADER, 1, 'A-89')).toMatchObject({ ok: false, status: 409 })
  })

  it('setzt doppelt breite Plätze nur links und nur auf freie Tische', () => {
    expect(move(LEADER, 5, 'A-99')).toMatchObject({ ok: true })
    expect(move(LEADER, 5, 'A-100')).toMatchObject({ ok: false, status: 409 }) // rechts
    expect(move(LEADER, 5, 'A-81')).toMatchObject({ ok: false, status: 409 }) // A-82 ist belegt
  })

  it('stellt nur um, wenn der Tisch frei ist', () => {
    expect(checkDouble(rows, people(), 1, true)).toMatchObject({ ok: false }) // A-82 ist rechts
    expect(checkDouble(rows, [...people(), { id: 7, discordId: null, contactId: null, seat: 'A-95', double: false }], 7, true)).toMatchObject({ ok: true })
    expect(checkDouble(rows, [...people(), { id: 7, discordId: null, contactId: null, seat: 'A-95', double: false }, { id: 8, discordId: null, contactId: null, seat: 'A-96', double: false }], 7, true)).toMatchObject({ ok: false })
    expect(checkDouble(rows, people(), 5, false)).toEqual({ ok: true })
  })
})

describe('Rollen', () => {
  it('Projektleiter vor Kontaktperson vor Teilnehmer', () => {
    expect(seatRole(LEADER, { discordId: '100', contactId: 10 })).toBe('leader')
    expect(seatRole(KONTAKT_ROT, { discordId: '100', contactId: 10 })).toBe('contact')
    expect(seatRole(ANNA, { discordId: '100', contactId: 10 })).toBe('self')
    expect(seatRole(FREMD, { discordId: '100', contactId: 10 })).toBeNull()
    // ohne Discord-ID (Import) darf niemand außer Orga/Kontakt ran
    expect(seatRole({ discordId: '', isLeader: false, contactId: null }, { discordId: null, contactId: null })).toBeNull()
  })
})

describe('Platzwechsel nach dem Nachrücken', () => {
  const withSwap = () => people().map(p => p.id === 1 ? { ...p, swapLeft: true } : p)
  it('wechselt einmal auf einen freien Platz, auch nach der Platzwahl', () => {
    expect(move(ANNA, 1, 'A-99', false, withSwap())).toMatchObject({ ok: true, target: 'A-99', usedSwap: true })
  })
  it('tauscht dabei nicht mit Belegten und gibt den Platz nicht frei', () => {
    expect(move(ANNA, 1, 'A-84', false, withSwap())).toMatchObject({ ok: false, status: 409 })
    expect(move(ANNA, 1, null, false, withSwap())).toMatchObject({ ok: false, status: 403 })
  })
  it('gilt nur für die Person selbst', () => {
    expect(move(KONTAKT_ROT, 1, 'A-99', false, withSwap())).toMatchObject({ ok: false, status: 403 })
  })
  it('der Projektleiter darf nach der Platzwahl weiter alles', () => {
    expect(move(LEADER, 1, 'A-99', false)).toMatchObject({ ok: true })
    expect(move(LEADER, 1, 'A-99', false)).not.toHaveProperty('usedSwap')
  })
})

describe('Fixierter Bereich', () => {
  // gemeldet: A-81 … A-100; Anna (A-82) sitzt drin, Dana hat keinen Platz
  const area = new Set(Array.from({ length: 20 }, (_, i) => `A-${81 + i}`))
  const moveIn = (actor: SeatActor, id: number, target: string | null, holders = people()) =>
    checkMove({ actor, rows, holders, holderId: id, target, seatsOpen: false, area })
  it('wer keinen Platz hat, setzt sich auf einen freien Platz im Bereich', () => {
    expect(moveIn({ discordId: '103', isLeader: false, contactId: null }, 4, 'A-95')).toMatchObject({ ok: true })
  })
  it('Kontaktpersonen setzen und tauschen ihre Leute frei im Bereich', () => {
    expect(moveIn(KONTAKT_ROT, 4, 'A-95')).toMatchObject({ ok: true, target: 'A-95' })
    expect(moveIn(KONTAKT_ROT, 1, 'A-95')).toMatchObject({ ok: true, target: 'A-95' })
    expect(moveIn(KONTAKT_ROT, 1, 'A-84')).toMatchObject({ ok: true, swapWith: 2 })
    expect(moveIn(KONTAKT_ROT, 1, null)).toMatchObject({ ok: true, target: null })
  })
  it('aber nicht mit Leuten anderer Kontaktpersonen', () => {
    expect(moveIn(KONTAKT_ROT, 1, 'A-86')).toMatchObject({ ok: false, status: 403 })
    expect(moveIn(KONTAKT_ROT, 3, 'A-95')).toMatchObject({ ok: false, status: 403 })
  })
  it('nicht außerhalb des Bereichs', () => {
    expect(moveIn(KONTAKT_ROT, 4, 'A-110')).toMatchObject({ ok: false, status: 403 })
    expect(moveIn(KONTAKT_ROT, 4, 'B-10')).toMatchObject({ ok: false, status: 403 })
  })
  it('wer schon sitzt, bleibt dort (auch nicht freigeben)', () => {
    expect(moveIn(ANNA, 1, 'A-95')).toMatchObject({ ok: false, status: 403 })
    expect(moveIn(ANNA, 1, null)).toMatchObject({ ok: false, status: 403 })
  })
  it('bis zum Buchungsstart setzt man sich selbst im Bereich um, aber nicht auf belegte Plätze und nicht hinaus', () => {
    const open = (target: string | null) => checkMove({ actor: ANNA, rows, holders: people(), holderId: 1, target, seatsOpen: true, area })
    expect(open('A-95')).toMatchObject({ ok: true, target: 'A-95', swapWith: null })
    expect(open(null)).toMatchObject({ ok: true, target: null })
    expect(open('A-84')).toMatchObject({ ok: false, status: 409 })
    expect(open('A-110')).toMatchObject({ ok: false, status: 403 })
  })
  it('gebucht bleibt gebucht, auch während der Platzwahl', () => {
    const holders = people().map(p => p.id === 1 ? { ...p, booked: true } : p)
    expect(checkMove({ actor: ANNA, rows, holders, holderId: 1, target: 'A-95', seatsOpen: true, area })).toMatchObject({ ok: false, status: 403 })
  })
  it('belegte Plätze im Bereich gehen nicht, wenn man selbst keinen Platz hat', () => {
    expect(moveIn({ discordId: '103', isLeader: false, contactId: null }, 4, 'A-84')).toMatchObject({ ok: false, status: 409 })
  })
  it('doppelt breit nur, wenn der ganze Tisch im Bereich liegt', () => {
    const holders = people().map(p => p.id === 4 ? { ...p, double: true } : p)
    expect(moveIn(KONTAKT_ROT, 4, 'A-99', holders)).toMatchObject({ ok: true })
    expect(checkMove({ actor: KONTAKT_ROT, rows, holders, holderId: 4, target: 'A-99', seatsOpen: false, area: new Set(['A-99']) })).toMatchObject({ ok: false, status: 403 })
  })
  it('nachgerückt mit Platz: einmal tauschen, aber nur im Bereich', () => {
    const holders = people().map(p => p.id === 1 ? { ...p, swapLeft: true } : p)
    expect(moveIn(ANNA, 1, 'A-95', holders)).toMatchObject({ ok: true, usedSwap: true })
    expect(moveIn(ANNA, 1, 'A-110', holders)).toMatchObject({ ok: false, status: 403 })
  })
  it('die Orga darf weiter alles', () => {
    expect(moveIn(LEADER, 1, 'B-10')).toMatchObject({ ok: true })
  })
})

describe('Gebucht (personalisiertes Ticket)', () => {
  const booked = () => people().map(p => p.id === 1 ? { ...p, booked: true } : p)
  it('Kontaktperson und die Person selbst setzen nicht mehr um', () => {
    expect(move(KONTAKT_ROT, 1, 'A-99', true, booked())).toMatchObject({ ok: false, status: 403 })
    expect(move(ANNA, 1, 'A-99', true, booked())).toMatchObject({ ok: false, status: 403 })
    expect(move(ANNA, 1, null, true, booked())).toMatchObject({ ok: false, status: 403 })
  })
  it('auch nicht über den einmaligen Tausch nach dem Nachrücken', () => {
    const h = booked().map(p => p.id === 1 ? { ...p, swapLeft: true } : p)
    expect(move(ANNA, 1, 'A-99', false, h)).toMatchObject({ ok: false, status: 403 })
  })
  it('niemand tauscht mit jemandem, der gebucht hat', () => {
    expect(move(KONTAKT_ROT, 2, 'A-82', true, booked())).toMatchObject({ ok: false, status: 403 })
  })
  it('die Orga darf weiter', () => {
    expect(move(LEADER, 1, 'A-99', true, booked())).toMatchObject({ ok: true })
    expect(move(LEADER, 2, 'A-82', true, booked())).toMatchObject({ ok: true, swapWith: 1 })
  })
})
