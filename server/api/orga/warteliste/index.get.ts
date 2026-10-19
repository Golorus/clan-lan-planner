import { desc, eq } from 'drizzle-orm'
import { sortWaitlist, waitlistActive } from '#shared/utils/registration'

/** Warteliste des aktuellen Events in ihrer Reihenfolge, mit offenen Angeboten und den letzten Antworten */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const db = useDb()
  const ev = currentEvent(db)
  if (!ev) return { event: null, active: false, auto: false, offerHours: 48, list: [], offers: [] }
  const regs = loadRegistrations(db, ev.id)
  const contacts = new Map(db.select().from(tables.contacts).all().map(c => [c.id, c.nick]))
  const O = tables.waitlistOffers
  const offers = db.select().from(O).where(eq(O.eventId, ev.id)).orderBy(desc(O.id)).limit(50).all()
  const openOffer = new Map(offers.filter(o => o.status === 'offen').map(o => [o.registrationId, o]))
  const nick = new Map(regs.map(r => [r.id, r.nick]))
  return {
    event: { id: ev.id, name: ev.name },
    active: waitlistActive(eventRules(ev), new Date(), countConfirmed(db, ev.id)),
    auto: ev.waitlistAuto,
    offerHours: ev.offerHours,
    list: sortWaitlist(regs.filter(r => r.waitlistAt && r.status !== 'zugesagt')).map((r, i) => ({
      position: i + 1, id: r.id, nick: r.nick, status: r.status, contactNick: r.contactId ? contacts.get(r.contactId) ?? null : null,
      waitlistAt: r.waitlistAt, offer: openOffer.get(r.id) ? { id: openOffer.get(r.id)!.id, seat: openOffer.get(r.id)!.seat, expiresAt: openOffer.get(r.id)!.expiresAt } : null,
    })),
    offers: offers.map(o => ({ id: o.id, nick: nick.get(o.registrationId) ?? '(gelöscht)', seat: o.seat, status: o.status, createdAt: o.createdAt, expiresAt: o.expiresAt, answeredAt: o.answeredAt })),
  }
})
