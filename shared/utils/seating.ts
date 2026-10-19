/**
 * Regeln des Sitzplans, nach dem Vorbild von d3molite/Seat-Planner (MIT-Lizenz, © Tobias Brinke):
 * Eine Reihe hat 40 Plätze ab ihrer Startnummer (Reihe A ab 1: A-1 … A-40), je zwei bilden einen Tisch.
 * Sie ist zweizeilig: Die untere Zeile beginnt mit der Startnummer (A-1 … A-20), die obere geht weiter (A-21 … A-40),
 * je 10 Tische von links nach rechts aufsteigend. Links am Tisch sitzt die niedrigere Nummer (A-1 links, A-2 rechts).
 * Ein doppelt breiter Platz liegt immer links und belegt den ganzen Tisch (A-1 mit A-2).
 *
 * Bewusst ohne Nuxt-Abhängigkeiten: Server und Oberfläche nutzen dieselben Regeln,
 * geprüft wird aber immer auf dem Server (tests/seating.test.ts).
 */

export const SEATS_PER_ROW = 40
export const CARPETS = ['none', 'front', 'back', 'both'] as const
export type Carpet = typeof CARPETS[number]

export interface SeatRow { letter: string, start: number, carpet?: Carpet }

/** Eine Registrierung, soweit die Regeln sie brauchen */
export interface SeatHolder {
  id: number
  seat: string | null
  double: boolean
  discordId: string | null
  contactId: number | null
  /** nach dem Nachrücken: einmal auf einen anderen freien Platz wechseln, auch nach der Platzwahl */
  swapLeft?: boolean
  /** beim Veranstalter gebucht: das Ticket ist personalisiert, umsetzen nur noch durch die Orga */
  booked?: boolean
}

/** Wer etwas tun will; contactId ist gesetzt, wenn er selbst Kontaktperson ist */
export interface SeatActor {
  discordId: string
  isLeader: boolean
  contactId: number | null
}

export type Denied = { ok: false, status: 400 | 403 | 404 | 409, reason: string }
/** usedSwap: der einmalige Wechsel nach dem Nachrücken wird damit verbraucht */
export type MoveCheck = { ok: true, swapWith: number | null, target: string | null, usedSwap?: boolean } | Denied

export const ROW_LETTER = /^[A-Z]{1,2}$/
const SEAT_ID = /^([A-Z]{1,2})-(\d{1,4})$/

export function seatLabel(letter: string, number: number) {
  return `${letter}-${number}`
}

export function parseSeat(id: string) {
  const m = SEAT_ID.exec(id)
  return m ? { letter: m[1]!, number: Number(m[2]) } : null
}

export function rowSeatNumbers(row: SeatRow) {
  return Array.from({ length: SEATS_PER_ROW }, (_, i) => row.start + i)
}

/** Die Reihe zu einer Sitz-ID, wenn es den Platz gibt */
export function rowOfSeat(rows: SeatRow[], seat: string) {
  const p = parseSeat(seat)
  if (!p) return null
  const row = rows.find(r => r.letter === p.letter)
  return row && p.number >= row.start && p.number < row.start + SEATS_PER_ROW ? { row, number: p.number } : null
}

/** links am Tisch = die erste Nummer des Tisches (A-1, A-3 … bei Start 1) */
export function isLeftSeat(row: SeatRow, number: number) {
  return (number - row.start) % 2 === 0
}

/**
 * Tische einer Reihe in Anzeigereihenfolge von oben nach unten: zwei Zeilen à 20 Plätze, je links nach rechts [links, rechts].
 * Gezählt wird unten: die untere Zeile beginnt mit der Startnummer, die obere geht weiter.
 */
export function rowTables(row: SeatRow) {
  const half = SEATS_PER_ROW / 2
  const line = (from: number) => Array.from({ length: half / 2 }, (_, i) => ({ left: from + 2 * i, right: from + 2 * i + 1 }))
  return [line(row.start + half), line(row.start)]
}

