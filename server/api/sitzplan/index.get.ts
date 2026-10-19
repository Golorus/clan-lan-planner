import { and, asc, eq } from 'drizzle-orm'
import { demandPhase, isFull, seatsOpen, sortWaitlist, waitlistActive } from '#shared/utils/registration'

/** der Bot vergibt die Event-Rolle im Hintergrund: erst danach warnen, wenn sie fehlt */
const ROLE_GRACE_MS = 10 * 60_000

/** zugesagt, aber auf Discord fehlt die Event-Rolle; ohne Bot, ohne Rolle oder bei Fehlern: keine Warnung */
async function roleMissing(discordId: string, reg: { status: string, statusAt: Date | null } | null) {
  if (reg?.status !== 'zugesagt' || !reg.statusAt || Date.now() - reg.statusAt.getTime() < ROLE_GRACE_MS) return false
  const roleId = roleConfig().eventRoleId
  if (!roleId || !discordConfigured()) return false
  try {
    const roles = await guildMemberRoles(discordId)
    return roles !== null && !roles.includes(roleId)
  }
  catch {
    return false
  }
}

function teamCounts(list: ReturnType<typeof loadRegistrations>) {
  const zu = list.filter(r => r.status === 'zugesagt')
  return {
    offen: list.filter(r => r.status === 'offen').length,
    ohnePlatz: zu.filter(r => !r.seat).length,
    nichtGebucht: zu.filter(r => r.booking !== 'gebucht').length,
  }
}

/**
 * Sitzplan des aktuellen Events, nur für Eingeladene (angemeldet und Mitglied unseres Discord-Servers, Orga,
 * Kontaktperson oder mit Teilnahme): Zugesagte mit Nick, Avatar, Platz und Kontaktperson (als Farbe/Gruppe).
 * Discord-IDs und -Namen kommen hier nie heraus. „me“: eigene Teilnahme mit Status, Warteliste, Angebot und Buchung.
 * Der Buchungscode steht nur hier und nur für die eigene Person, wenn sie zugesagt hat und die Buchung freigegeben ist.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const actor = await requireInvited(event)
  const db = useDb()
  const ev = currentEvent(db)
  const contactRows = db.select().from(tables.contacts).orderBy(asc(tables.contacts.nick)).all()
  const contacts = contactRows.map(c => ({ id: c.id, nick: c.nick, color: c.color }))
  /** wer selbst Kontaktperson ist, erscheint im Plan in seiner eigenen Farbe */
  const ownContact = new Map(contactRows.map(c => [c.discordId, c.id]))
  const regs = ev ? loadRegistrations(db, ev.id) : []
  const confirmed = regs.filter(r => r.status === 'zugesagt')
  const mine = regs.find(r => r.discordId === actor.discordId) ?? null
  const person = findPersonByDiscordId(db, actor.discordId)
  const now = new Date()
  const rules = ev ? eventRules(ev) : null

  const O = tables.waitlistOffers
  const offer = mine ? db.select().from(O).where(and(eq(O.registrationId, mine.id), eq(O.status, 'offen'))).get() ?? null : null
  const waitlist = sortWaitlist(regs.filter(r => r.waitlistAt && r.status !== 'zugesagt'))
  const booking = ev && mine?.status === 'zugesagt' && ev.bookingReleasedAt
    ? { code: ev.bookingCode, url: ev.bookingUrl, until: ev.bookingUntil, status: mine.booking, bookedSeat: mine.bookedSeat }
    : null

  return {
    event: ev && rules
      ? {
          name: ev.name, startsAt: ev.startsAt, endsAt: ev.endsAt, location: ev.location,
          registrationOpen: ev.registrationOpen,
          /** von Hand vorzeitig geschlossen (für die Zeitleiste und dieselbe demandPhase im Browser) */
          demandClosedAt: ev.demandClosedAt?.toISOString() ?? null,
          demandUntil: ev.demandUntil, bookingFrom: ev.bookingFrom, bookingUntil: ev.bookingUntil,
          phase: demandPhase(rules, now),
          seatsOpen: seatsOpen(rules, now),
          waitlistActive: waitlistActive(rules, now, confirmed.length),
          full: isFull(rules, confirmed.length),
          maxParticipants: ev.maxParticipants,
          bookingReleased: !!ev.bookingReleasedAt,
          bookingReleasedAt: ev.bookingReleasedAt?.toISOString() ?? null,
          /** Plätze im fixierten Bereich, begrenzt die Zusagen wie im Backend */
          areaSize: rules.areaSize ?? null,
          areaFixed: !!ev.areaFixedAt,
          waiting: waitlist.length,
        }
      : null,
    rows: ev ? loadRows(db, ev.id).map(r => ({ id: r.id, letter: r.letter, start: r.start, carpet: r.carpet })) : [],
    contacts,
    people: confirmed.map(r => ({
      id: r.id, nick: r.nick, seat: r.seat, double: r.double, contactId: r.contactId, avatar: avatarUrl(r.personId, r.avatar),
      ownContactId: r.discordId ? ownContact.get(r.discordId) ?? null : null,
      booked: r.booking === 'gebucht',
    })),
    /** dem Veranstalter gemeldeter Bereich: fixiert für alle sichtbar, als Entwurf nur für die Orga */
    area: ev && (ev.areaFixedAt || actor.isLeader) && areaSeats(ev).length ? { seats: areaSeats(ev), fixed: !!ev.areaFixedAt } : null,
    /** Plätze, die gerade jemandem von der Warteliste angeboten sind */
    held: ev ? heldSeats(db, ev.id).map(h => h.seat!) : [],
    me: {
      name: actor.name,
      isLeader: actor.isLeader,
      contactId: actor.contactId,
      registrationId: mine?.id ?? null,
      status: mine?.status ?? null,
      seat: mine?.seat ?? null,
      swapLeft: mine?.swapLeft ?? false,
      waitlistPosition: mine?.waitlistAt ? waitlist.findIndex(w => w.id === mine.id) + 1 : null,
      offer: offer ? { id: offer.id, seat: offer.seat, expiresAt: offer.expiresAt } : null,
      booking,
      /** nur für Kontaktpersonen: Stand ihrer Leute im aktuellen Event */
      team: actor.contactId ? teamCounts(regs.filter(r => r.contactId === actor.contactId)) : null,
      remindersOff: person?.remindersOff ?? false,
      avatar: avatarUrl(person?.id, person?.avatar ?? null),
      /** gespeicherte Angaben der eigenen Person (auch ohne Teilnahme am aktuellen Event), zum Vorausfüllen */
      person: person ? { nick: person.nick, contactId: person.contactId } : null,
      /** nur für die eigene Person: false = nicht auf unserem Discord-Server, Nachrichten kommen nicht an */
      isMember: await memberStatus(actor.discordId),
      /** zugesagt, aber die Event-Rolle fehlt auf Discord: Hinweis an die Orga */
      roleMissing: await roleMissing(actor.discordId, mine),
    },
  }
})
