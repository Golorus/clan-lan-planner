import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm'
import {
  autoReleaseDue, capacity, checkStatus, checkWaitlist, dueReminders, normaliseSeat, parseDays, seatsOpen, sortWaitlist, waitlistActive,
  type EventRules, type ReminderEvent, type Status,
} from '#shared/utils/registration'
import { fitsSeat, inArea, occupancy, rowOfSeat, rowSeatNumbers, seatLabel, seatRole, type SeatHolder } from '#shared/utils/seating'

/**
 * Teilnahme je Event: offen, zugesagt oder abgesagt; Warteliste mit Platzangeboten; Buchung beim Veranstalter.
 * Die Regeln stehen in shared/utils/registration.ts, hier passiert es in der Datenbank. Nachrichten werden in
 * derselben Transaktion eingereiht; Discord (Rolle, Versand) erst danach, über finish().
 */

const HOUR_MS = 60 * 60 * 1000

export function eventRules(ev: EventRow): EventRules {
  return {
    registrationOpen: ev.registrationOpen,
    demandClosedAt: ev.demandClosedAt,
    demandUntil: ev.demandUntil,
    bookingFrom: ev.bookingFrom,
    bookingUntil: ev.bookingUntil,
    bookingReleased: !!ev.bookingReleasedAt,
    maxParticipants: ev.maxParticipants,
    areaSize: ev.areaFixedAt ? areaSeats(ev).length : null,
  }
}

export function reminderEvent(ev: EventRow): ReminderEvent {
  return {
    ...eventRules(ev),
    id: ev.id,
    remindDays: parseDays(safeJson(ev.remindDays)),
    bookingRemindDays: parseDays(safeJson(ev.bookingRemindDays)),
  }
}

function safeJson(s: string) {
  try {
    return JSON.parse(s) as unknown
  }
  catch {
    return []
  }
}

export function countConfirmed(q: Tx | ReturnType<typeof useDb>, eventId: number) {
  const R = tables.registrations
  return q.select({ n: sql<number>`count(*)` }).from(R).where(and(eq(R.eventId, eventId), eq(R.status, 'zugesagt'))).get()?.n ?? 0
}

/** Was nach der Transaktion noch passiert: Arbeiter anstoßen, Rollen setzen */
export interface Effects { eventId: number, roles: RoleChange[] }
const effects = (eventId: number): Effects => ({ eventId, roles: [] })

export function finish(fx: Effects) {
  kickMessageWorker()
  applyEventRole(fx.eventId, fx.roles)
  applyEventThread(fx.eventId, fx.roles)
}

/** Wer jemand im Protokoll ist, wenn er über einen Discord-Knopf handelt */
export type LogActor = Pick<Actor, 'discordId' | 'name'>

function contactOf(tx: Tx, contactId: number | null) {
  return contactId ? tx.select().from(tables.contacts).where(eq(tables.contacts.id, contactId)).get() ?? null : null
}

function openOfferOf(tx: Tx, registrationId: number) {
  const O = tables.waitlistOffers
  return tx.select().from(O).where(and(eq(O.registrationId, registrationId), eq(O.status, 'offen'))).get() ?? null
}

/** Plätze, die gerade jemandem angeboten sind: gelten bei der Platzprüfung als belegt */
export function heldSeats(q: Tx | ReturnType<typeof useDb>, eventId: number): SeatHolder[] {
  const O = tables.waitlistOffers
  return q.select({ id: O.id, seat: O.seat }).from(O).where(and(eq(O.eventId, eventId), eq(O.status, 'offen'), isNotNull(O.seat))).all()
    .map(o => ({ id: -o.id, seat: o.seat, double: false, discordId: null, contactId: null }))
}

/** Wer einen Platz hat oder haben darf: die Zugesagten, dazu die angebotenen Plätze */
export function seatHolders(q: Tx | ReturnType<typeof useDb>, eventId: number): (SeatHolder & { nick: string })[] {
  return [...loadRegistrations(q, eventId).filter(r => r.status === 'zugesagt'), ...heldSeats(q, eventId).map(h => ({ ...h, nick: '(angeboten)' }))]
}

/**
 * Status setzen, ohne Rechteprüfung (die macht der Aufrufer). Bei einer Absage wird der Platz frei, die Kontaktperson
 * bekommt Bescheid, und ist die Warteliste aktiv, geht die freie Kapazität als Angebot an die Ersten.
 */