/** Welche Plätze jemand belegt: der eigene, bei doppelter Breite auch der rechte am Tisch */
export function coveredSeats(holder: Pick<SeatHolder, 'seat' | 'double'>, rows: SeatRow[], at = holder.seat) {
  if (!at) return []
  const found = rowOfSeat(rows, at)
  if (!found) return []
  if (!holder.double) return [at]
  return isLeftSeat(found.row, found.number) ? [at, seatLabel(found.row.letter, found.number + 1)] : []
}

/** Sitz-ID → ID der Registrierung, die dort sitzt (auch die rechte Hälfte doppelter Plätze) */
export function occupancy(holders: SeatHolder[], rows: SeatRow[]) {
  const map = new Map<string, number>()
  for (const h of holders) for (const s of coveredSeats(h, rows)) map.set(s, h.id)
  return map
}

/** Passt jemand (mit seiner Breite) auf diesen Platz, wenn er selbst dort nicht mitzählt? */
export function fitsSeat(rows: SeatRow[], holders: SeatHolder[], holder: Pick<SeatHolder, 'id' | 'double'>, target: string): { ok: true } | Denied {
  const found = rowOfSeat(rows, target)
  if (!found) return { ok: false, status: 400, reason: `Den Platz ${target} gibt es nicht.` }
  if (holder.double && !isLeftSeat(found.row, found.number)) {
    return { ok: false, status: 409, reason: 'Doppelt breite Plätze gehen nur links am Tisch.' }
  }
  const occ = occupancy(holders, rows)
  for (const s of coveredSeats({ seat: target, double: holder.double }, rows)) {
    const other = occ.get(s)
    if (other !== undefined && other !== holder.id) {
      return { ok: false, status: 409, reason: holder.double ? 'Für einen doppelten Platz muss der ganze Tisch frei sein.' : `Der Platz ${s} ist belegt.` }
    }
  }
  return { ok: true }
}

/** Wie darf actor mit holder umgehen? leader > contact (eigene Leute) > self (sich selbst) */
export function seatRole(actor: SeatActor, holder: Pick<SeatHolder, 'discordId' | 'contactId'>) {
  if (actor.isLeader) return 'leader' as const
  if (actor.contactId !== null && holder.contactId === actor.contactId) return 'contact' as const
  if (holder.discordId !== null && holder.discordId === actor.discordId) return 'self' as const
  return null
}

export interface MoveInput {
  actor: SeatActor
  rows: SeatRow[]
  holders: SeatHolder[]
  holderId: number
  /** Sitz-ID oder null = Platz freigeben */
  target: string | null
  /** Platzwahl offen (ab Beginn der Bedarfsabfrage bis zum Buchungsstart); danach ändert nur noch die Orga */
  seatsOpen: boolean
  /** fixierter Bereich (dem Veranstalter gemeldet): nur dort gibt es noch Plätze; null = keiner */
  area?: ReadonlySet<string> | null
}

/** Liegt der Platz (bei doppelter Breite der ganze Tisch) im Bereich? */
export function inArea(rows: SeatRow[], area: ReadonlySet<string>, target: string, double: boolean) {
  const seats = coveredSeats({ seat: target, double }, rows)
  return seats.length > 0 && seats.every(s => area.has(s))
}

/**
 * Darf actor die Registrierung holderId auf target setzen?
 * Ist target belegt, wird daraus ein Tausch, wenn actor beide bewegen darf (Kontaktperson: nur eigene Leute).
 * Nach der Platzwahl darf nur noch die Orga; wer nachgerückt ist, wechselt einmal selbst auf einen freien Platz.
 * Ist ein Bereich fixiert, zählt nur noch er: Kontaktpersonen setzen und tauschen ihre Leute frei innerhalb des Bereichs
 * (auch freigeben); Teilnehmer setzen sich bis zum Buchungsstart selbst um wie vorher, nur eben im Bereich;
 * danach nur noch, wenn sie keinen Platz haben.
 * Die Orga darf weiter alles.
 */
