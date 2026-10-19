import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { seatsOpen } from '#shared/utils/registration'

const bodySchema = z.object({
  nick: z.string().max(100),
  contactId: z.number().int().positive(),
  /** statt zuzusagen auf die Warteliste (nach dem Ende der Bedarfsabfrage) */
  waitlist: z.boolean().default(false),
})

/**
 * „Bin dabei“ mit Angaben (Nick, Kontaktperson) für das aktuelle Event, nach dem Ende der Bedarfsabfrage
 * „Auf die Warteliste“. Die Person bleibt über alle Events bestehen; Nick und Kontaktperson gehören zu ihr.
 * Nur mit Discord-Login und nur für Leute, die in den Planner dürfen (requireAccess), die Kontaktperson ist Pflicht.
 * Wer noch nicht auf dem Server ist, bekommt 409 mit code „not_member“ und kann über /auth/discord?join=1 beitreten.
 * Ist Zusagen nicht mehr möglich, kommt 409 mit code „waitlist“; die Angaben sind dann trotzdem gespeichert.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  limitParticipant(event, actor.discordId)
  // nur wer in den Planner darf (Clan-Rolle oder freigegeben, server/utils/freigabe.ts)
  await requireAccess(actor.discordId)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    const contactMissing = parsed.error.issues.some(i => i.path[0] === 'contactId')
    throw createError({ statusCode: 400, statusMessage: contactMissing ? 'Bitte eine Kontaktperson auswählen – ohne geht die Zusage nicht.' : 'Ungültige Angaben.' })
  }
  const body = parsed.data

  const db = useDb()
  const ev = requireCurrentEvent(db)
  const contact = db.select().from(tables.contacts).where(eq(tables.contacts.id, body.contactId)).get()
  if (!contact) throw createError({ statusCode: 400, statusMessage: 'Bitte eine Kontaktperson auswählen – ohne geht die Zusage nicht.' })
  const person = findPersonByDiscordId(db, actor.discordId)
  const nick = validNick(db, body.nick, person?.id)
  const R = tables.registrations
  const existing = person
    ? db.select().from(R).where(and(eq(R.eventId, ev.id), eq(R.personId, person.id))).get()
    : undefined

  // Wer neu ist, muss auf unserem Discord-Server sein (eine bestimmte Rolle braucht es nicht)
  if (!existing) await requireGuildMember(actor.discordId)
  // die Kontaktperson wechseln geht nur, solange die Platzwahl läuft (sonst entscheidet die neue über einen fremden Platz)
  if (existing?.status === 'zugesagt' && person && person.contactId !== contact.id && !actor.isLeader && !seatsOpen(eventRules(ev), new Date())) {
    throw createError({ statusCode: 403, statusMessage: 'Die Platzwahl ist vorbei: die Kontaktperson ändert jetzt nur noch die Orga.' })
  }

  const now = new Date()
  const P = tables.persons
  const { id, created } = db.transaction((tx) => {
    let personId: number
    if (person) {
      tx.update(P).set({ nick, contactId: contact.id, discordName: actor.username, updatedAt: now }).where(eq(P.id, person.id)).run()
      personId = person.id
    }
    else {
      const avatar = tx.select({ avatar: tables.users.avatar }).from(tables.users).where(eq(tables.users.discordId, actor.discordId)).get()?.avatar ?? null
      personId = tx.insert(P).values({ discordId: actor.discordId, discordName: actor.username, nick, contactId: contact.id, avatar, createdAt: now, updatedAt: now })
        .returning({ id: P.id }).get().id
    }
    if (existing && person) {
      const changes = [person.nick !== nick && `Nick ${person.nick} → ${nick}`, person.contactId !== contact.id && `Kontaktperson → ${contact.nick}`].filter(Boolean)
      if (changes.length) writeLog(tx, ev.id, actor, { action: 'geändert', registration: { id: existing.id, nick }, detail: changes.join(', ') })
      return { id: existing.id, created: false }
    }
    const reg = tx.insert(R).values({ eventId: ev.id, personId, seat: null, double: false, status: 'offen', statusAt: now, createdAt: now, updatedAt: now })
      .returning({ id: R.id }).get()
    writeLog(tx, ev.id, actor, { action: 'angemeldet', registration: { id: reg.id, nick }, detail: `Kontaktperson ${contact.nick}` })
    return { id: reg.id, created: true }
  })

  const reg = findRegistration(db, ev.id, id)!
  if (body.waitlist) {
    if (!reg.waitlistAt) joinWaitlist(actor, id)
  }
  else if (reg.status !== 'zugesagt') setStatus(actor, id, 'zugesagt')
  return { id, created }
})