function applyStatus(tx: Tx, ev: EventRow, reg: Registration, to: Status, actor: LogActor | null, fx: Effects, now = new Date()) {
  const R = tables.registrations
  const leaving = reg.status === 'zugesagt' && to !== 'zugesagt'
  tx.update(R).set({
    status: to, statusAt: now, updatedAt: now, waitlistAt: null, waitlistRank: null,
    ...(to === 'zugesagt' ? {} : { seat: null, double: false, swapLeft: false }),
  }).where(eq(R.id, reg.id)).run()
  writeLog(tx, ev.id, actor, { action: to === 'zugesagt' ? 'zugesagt' : to === 'abgesagt' ? 'abgesagt' : 'offen', registration: reg, fromSeat: leaving ? reg.seat : null })
  fx.roles.push(...roleChangeFor(reg, to))

  if (to === 'zugesagt') {
    queueMessage(tx, { kind: 'registrierung', registrationId: reg.id, components: seatLinkButtons(), dedupeKey: `zusage:${ev.id}:${reg.id}` })
  }
  // wer ein Angebot offen hatte und jetzt etwas anderes will, gibt es weiter
  const offer = to === 'zugesagt' ? null : openOfferOf(tx, reg.id)
  if (offer) {
    tx.update(tables.waitlistOffers).set({ status: 'zurückgezogen', answeredAt: now }).where(eq(tables.waitlistOffers.id, offer.id)).run()
    offerFreeCapacity(tx, ev, now)
  }
  if (!leaving) return
  const contact = contactOf(tx, reg.contactId)
  if (to === 'abgesagt' && contact && contact.discordId !== actor?.discordId) {
    queueMessage(tx, { kind: 'absage_kontakt', registrationId: reg.id, to: { discordId: contact.discordId, nick: contact.nick }, vars: { platz: reg.seat ?? '(noch keiner)' } })
  }
  if (waitlistActive(eventRules(ev), now, countConfirmed(tx, ev.id))) offerFreeCapacity(tx, ev, now)
}

/**
 * Dem Ersten auf der Warteliste einen Platz anbieten (wer schon ein Angebot hat, wird übersprungen). Das Angebot gilt
 * für „einen Platz“: wer annimmt, sucht sich danach selbst einen freien aus. Gibt die ID des Angebots zurück oder
 * null, wenn niemand wartet.
 */
export function offerNext(tx: Tx, ev: EventRow, actor: LogActor | null, now = new Date()) {
  const O = tables.waitlistOffers
  const offered = new Set(tx.select({ id: O.registrationId }).from(O).where(and(eq(O.eventId, ev.id), eq(O.status, 'offen'))).all().map(o => o.id))
  const waiting = loadRegistrations(tx, ev.id).filter(r => r.waitlistAt && r.status !== 'zugesagt' && !offered.has(r.id))
  const next = sortWaitlist(waiting)[0]
  if (!next) return null
  const expiresAt = new Date(now.getTime() + Math.max(1, ev.offerHours) * HOUR_MS)
  const offer = tx.insert(O).values({ eventId: ev.id, registrationId: next.id, seat: null, status: 'offen', createdAt: now, expiresAt })
    .returning({ id: O.id }).get()
  writeLog(tx, ev.id, actor, { action: 'angebot', registration: next, detail: `gilt bis ${expiresAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}` })
  queueMessage(tx, { kind: 'angebot', registrationId: next.id, components: offerButtons(offer.id), dedupeKey: `angebot:${offer.id}`, force: true })
  return offer.id
}

// ── Status ändern: Teilnehmer selbst, Kontaktperson (nur absagen), Orga ──

export interface StatusOptions {
  /** neue Angaben zur Person, wenn über das Formular zugesagt wird */
  person?: { nick: string, contactId: number }
}

/** Zusagen, absagen oder (nur Orga) zurück auf offen; Rechte und Fristen prüft checkStatus */
export function setStatus(actor: Actor, registrationId: number, to: Status) {
  const fx = effects(0)
  const changed = useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    fx.eventId = ev.id
    const reg = findRegistration(tx, ev.id, registrationId)
    if (!reg) throw createError({ statusCode: 404, statusMessage: 'Diese Teilnahme gibt es nicht (mehr).' })
    const role = seatRole(actor, reg)
    if (!role) throw createError({ statusCode: 403, statusMessage: 'Das darfst du nur für dich selbst.' })
    const check = checkStatus(role, eventRules(ev), new Date(), countConfirmed(tx, ev.id), reg.status, to)
    if (!check.ok) throw createError({ statusCode: check.status, statusMessage: check.reason, data: check.waitlist ? { code: 'waitlist' } : undefined })
    if (reg.status === to) return false
    if (to === 'zugesagt' && !reg.contactId && role !== 'leader') {
      throw createError({ statusCode: 400, statusMessage: 'Bitte zuerst eine Kontaktperson wählen.', data: { code: 'need_contact' } })
    }
    applyStatus(tx, ev, reg, to, actor, fx)
    return true
  })
  finish(fx)
  return { changed }
}

/** Status einer Teilnahme ohne Anmeldung, über einen Discord-Knopf (die Person ist über ihre Discord-ID belegt) */
export function setStatusByButton(discordId: string, registrationId: number, to: 'zugesagt' | 'abgesagt') {
  const reg = findRegistrationById(useDb(), registrationId)
  if (!reg || reg.discordId !== discordId) throw createError({ statusCode: 403, statusMessage: 'Dieser Knopf gehört zu jemand anderem.' })
  const ev = currentEvent()
  if (!ev || ev.id !== reg.eventId) throw createError({ statusCode: 409, statusMessage: 'Dieses Event ist nicht mehr aktuell.' })
  return setStatus({ discordId, isOrga: false, isLeader: false, contactId: null, name: reg.nick, username: reg.discordName ?? reg.nick }, registrationId, to)
}