export function checkMove({ actor, rows, holders, holderId, target, seatsOpen, area = null }: MoveInput): MoveCheck {
  const holder = holders.find(h => h.id === holderId)
  if (!holder) return { ok: false, status: 404, reason: 'Diese Registrierung gibt es nicht (mehr).' }
  const role = seatRole(actor, holder)
  if (!role) return { ok: false, status: 403, reason: 'Du darfst nur dich selbst bzw. die Leute deiner Kontaktperson umsetzen.' }
  if (role !== 'leader' && holder.booked && holder.seat) {
    return { ok: false, status: 403, reason: 'Schon gebucht: das Ticket ist personalisiert. Umsetzen geht nur über die Orga.' }
  }
  if (role !== 'leader' && area) {
    if (target !== null && target !== holder.seat && !inArea(rows, area, target, holder.double)) {
      return { ok: false, status: 403, reason: `Der Platz ${target} liegt außerhalb des gemeldeten Bereichs.` }
    }
    // während der Platzwahl setzt man sich selbst im Bereich um wie vorher (weiter unten)
    if (role === 'self' && !seatsOpen) {
      if (target === null || target === holder.seat) return { ok: false, status: 403, reason: 'Der Buchungsstart ist vorbei: deinen Platz ändert jetzt deine Kontaktperson oder die Orga.' }
      if (holder.seat && !holder.swapLeft) return { ok: false, status: 403, reason: 'Der Buchungsstart ist vorbei: wer schon einen Platz hat, bleibt dort. Umsetzen macht deine Kontaktperson oder die Orga.' }
      const fit = fitsSeat(rows, holders, holder, target)
      return fit.ok ? { ok: true, swapWith: null, target, usedSwap: holder.seat ? true : undefined } : fit
    }
    // Kontaktperson (und Teilnehmer während der Platzwahl): wie ohne Bereich, nur im Bereich
  }
  else if (role !== 'leader' && !seatsOpen) {
    if (role === 'self' && holder.swapLeft && target !== null && target !== holder.seat) {
      const fit = fitsSeat(rows, holders, holder, target)
      return fit.ok ? { ok: true, swapWith: null, target, usedSwap: true } : fit
    }
    return { ok: false, status: 403, reason: 'Die Platzwahl ist vorbei. Plätze ändert jetzt nur noch die Orga.' }
  }
  if (target === null) return { ok: true, swapWith: null, target: null }
  if (target === holder.seat) return { ok: true, swapWith: null, target }

  const found = rowOfSeat(rows, target)
  if (!found) return { ok: false, status: 400, reason: `Den Platz ${target} gibt es nicht.` }
  const fit = fitsSeat(rows, holders, holder, target)
  if (fit.ok) return { ok: true, swapWith: null, target }

  // Platz belegt: Tausch?
  const occupantId = occupancy(holders, rows).get(target)
  const other = holders.find(h => h.id === occupantId)
  if (!other || other.id === holder.id) return fit
  if (role === 'self') return { ok: false, status: 409, reason: `Der Platz ${target} ist belegt.` }
  if (!holder.seat) return { ok: false, status: 409, reason: `Der Platz ${target} ist belegt. Tauschen geht nur mit jemandem, der schon einen Platz hat.` }
  if (role !== 'leader' && other.booked) return { ok: false, status: 403, reason: `Auf ${target} sitzt jemand, der schon gebucht hat. Tauschen geht nur über die Orga.` }
  if (role === 'contact' && other.contactId !== actor.contactId) {
    return { ok: false, status: 403, reason: `${target} gehört zu den Leuten einer anderen Kontaktperson.` }
  }
  if (other.double !== holder.double) return { ok: false, status: 409, reason: 'Tauschen geht nur zwischen gleich breiten Plätzen.' }
  return { ok: true, swapWith: other.id, target: other.seat }
}

/** Darf der Projektleiter jemanden auf doppelte Breite stellen? (umgekehrt geht immer) */
export function checkDouble(rows: SeatRow[], holders: SeatHolder[], holderId: number, double: boolean): { ok: true } | Denied {
  const holder = holders.find(h => h.id === holderId)
  if (!holder) return { ok: false, status: 404, reason: 'Diese Registrierung gibt es nicht (mehr).' }
  if (!double || !holder.seat) return { ok: true }
  return fitsSeat(rows, holders, { id: holder.id, double: true }, holder.seat)
}
