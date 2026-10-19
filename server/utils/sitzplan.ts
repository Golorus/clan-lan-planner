import { and, asc, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { actsAsOrga, ORGA_HEADER } from '#shared/utils/orgaContext'
import { seatsOpen } from '#shared/utils/registration'
import { checkMove, type SeatActor } from '#shared/utils/seating'

type Db = ReturnType<typeof useDb>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Q = Db | Tx

export type EventRow = typeof tables.events.$inferSelect

export interface Actor extends SeatActor {
  /** hat die Orga-Rolle; isLeader = handelt bei dieser Anfrage mit Orga-Rechten (nur im Orga-Bereich, siehe actsAsOrga) */
  isOrga: boolean
  /** für Protokoll und Nachrichten */
  name: string
  username: string
}

/**
 * Wer ist angemeldet, und ist er Projektleiter (Orga-Rolle) oder Kontaktperson? Beides wird bei jeder Anfrage nachgeschaut.
 * Orga-Rechte (isLeader) gelten nur im Orga-Bereich: auf der Startseite handelt die Orga wie Kontaktperson bzw. Teilnehmer.
 */
export async function getActor(event: H3Event): Promise<Actor | null> {
  const { user } = await getUserSession(event)
  if (!user) return null
  const orga = await isLeader(user.discordId)
  await syncLeaderFlag(event, orga)
  const contact = useDb().select({ id: tables.contacts.id }).from(tables.contacts)
    .where(eq(tables.contacts.discordId, user.discordId)).get()
  return {
    discordId: user.discordId,
    isOrga: orga,
    isLeader: actsAsOrga(orga, event.path.split('?')[0]!, getHeader(event, ORGA_HEADER)),
    contactId: contact?.id ?? null,
    name: user.displayName || user.username,
    username: user.username,
  }
}

export async function requireActor(event: H3Event) {
  const actor = await getActor(event)
  if (!actor) throw createError({ statusCode: 401, statusMessage: 'Bitte zuerst mit Discord anmelden.' })
  return actor
}

export function currentEvent(q: Q = useDb()) {
  return q.select().from(tables.events).where(eq(tables.events.isCurrent, true)).get() ?? null
}

export function requireCurrentEvent(q: Q = useDb()) {
  const ev = currentEvent(q)
  if (!ev) throw createError({ statusCode: 409, statusMessage: 'Es gibt noch kein aktuelles Event.' })
  return ev
}

export function loadRows(q: Q, eventId: number) {
  return q.select().from(tables.seatRows).where(eq(tables.seatRows.eventId, eventId))
    .orderBy(asc(tables.seatRows.position), asc(tables.seatRows.id)).all()
}

/** Teilnahme mit den Angaben der Person (dieselbe Form wie früher die Registrierung) */
const registrationColumns = {
  id: tables.registrations.id,
  eventId: tables.registrations.eventId,
  personId: tables.registrations.personId,
  seat: tables.registrations.seat,
  double: tables.registrations.double,
  status: tables.registrations.status,
  statusAt: tables.registrations.statusAt,
  booking: tables.registrations.booking,
  bookedSeat: tables.registrations.bookedSeat,
  bookedAt: tables.registrations.bookedAt,
  bookedBy: tables.registrations.bookedBy,
  waitlistAt: tables.registrations.waitlistAt,
  waitlistRank: tables.registrations.waitlistRank,
  swapLeft: tables.registrations.swapLeft,
  createdAt: tables.registrations.createdAt,
  updatedAt: tables.registrations.updatedAt,
  discordId: tables.persons.discordId,
  discordName: tables.persons.discordName,
  nick: tables.persons.nick,
  contactId: tables.persons.contactId,
  avatar: tables.persons.avatar,
  remindersOff: tables.persons.remindersOff,
}

/** Teilnahmen eines Events (jeder Status) mit Nick, Discord und Kontaktperson der Person */
export function loadRegistrations(q: Q, eventId: number) {
  return q.select(registrationColumns).from(tables.registrations)
    .innerJoin(tables.persons, eq(tables.persons.id, tables.registrations.personId))
    .where(eq(tables.registrations.eventId, eventId))
    .orderBy(asc(tables.persons.nick)).all()
}

export type Registration = ReturnType<typeof loadRegistrations>[number]

export function findRegistration(q: Q, eventId: number, id: number) {
  return q.select(registrationColumns).from(tables.registrations)
    .innerJoin(tables.persons, eq(tables.persons.id, tables.registrations.personId))
    .where(and(eq(tables.registrations.eventId, eventId), eq(tables.registrations.id, id))).get() ?? null
}

/** Teilnahme in irgendeinem Event (für Nachrichten) */
export function findRegistrationById(q: Q, id: number) {
  return q.select(registrationColumns).from(tables.registrations)
    .innerJoin(tables.persons, eq(tables.persons.id, tables.registrations.personId))
    .where(eq(tables.registrations.id, id)).get() ?? null
}

export function findPersonByDiscordId(q: Q, discordId: string) {
  return q.select().from(tables.persons).where(eq(tables.persons.discordId, discordId)).get() ?? null
}

export interface LogEntry {
  action: string
  /** id null = keine bestimmte Teilnahme (z. B. Rollenänderung an jemandem ohne Teilnahme) */
  registration?: { id: number | null, nick: string } | null
  fromSeat?: string | null
  toSeat?: string | null
  detail?: string | null
}

export function writeLog(q: Q, eventId: number, actor: Pick<Actor, 'discordId' | 'name'> | null, e: LogEntry) {
  q.insert(tables.seatLog).values({
    eventId,
    at: new Date(),
    actorDiscordId: actor?.discordId ?? null,
    actorName: actor?.name ?? 'System',
    action: e.action,
    registrationId: e.registration?.id ?? null,
    nick: e.registration?.nick ?? null,
    fromSeat: e.fromSeat ?? null,
    toSeat: e.toSeat ?? null,
    detail: e.detail ?? null,
  }).run()
}

/** Nicks: Leerraum zusammenziehen, Steuerzeichen raus */
export function cleanText(s: string) {
  return s.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()
}

/** Nicks sind über alle Personen eindeutig (ohne Groß-/Kleinschreibung) */
export function nickTaken(q: Q, nick: string, exceptPersonId?: number) {
  const lower = nick.toLocaleLowerCase('de')
  return q.select({ id: tables.persons.id, nick: tables.persons.nick }).from(tables.persons).all()
    .some(p => p.id !== exceptPersonId && p.nick.toLocaleLowerCase('de') === lower)
}

/** Nick bereinigen und prüfen (Länge, schon vergeben); wirft 400 bzw. 409 */
export function validNick(q: Q, raw: string, exceptPersonId?: number) {
  const nick = cleanText(raw)
  if (nick.length < 2 || nick.length > 32) throw createError({ statusCode: 400, statusMessage: 'Der Nickname muss 2 bis 32 Zeichen lang sein.' })
  if (nickTaken(q, nick, exceptPersonId)) throw createError({ statusCode: 409, statusMessage: `Den Nickname „${nick}“ gibt es schon.` })
  return nick
}

/** Teilnahme einer vorhandenen Person am aktuellen Event anlegen (als „offen“); 409, wenn sie schon dabei ist */
export function addParticipation(tx: Tx, actor: Pick<Actor, 'discordId' | 'name'>, personId: number) {
  const ev = requireCurrentEvent(tx)
  const person = tx.select().from(tables.persons).where(eq(tables.persons.id, personId)).get()
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Diese Person gibt es nicht.' })
  const R = tables.registrations
  if (tx.select({ id: R.id }).from(R).where(and(eq(R.eventId, ev.id), eq(R.personId, personId))).get()) {
    throw createError({ statusCode: 409, statusMessage: `${person.nick} nimmt schon teil.` })
  }
  const now = new Date()
  const created = tx.insert(R).values({ eventId: ev.id, personId, seat: null, double: false, status: 'offen', statusAt: now, createdAt: now, updatedAt: now })
    .returning({ id: R.id }).get()
  writeLog(tx, ev.id, actor, { action: 'eingeladen', registration: { id: created.id, nick: person.nick } })
  return created.id
}

export function requireContact(q: Q, contactId: number | null) {
  if (contactId === null) return null
  const contact = q.select().from(tables.contacts).where(eq(tables.contacts.id, contactId)).get()
  if (!contact) throw createError({ statusCode: 400, statusMessage: 'Diese Kontaktperson gibt es nicht.' })
  return contact
}

export interface Moved { registrationId: number, discordId: string | null, fromSeat: string | null, toSeat: string | null }

/**
 * Setzt eine Registrierung um (oder tauscht, wenn der Platz belegt ist und actor beide bewegen darf).
 * Alle Rechte prüft checkMove in shared/utils/seating.ts; alles läuft in einer Transaktion.
 * Plätze haben nur Zugesagte; angebotene Plätze der Warteliste gelten als belegt.
 */
export function moveRegistration(actor: Actor, registrationId: number, target: string | null) {
  const moved = useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    const rows = loadRows(tx, ev.id)
    const all = loadRegistrations(tx, ev.id)
    const mine = all.find(r => r.id === registrationId)
    if (mine && mine.status !== 'zugesagt') throw createError({ statusCode: 409, statusMessage: `${mine.nick} hat nicht zugesagt und bekommt deshalb keinen Platz.` })
    const regs = all.filter(r => r.status === 'zugesagt').map(r => ({ ...r, booked: r.booking === 'gebucht' }))
    const holders = [...regs, ...heldSeats(tx, ev.id)]
    const check = checkMove({ actor, rows, holders, holderId: registrationId, target, seatsOpen: seatsOpen(eventRules(ev), new Date()), area: fixedArea(ev) })
    if (!check.ok) throw createError({ statusCode: check.status, statusMessage: check.reason })
    if (check.swapWith !== null && check.swapWith < 0) {
      throw createError({ statusCode: 409, statusMessage: `Der Platz ${target} ist gerade jemandem von der Warteliste angeboten.` })
    }
    const reg = regs.find(r => r.id === registrationId)!
    if (check.target === reg.seat) return []
    const now = new Date()
    const R = tables.registrations
    // den einmaligen Wechsel nach dem Nachrücken verbrauchen
    if (check.usedSwap) tx.update(R).set({ swapLeft: false }).where(eq(R.id, reg.id)).run()

    if (check.swapWith !== null) {
      const other = regs.find(r => r.id === check.swapWith)!
      // erst einen Platz leeren, sonst schlägt der eindeutige Index (event, seat) an
      tx.update(R).set({ seat: null }).where(eq(R.id, reg.id)).run()
      tx.update(R).set({ seat: reg.seat, updatedAt: now }).where(eq(R.id, other.id)).run()
      tx.update(R).set({ seat: other.seat, updatedAt: now }).where(eq(R.id, reg.id)).run()
      writeLog(tx, ev.id, actor, { action: 'getauscht', registration: reg, fromSeat: reg.seat, toSeat: other.seat, detail: `mit ${other.nick}` })
      writeLog(tx, ev.id, actor, { action: 'getauscht', registration: other, fromSeat: other.seat, toSeat: reg.seat, detail: `mit ${reg.nick}` })
      return [
        { registrationId: reg.id, discordId: reg.discordId, fromSeat: reg.seat, toSeat: other.seat },
        { registrationId: other.id, discordId: other.discordId, fromSeat: other.seat, toSeat: reg.seat },
      ]
    }
    tx.update(R).set({ seat: check.target, updatedAt: now }).where(eq(R.id, reg.id)).run()
    writeLog(tx, ev.id, actor, { action: check.target ? 'gesetzt' : 'freigegeben', registration: reg, fromSeat: reg.seat, toSeat: check.target })
    return [{ registrationId: reg.id, discordId: reg.discordId, fromSeat: reg.seat, toSeat: check.target }]
  })

  // Wer von jemand anderem umgesetzt wurde, bekommt (falls eingeschaltet) eine Nachricht
  for (const m of moved as Moved[]) {
    if (m.toSeat && m.discordId && m.discordId !== actor.discordId) queueAutoMessage('umsetzung', m.registrationId, false, m.fromSeat)
  }
  return moved
}