// ── Warteliste ──

export function joinWaitlist(actor: Actor, registrationId: number) {
  const fx = effects(0)
  useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    fx.eventId = ev.id
    const reg = findRegistration(tx, ev.id, registrationId)
    if (!reg) throw createError({ statusCode: 404, statusMessage: 'Diese Teilnahme gibt es nicht (mehr).' })
    const role = seatRole(actor, reg)
    if (role !== 'self' && role !== 'leader') throw createError({ statusCode: 403, statusMessage: 'Auf die Warteliste setzt sich jeder selbst.' })
    const check = checkWaitlist(eventRules(ev), new Date(), countConfirmed(tx, ev.id), reg.status, !!reg.waitlistAt)
    if (!check.ok) throw createError({ statusCode: check.status, statusMessage: check.reason })
    if (!reg.contactId) throw createError({ statusCode: 400, statusMessage: 'Bitte zuerst eine Kontaktperson wählen.', data: { code: 'need_contact' } })
    const now = new Date()
    tx.update(tables.registrations).set({ waitlistAt: now, waitlistRank: null, updatedAt: now }).where(eq(tables.registrations.id, reg.id)).run()
    writeLog(tx, ev.id, actor, { action: 'warteliste', registration: reg })
    // sind gerade Plätze frei, weil niemand gewartet hat? Dann gleich anbieten
    offerFreeCapacity(tx, ev, now)
  })
  finish(fx)
}

export function leaveWaitlist(actor: Actor, registrationId: number) {
  const fx = effects(0)
  useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    fx.eventId = ev.id
    const reg = findRegistration(tx, ev.id, registrationId)
    if (!reg || !reg.waitlistAt) throw createError({ statusCode: 404, statusMessage: 'Nicht auf der Warteliste.' })
    const role = seatRole(actor, reg)
    if (role !== 'self' && role !== 'leader') throw createError({ statusCode: 403, statusMessage: 'Das darfst du nur für dich selbst.' })
    removeFromWaitlist(tx, ev, reg, actor, 'zurückgezogen')
  })
  finish(fx)
}

function removeFromWaitlist(tx: Tx, ev: EventRow, reg: Registration, actor: LogActor | null, offerStatus: 'zurückgezogen' | 'abgelehnt' | 'abgelaufen') {
  const now = new Date()
  tx.update(tables.registrations).set({ waitlistAt: null, waitlistRank: null, updatedAt: now }).where(eq(tables.registrations.id, reg.id)).run()
  const offer = openOfferOf(tx, reg.id)
  writeLog(tx, ev.id, actor, { action: offerStatus === 'zurückgezogen' ? 'warteliste verlassen' : `angebot ${offerStatus}`, registration: reg })
  if (offer) {
    tx.update(tables.waitlistOffers).set({ status: offerStatus, answeredAt: now }).where(eq(tables.waitlistOffers.id, offer.id)).run()
    offerFreeCapacity(tx, ev, now)
  }
}

/**
 * Freie Kapazität an die Warteliste geben, von oben nach unten, ein Angebot je freiem Platz (aus = nur von Hand).
 * Frei heißt: Plätze im Plan bzw. im fixierten Bereich, die niemand belegt, abzüglich der Zugesagten ohne Platz und
 * der offenen Angebote, denn die suchen sich noch einen aus. Mit Höchstzahl (bzw. Bereich) höchstens bis dahin.
 */
export function offerFreeCapacity(tx: Tx, ev: EventRow, now = new Date()) {
  if (!ev.waitlistAuto) return 0
  const O = tables.waitlistOffers
  const openOffers = tx.select({ n: sql<number>`count(*)` }).from(O).where(and(eq(O.eventId, ev.id), eq(O.status, 'offen'))).get()?.n ?? 0
  const confirmed = loadRegistrations(tx, ev.id).filter(r => r.status === 'zugesagt')
  const rows = loadRows(tx, ev.id)
  const occ = occupancy(seatHolders(tx, ev.id), rows)
  const area = fixedArea(ev)
  const seats = area ? [...area] : rows.flatMap(r => rowSeatNumbers(r).map(n => seatLabel(r.letter, n)))
  let room = seats.filter(s => !occ.has(s)).length - confirmed.filter(r => !r.seat).length - openOffers
  const rules = eventRules(ev)
  const cap = capacity(rules)
  // Höchstzahl 0 ohne Bereich heißt „ohne Grenze“ (wie in isFull)
  if (cap !== null && (cap > 0 || rules.areaSize !== null)) room = Math.min(room, cap - confirmed.length - openOffers)
  let n = 0
  while (room-- > 0 && offerNext(tx, ev, null, now) !== null) n++
  return n
}

