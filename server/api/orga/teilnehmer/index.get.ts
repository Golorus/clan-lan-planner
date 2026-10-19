import { and, eq } from 'drizzle-orm'

/**
 * Alle Teilnahmen des aktuellen Events (jeder Status), mit Discord-Daten, offenem Angebot und dem Stand der
 * Nachrichten, auf die es je Stand ankommt (Erinnerung, Nachricht von Hand, Info, Buchung, Angebot); nur für /orga
 */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const db = useDb()
  const ev = currentEvent(db)
  if (!ev) return { event: null, infoAuto: getMessageSettings().registrierung.enabled, people: [] }
  const contacts = new Map(db.select().from(tables.contacts).all().map(c => [c.id, c]))
  const messages = deliveryStatus(ev.id, ['registrierung', 'erinnerung_offen', 'manuell', 'buchung', 'angebot'])
  const contacted = contactedRegistrations(ev.id)
  const O = tables.waitlistOffers
  const offers = new Map(db.select().from(O).where(and(eq(O.eventId, ev.id), eq(O.status, 'offen'))).all().map(o => [o.registrationId, o]))
  return {
    event: { id: ev.id, name: ev.name, bookingReleased: !!ev.bookingReleasedAt },
    /** wird die Info-Nachricht bei Registrierung automatisch verschickt? */
    infoAuto: getMessageSettings().registrierung.enabled,
    people: loadRegistrations(db, ev.id).map((r) => {
      const offer = offers.get(r.id)
      const m = messages.get(r.id) ?? {}
      return {
        id: r.id,
        personId: r.personId,
        nick: r.nick,
        discordId: r.discordId,
        discordName: r.discordName,
        contactId: r.contactId,
        contactNick: r.contactId ? contacts.get(r.contactId)?.nick ?? null : null,
        seat: r.seat,
        double: r.double,
        status: r.status,
        statusAt: r.statusAt,
        waitlistAt: r.waitlistAt,
        booking: r.booking,
        bookedSeat: r.bookedSeat,
        remindersOff: r.remindersOff,
        createdAt: r.createdAt,
        offer: offer ? { id: offer.id, expiresAt: offer.expiresAt } : null,
        /** hat in diesem Event schon eine Nachricht aus dem Tool erhalten: „eingeladen“ statt „offen“ */
        contacted: contacted.has(r.id),
        /** neueste Nachricht je Art an die Person selbst */
        messages: m,
        /** Info-Nachricht (wie messages.registrierung, für ältere Aufrufer) */
        info: m.registrierung ?? null,
      }
    }),
  }
})
