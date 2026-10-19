import { asc } from 'drizzle-orm'

/** Kontaktpersonen (dauerhaft) mit der Zahl ihrer Leute: zugesagt im aktuellen Event (people) und insgesamt (persons) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const db = useDb()
  const ev = currentEvent(db)
  const regs = ev ? loadRegistrations(db, ev.id).filter(r => r.status === 'zugesagt') : []
  const persons = db.select({ contactId: tables.persons.contactId }).from(tables.persons).all()
  return db.select().from(tables.contacts).orderBy(asc(tables.contacts.nick)).all().map(c => ({
    id: c.id,
    discordId: c.discordId,
    discordName: c.discordName,
    nick: c.nick,
    color: c.color,
    people: regs.filter(r => r.contactId === c.id).length,
    persons: persons.filter(p => p.contactId === c.id).length,
  }))
})