/** Angebot annehmen oder ablehnen; byDiscordId = die Person selbst (Seite oder Knopf), leader = Orga für sie */
export function answerOffer(offerId: number, accept: boolean, who: { discordId: string, isLeader: boolean, name: string }) {
  const fx = effects(0)
  const result = useDb().transaction((tx) => {
    const O = tables.waitlistOffers
    const offer = tx.select().from(O).where(eq(O.id, offerId)).get()
    if (!offer || offer.status !== 'offen') throw createError({ statusCode: 409, statusMessage: 'Dieses Angebot gilt nicht mehr.' })
    const ev = requireCurrentEvent(tx)
    if (ev.id !== offer.eventId) throw createError({ statusCode: 409, statusMessage: 'Dieses Event ist nicht mehr aktuell.' })
    fx.eventId = ev.id
    const reg = findRegistration(tx, ev.id, offer.registrationId)
    if (!reg) throw createError({ statusCode: 404, statusMessage: 'Diese Teilnahme gibt es nicht (mehr).' })
    if (!who.isLeader && reg.discordId !== who.discordId) throw createError({ statusCode: 403, statusMessage: 'Dieses Angebot gehört zu jemand anderem.' })
    const now = new Date()
    if (offer.expiresAt <= now) {
      removeFromWaitlist(tx, ev, reg, null, 'abgelaufen')
      return { accepted: false, expired: true, seat: null }
    }
    const actor = { discordId: who.discordId, name: who.name }
    if (!accept) {
      removeFromWaitlist(tx, ev, reg, actor, 'abgelehnt')
      return { accepted: false, expired: false, seat: null }
    }
    tx.update(O).set({ status: 'angenommen', answeredAt: now }).where(eq(O.id, offer.id)).run()
    const seat = promote(tx, ev, reg, offer.seat, actor, fx, now)
    return { accepted: true, expired: false, seat }
  })
  finish(fx)
  return result
}

/**
 * Nachrücken: zugesagt, noch ohne Platz (den sucht man sich danach selbst aus; nur alte Angebote nennen einen festen);
 * Kontaktperson bekommt Bescheid, in der Buchungsphase gibt es gleich die Nachricht mit dem Buchungscode.
 */
function promote(tx: Tx, ev: EventRow, reg: Registration, seat: string | null, actor: LogActor | null, fx: Effects, now = new Date()) {
  const R = tables.registrations
  const holders = seatHolders(tx, ev.id).filter(h => !(seat && h.id < 0 && h.seat === seat))
  const target = seat && fitsSeat(loadRows(tx, ev.id), holders, { id: reg.id, double: false }, seat).ok ? seat : null
  tx.update(R).set({ status: 'zugesagt', statusAt: now, updatedAt: now, seat: target, double: false, waitlistAt: null, waitlistRank: null,
    // nach der Platzwahl darf man sich einmal selbst einen Platz aussuchen; solange sie läuft, setzt man sich ohnehin frei um
    swapLeft: !seatsOpen(eventRules(ev), now) })
    .where(eq(R.id, reg.id)).run()
  writeLog(tx, ev.id, actor, { action: 'nachgerückt', registration: reg, toSeat: target })
  fx.roles.push(...roleChangeFor(reg, 'zugesagt'))
  queueMessage(tx, { kind: 'registrierung', registrationId: reg.id, components: seatLinkButtons(), dedupeKey: `zusage:${ev.id}:${reg.id}` })
  const contact = contactOf(tx, reg.contactId)
  if (contact && contact.discordId !== actor?.discordId) {
    queueMessage(tx, { kind: 'nachgerueckt_kontakt', registrationId: reg.id, to: { discordId: contact.discordId, nick: contact.nick } })
  }
  if (ev.bookingReleasedAt) {
    queueMessage(tx, { kind: 'buchung', registrationId: reg.id, components: bookingButtons(reg.id, ev.bookingUrl), dedupeKey: `buchung:${ev.id}:${reg.id}:frei`, force: true })
  }
  return target
}

/** Orga: jemanden direkt nachrücken lassen (mit seinem offenen Angebot, falls es eins gibt) */
export function promoteByLeader(leader: LogActor, registrationId: number) {
  const fx = effects(0)
  const seat = useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    fx.eventId = ev.id
    const reg = findRegistration(tx, ev.id, registrationId)
    if (!reg) throw createError({ statusCode: 404, statusMessage: 'Diese Teilnahme gibt es nicht (mehr).' })
    if (reg.status === 'zugesagt') throw createError({ statusCode: 409, statusMessage: `${reg.nick} hat schon zugesagt.` })
    const offer = openOfferOf(tx, reg.id)
    if (offer) tx.update(tables.waitlistOffers).set({ status: 'angenommen', answeredAt: new Date() }).where(eq(tables.waitlistOffers.id, offer.id)).run()
    return promote(tx, ev, reg, offer?.seat ?? null, leader, fx)
  })
  finish(fx)
  return { seat }
}

