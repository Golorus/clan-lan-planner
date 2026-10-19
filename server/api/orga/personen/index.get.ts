import { asc, eq, sql } from 'drizzle-orm'

/** Alle Personen (dauerhaft), mit Kontaktperson, Zahl der Zusagen und Status im aktuellen Event */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const db = useDb()
  const ev = currentEvent(db)
  const current = new Map((ev ? loadRegistrations(db, ev.id) : []).map(r => [r.personId, r]))
  const R = tables.registrations
  const counts = new Map(db.select({ personId: R.personId, n: sql<number>`count(*)` }).from(R).where(eq(R.status, 'zugesagt')).groupBy(R.personId).all().map(r => [r.personId, r.n]))
  const contacts = new Map(db.select().from(tables.contacts).all().map(c => [c.id, c.nick]))
  return {
    event: ev ? { id: ev.id, name: ev.name } : null,
    people: db.select().from(tables.persons).orderBy(asc(tables.persons.nick)).all().map(p => ({
      id: p.id,
      nick: p.nick,
      discordId: p.discordId,
      discordName: p.discordName,
      contactId: p.contactId,
      contactNick: p.contactId ? contacts.get(p.contactId) ?? null : null,
      events: counts.get(p.id) ?? 0,
      registrationId: current.get(p.id)?.id ?? null,
      seat: current.get(p.id)?.seat ?? null,
      status: current.get(p.id)?.status ?? null,
      waitlist: !!current.get(p.id)?.waitlistAt,
    })),
  }
})