/** Farben für neue Kontaktpersonen, gut unterscheidbar in hell und dunkel */
export const CONTACT_COLORS = ['#e4572e', '#2e86ab', '#3bb273', '#e1bc29', '#7768ae', '#f18f01', '#c73e91', '#4ecdc4', '#8d6a9f', '#a4c639', '#ff6f59', '#5c80bc']

/** Für Orga-Endpunkte, die als Person handeln (Status setzen …): angemeldet und Projektleiter */
export async function requireLeaderActor(event: H3Event) {
  const actor = await requireActor(event)
  if (!actor.isLeader) throw createError({ statusCode: 403, statusMessage: 'Nur für die Orga' })
  return actor
}

/** Für Übersichten von Orga und Kontaktpersonen: angemeldet und eins von beiden */
export async function requireTeamActor(event: H3Event) {
  const actor = await requireActor(event)
  if (!actor.isLeader && actor.contactId === null) throw createError({ statusCode: 403, statusMessage: actor.isOrga ? 'Du bist keine Kontaktperson. Die Übersicht über alle steht unter Orga › Zusagen & Buchung.' : 'Nur für Orga und Kontaktpersonen' })
  return actor
}

/**
 * Wer die Plattform sehen darf: Orga, Kontaktperson, wer im aktuellen Event teilnimmt (z. B. ein Gast) oder auf unserem
 * Discord-Server ist (mit Clan-Rolle, falls eingestellt), und wer freigegeben ist (server/utils/freigabe.ts).
 * 401 ohne Login, sonst 403/503 mit data.code (not_member, approval_needed, approval_pending, approval_rejected).
 */
export async function requireInvited(event: H3Event) {
  const actor = await getActor(event)
  if (!actor) throw createError({ statusCode: 401, statusMessage: 'Bitte zuerst mit Discord anmelden.', data: { code: 'login' } })
  await requireAccess(actor.discordId)
  return actor
}