/** Orga: Reihenfolge der Warteliste setzen (IDs in der gewünschten Reihenfolge) */
export function reorderWaitlist(leader: LogActor, ids: number[]) {
  useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    const R = tables.registrations
    const onList = new Set(loadRegistrations(tx, ev.id).filter(r => r.waitlistAt).map(r => r.id))
    if (ids.length !== onList.size || ids.some(id => !onList.has(id))) {
      throw createError({ statusCode: 409, statusMessage: 'Die Warteliste hat sich inzwischen geändert. Bitte neu laden.' })
    }
    ids.forEach((id, i) => tx.update(R).set({ waitlistRank: i + 1 }).where(eq(R.id, id)).run())
    writeLog(tx, ev.id, leader, { action: 'warteliste sortiert' })
  })
}

/** Orga: jemanden von der Warteliste nehmen (sein offenes Angebot geht weiter) */
export function removeFromWaitlistByLeader(leader: LogActor, registrationId: number) {
  const fx = effects(0)
  useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    fx.eventId = ev.id
    const reg = findRegistration(tx, ev.id, registrationId)
    if (!reg || !reg.waitlistAt) throw createError({ statusCode: 404, statusMessage: 'Nicht auf der Warteliste.' })
    removeFromWaitlist(tx, ev, reg, leader, 'zurückgezogen')
  })
  finish(fx)
}

/** abgelaufene Angebote: von der Warteliste nehmen, Platz an den Nächsten */
export function expireOffers(now = new Date()) {
  const ev = currentEvent()
  if (!ev) return 0
  const fx = effects(ev.id)
  const O = tables.waitlistOffers
  const n = useDb().transaction((tx) => {
    const expired = tx.select().from(O).where(and(eq(O.eventId, ev.id), eq(O.status, 'offen'), lte(O.expiresAt, now))).all()
    for (const offer of expired) {
      const reg = findRegistration(tx, ev.id, offer.registrationId)
      if (reg) removeFromWaitlist(tx, ev, reg, null, 'abgelaufen')
      else tx.update(O).set({ status: 'abgelaufen', answeredAt: now }).where(eq(O.id, offer.id)).run()
    }
    return expired.length
  })
  if (n) finish(fx)
  return n
}

/**
 * Teilnahme verlassen, bevor sie gelöscht wird (Orga nimmt jemanden raus, Person oder Konto gelöscht):
 * wie eine Absage, damit der Platz an die Warteliste geht und die Rolle wegkommt.
 */
export function releaseBeforeDelete(tx: Tx, registrationIds: number[], actor: LogActor | null, fx: Effects) {
  const ev = currentEvent(tx)
  if (!ev || !registrationIds.length) return
  for (const reg of loadRegistrations(tx, ev.id).filter(r => registrationIds.includes(r.id))) {
    if (reg.status === 'zugesagt') applyStatus(tx, ev, reg, 'abgesagt', actor, fx)
    else if (reg.waitlistAt) removeFromWaitlist(tx, ev, reg, actor, 'zurückgezogen')
  }
}
export { effects as newEffects }

// ── Einladen: alle bekannten Personen stehen im aktuellen Event als „offen“ ──

/** Legt für alle Personen mit Discord-ID ohne Teilnahme eine „offen“ an; gibt die Zahl zurück */
export function inviteKnownPersons(tx: Tx, ev: EventRow, actor: LogActor | null) {
  const R = tables.registrations
  const P = tables.persons
  const have = new Set(tx.select({ personId: R.personId }).from(R).where(eq(R.eventId, ev.id)).all().map(r => r.personId))
  const missing = tx.select({ id: P.id }).from(P).where(isNotNull(P.discordId)).orderBy(asc(P.id)).all().filter(p => !have.has(p.id))
  const now = new Date()
  for (const p of missing) {
    tx.insert(R).values({ eventId: ev.id, personId: p.id, seat: null, double: false, status: 'offen', statusAt: now, createdAt: now, updatedAt: now }).run()
  }
  if (missing.length) writeLog(tx, ev.id, actor, { action: 'eingeladen', detail: `${missing.length} bekannte Personen als „offen“` })
  return missing.length
}

// ── Buchung beim Veranstalter ──

/** „Ich habe gebucht“ (mit dem tatsächlich gebuchten Platz) bzw. zurück auf „noch nicht gebucht“ */
export function setBooking(actor: Actor, registrationId: number, booked: boolean, seatInput: string | null) {
  return useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    const reg = findRegistration(tx, ev.id, registrationId)
    if (!reg) throw createError({ statusCode: 404, statusMessage: 'Diese Teilnahme gibt es nicht (mehr).' })
    if (!seatRole(actor, reg)) throw createError({ statusCode: 403, statusMessage: 'Das darfst du nur für dich selbst bzw. deine Leute.' })
    if (reg.status !== 'zugesagt') throw createError({ statusCode: 409, statusMessage: 'Buchen gibt es nur für Zugesagte.' })
    return writeBooking(tx, ev, reg, booked, seatInput, actor)
  })
}

/** Dasselbe über den Discord-Knopf: die Person ist über ihre Discord-ID belegt */
export function setBookingByButton(discordId: string, registrationId: number, seatInput: string | null) {
  return useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    const reg = findRegistration(tx, ev.id, registrationId)
    if (!reg || reg.discordId !== discordId) throw createError({ statusCode: 403, statusMessage: 'Dieser Knopf gehört zu jemand anderem.' })
    if (reg.status !== 'zugesagt') throw createError({ statusCode: 409, statusMessage: 'Buchen gibt es nur für Zugesagte.' })
    return writeBooking(tx, ev, reg, true, seatInput, { discordId, name: reg.nick })
  })
}

function writeBooking(tx: Tx, ev: EventRow, reg: Registration, booked: boolean, seatInput: string | null, actor: LogActor) {
  const R = tables.registrations
  const now = new Date()
  let seat: string | null = null
  if (booked) {
    seat = seatInput ? normaliseSeat(seatInput) : reg.seat
    if (seatInput && !seat) throw createError({ statusCode: 400, statusMessage: 'Bitte den Platz wie A-81 angeben.' })
    if (seat && !rowOfSeat(loadRows(tx, ev.id), seat)) throw createError({ statusCode: 400, statusMessage: `Den Platz ${seat} gibt es in unserem Plan nicht.` })
  }
  tx.update(R).set(booked
    ? { booking: 'gebucht', bookedSeat: seat, bookedAt: now, bookedBy: actor.name, updatedAt: now }
    : { booking: 'offen', bookedSeat: null, bookedAt: null, bookedBy: null, updatedAt: now }).where(eq(R.id, reg.id)).run()
  // anderer Platz gebucht: das Ticket gilt, also den Plan nachziehen, wenn der Platz dort frei ist (und im fixierten Bereich)
  const moved = booked && !!seat && seat !== reg.seat && bookedSeatFree(tx, ev, reg, seat)
  if (moved) tx.update(R).set({ seat, updatedAt: now }).where(eq(R.id, reg.id)).run()
  writeLog(tx, ev.id, actor, { action: booked ? 'gebucht' : 'nicht gebucht', registration: reg, fromSeat: booked ? reg.seat : null, toSeat: seat,
    detail: booked && seat && seat !== reg.seat ? (moved ? 'anderer Platz gebucht, im Plan übernommen' : 'weicht vom Plan ab (Platz belegt)') : null })
  return { booked, seat, moved, differs: !!(booked && seat && reg.seat !== seat && !moved) }
}

/** Ist der gebuchte Platz im Plan frei für diese Person (einfach oder doppelt, ggf. im fixierten Bereich)? */
function bookedSeatFree(tx: Tx, ev: EventRow, reg: Registration, seat: string) {
  const rows = loadRows(tx, ev.id)
  const area = fixedArea(ev)
  if (area && !inArea(rows, area, seat, reg.double)) return false
  return fitsSeat(rows, seatHolders(tx, ev.id), { id: reg.id, double: reg.double }, seat).ok
}

/**
 * Buchung freigeben, alle Zugesagten bekommen Code, Link, Frist und ihren Platz (einmal je Person).
 * Von Hand durch die Orga oder automatisch durch den Takt zum Buchungsstart (dann ohne actor).
 */
export function releaseBooking(leader: LogActor | null) {
  const db = useDb()
  const count = db.transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    if (!ev.bookingCode) throw createError({ statusCode: 400, statusMessage: 'Bitte zuerst den Buchungscode eintragen.' })
    const now = new Date()
    if (!ev.bookingReleasedAt) tx.update(tables.events).set({ bookingReleasedAt: now }).where(eq(tables.events.id, ev.id)).run()
    let n = 0
    for (const reg of loadRegistrations(tx, ev.id).filter(r => r.status === 'zugesagt' && r.booking === 'offen')) {
      if (queueMessage(tx, { kind: 'buchung', registrationId: reg.id, components: bookingButtons(reg.id, ev.bookingUrl), dedupeKey: `buchung:${ev.id}:${reg.id}:frei`, force: true })) n++
    }
    writeLog(tx, ev.id, leader, { action: 'buchung freigegeben', detail: `${n} Nachrichten` })
    return n
  })
  kickMessageWorker()
  return count
}

// ── Erinnerungen ──

/** „Jetzt erinnern“: an Offene (alle bzw. die eigenen Leute einer Kontaktperson, oder eine Person) */
export function remindNow(actor: Actor, registrationIds: number[] | 'alle') {
  const db = useDb()
  const ev = requireCurrentEvent(db)
  const stamp = Date.now()
  const regs = loadRegistrations(db, ev.id).filter(r => r.status === 'offen' && !r.waitlistAt && r.discordId && !r.remindersOff)
    .filter(r => registrationIds === 'alle' || registrationIds.includes(r.id))
    .filter(r => seatRole(actor, r) === 'leader' || seatRole(actor, r) === 'contact')
  let n = 0
  db.transaction((tx) => {
    for (const r of regs) {
      if (queueMessage(tx, { kind: 'erinnerung_offen', registrationId: r.id, components: statusButtons(r.id), dedupeKey: `offen:${ev.id}:${r.id}:jetzt:${stamp}`, force: true })) n++
    }
    if (n) writeLog(tx, ev.id, actor, { action: 'erinnert', detail: `${n} Offene` })
  })
  kickMessageWorker()
  return n
}

/** Erinnerungen ab- oder wieder anbestellen (für die eigene Person) */
export function setRemindersOff(personId: number, off: boolean) {
  useDb().update(tables.persons).set({ remindersOff: off, updatedAt: new Date() }).where(eq(tables.persons.id, personId)).run()
}

/**
 * Der Takt (jede Minute über Nitro Scheduled Tasks): abgelaufene Angebote weitergeben, freie Kapazität der Warteliste
 * anbieten, fällige Erinnerungen einreihen. Doppelte verhindert der Dedupe-Schlüssel in der Datenbank, auch nach einem Neustart.
 */
export function registrationTick(now = new Date()) {
  const expired = expireOffers(now)
  let ev = currentEvent()
  if (!ev) return { expired, queued: 0 }
  const db = useDb()
  // Buchungsstart erreicht: automatisch freigeben. Ohne Code oder Link nicht (das Speichern verlangt beides,
  // fehlt es trotzdem, bleibt die Platzwahl zu und die Orga sieht es in /orga/buchung)
  let released = 0
  if (autoReleaseDue(eventRules(ev), now) && ev.bookingCode && ev.bookingUrl) {
    released = releaseBooking(null)
    ev = currentEvent()!
  }
  // freie Kapazität ohne Angebot (z. B. Reihen dazugekommen, jemand von der Orga entfernt) an die Warteliste
  const cur = ev
  const offered = waitlistActive(eventRules(cur), now, countConfirmed(db, cur.id)) ? db.transaction(tx => offerFreeCapacity(tx, cur, now)) : 0
  if (offered) kickMessageWorker()
  const people = loadRegistrations(db, ev.id).map(r => ({
    id: r.id, status: r.status, seat: r.seat, booking: r.booking, remindersOff: r.remindersOff, discordId: r.discordId, onWaitlist: !!r.waitlistAt,
  }))
  const due = dueReminders(reminderEvent(ev), people, now)
  let queued = 0
  if (due.length) {
    db.transaction((tx) => {
      for (const d of due) {
        const components = d.kind === 'erinnerung_offen' ? statusButtons(d.registrationId)
          : d.kind === 'erinnerung_platz' ? seatReminderButtons(d.registrationId) : bookingButtons(d.registrationId, ev.bookingUrl)
        if (queueMessage(tx, { kind: d.kind, registrationId: d.registrationId, components, dedupeKey: d.key })) queued++
      }
    })
  }
  if (queued) kickMessageWorker()
  return { expired, queued, released, offered }
}

/** IDs der Teilnahmen einer Person (für Löschungen) */
export function registrationIdsOfPerson(q: Tx | ReturnType<typeof useDb>, personId: number) {
  const R = tables.registrations
  return q.select({ id: R.id }).from(R).where(eq(R.personId, personId)).all().map(r => r.id)
}

/** Die eigene Teilnahme am aktuellen Event (oder die angegebene, wenn actor sie bearbeiten darf; geprüft wird später) */
export function resolveRegistrationId(actor: Actor, registrationId: number | undefined) {
  if (registrationId) return registrationId
  const db = useDb()
  const ev = requireCurrentEvent(db)
  const person = findPersonByDiscordId(db, actor.discordId)
  const R = tables.registrations
  const reg = person ? db.select({ id: R.id }).from(R).where(and(eq(R.eventId, ev.id), eq(R.personId, person.id))).get() : undefined
  if (!reg) throw createError({ statusCode: 404, statusMessage: 'Du stehst für dieses Event noch nicht auf der Liste.' })
  return reg.id
}

/** Mitmachen darf, wer auf unserem Discord-Server ist; 409 mit code „not_member“, sonst Beitritt über /auth/discord?join=1 */
export async function requireGuildMember(discordId: string) {
  if (isDemoId(discordId)) return
  if (!discordConfigured()) {
    if (botOptional()) return
    throw createError({ statusCode: 500, statusMessage: 'Der Discord-Bot ist nicht eingerichtet (NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_GUILD_ID).' })
  }
  let member: boolean
  try {
    member = await isGuildMember(discordId)
  }
  catch (e) {
    throw createError({ statusCode: 502, statusMessage: 'Discord ist gerade nicht erreichbar: ' + (e instanceof Error ? e.message : e) })
  }
  if (!member) throw createError({ statusCode: 409, statusMessage: 'Mitmachen können nur Mitglieder unseres Discord-Servers.', data: { code: 'not_member' } })
}

/** Orga: einer Person auf der Warteliste jetzt ein Angebot machen (ohne festen Platz, z. B. bei abgeschaltetem Nachrücken) */
export function offerToByLeader(leader: LogActor, registrationId: number) {
  const fx = effects(0)
  const offerId = useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    fx.eventId = ev.id
    const reg = findRegistration(tx, ev.id, registrationId)
    if (!reg || !reg.waitlistAt) throw createError({ statusCode: 404, statusMessage: 'Nicht auf der Warteliste.' })
    if (openOfferOf(tx, reg.id)) throw createError({ statusCode: 409, statusMessage: `${reg.nick} hat schon ein offenes Angebot.` })
    const now = new Date()
    const O = tables.waitlistOffers
    const expiresAt = new Date(now.getTime() + Math.max(1, ev.offerHours) * HOUR_MS)
    const offer = tx.insert(O).values({ eventId: ev.id, registrationId: reg.id, seat: null, status: 'offen', createdAt: now, expiresAt }).returning({ id: O.id }).get()
    writeLog(tx, ev.id, leader, { action: 'angebot', registration: reg, detail: 'von der Orga' })
    queueMessage(tx, { kind: 'angebot', registrationId: reg.id, components: offerButtons(offer.id), dedupeKey: `angebot:${offer.id}`, force: true })
    return offer.id
  })
  finish(fx)
  return { offerId }
}

// ── Gemeldeter Bereich: markieren, fixieren, lösen ──

/** Sitz-IDs des markierten Bereichs (auch wenn noch nicht fixiert) */
export function areaSeats(ev: Pick<EventRow, 'area'>): string[] {
  const v = ev.area ? safeJson(ev.area) : []
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** fixierter Bereich als Menge, sonst null */
export function fixedArea(ev: Pick<EventRow, 'area' | 'areaFixedAt'>) {
  return ev.areaFixedAt ? new Set(areaSeats(ev)) : null
}

/** Orga: Bereich markieren (Entwurf); geht nur, solange er nicht fixiert ist */
export function setArea(seats: string[]) {
  return useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    if (ev.areaFixedAt) throw createError({ statusCode: 409, statusMessage: 'Der Bereich ist fixiert. Erst lösen, dann ändern.' })
    const rows = loadRows(tx, ev.id)
    const clean = [...new Set(seats)].filter(s => rowOfSeat(rows, s))
    tx.update(tables.events).set({ area: clean.length ? JSON.stringify(clean) : null }).where(eq(tables.events.id, ev.id)).run()
    return { seats: clean.length }
  })
}

/**
 * Orga: Bereich fixieren. Wer außerhalb sitzt, verliert seinen Platz und bekommt eine Nachricht; danach gibt es nur
 * noch Plätze im Bereich und höchstens so viele Zusagen. Freie Bereichsplätze gehen an die Warteliste.
 */
export function fixArea(leader: LogActor) {
  const fx = effects(0)
  const result = useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    fx.eventId = ev.id
    if (ev.areaFixedAt) throw createError({ statusCode: 409, statusMessage: 'Der Bereich ist schon fixiert.' })
    const seats = areaSeats(ev)
    if (!seats.length) throw createError({ statusCode: 400, statusMessage: 'Bitte zuerst den Bereich im Sitzplan markieren.' })
    const area = new Set(seats)
    const rows = loadRows(tx, ev.id)
    const now = new Date()
    const R = tables.registrations
    const removed: string[] = []
    const outside = loadRegistrations(tx, ev.id).filter(r => r.status === 'zugesagt' && r.seat && !inArea(rows, area, r.seat, r.double))
    // wer schon gebucht hat, behält seinen Platz (personalisiertes Ticket); das löst die Orga von Hand
    const bookedOutside = outside.filter(r => r.booking === 'gebucht').map(r => r.nick)
    for (const r of outside.filter(r => r.booking !== 'gebucht')) {
      tx.update(R).set({ seat: null, updatedAt: now }).where(eq(R.id, r.id)).run()
      writeLog(tx, ev.id, leader, { action: 'freigegeben', registration: r, fromSeat: r.seat, detail: 'außerhalb des gemeldeten Bereichs' })
      queueMessage(tx, { kind: 'bereich', registrationId: r.id, vars: { platz: r.seat! }, components: seatLinkButtons(), force: true })
      removed.push(r.nick)
    }
    // offene Angebote auf Plätze außerhalb: Platz weg, das Angebot bleibt (dann ohne festen Platz)
    const O = tables.waitlistOffers
    for (const o of tx.select().from(O).where(and(eq(O.eventId, ev.id), eq(O.status, 'offen'))).all()) {
      if (o.seat && !area.has(o.seat)) tx.update(O).set({ seat: null }).where(eq(O.id, o.id)).run()
    }
    tx.update(tables.events).set({ areaFixedAt: now }).where(eq(tables.events.id, ev.id)).run()
    writeLog(tx, ev.id, leader, { action: 'bereich fixiert', detail: `${seats.length} Plätze${removed.length ? `, ${removed.length} außerhalb freigegeben` : ''}` })
    const offered = offerFreeCapacity(tx, { ...ev, areaFixedAt: now }, now)
    return { seats: seats.length, removed, bookedOutside, offered }
  })
  finish(fx)
  return result
}

/** Orga: Fixierung lösen (der markierte Bereich bleibt als Entwurf) */
export function releaseArea(leader: LogActor) {
  useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    if (!ev.areaFixedAt) return
    tx.update(tables.events).set({ areaFixedAt: null }).where(eq(tables.events.id, ev.id)).run()
    writeLog(tx, ev.id, leader, { action: 'bereich gelöst' })
  })
}
