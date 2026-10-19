import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { checkDouble } from '#shared/utils/seating'

const bodySchema = z.object({
  nick: z.string().max(100).optional(),
  contactId: z.number().int().positive().nullable().optional(),
  double: z.boolean().optional(),
  status: z.enum(['offen', 'zugesagt', 'abgesagt']).optional(),
})

/**
 * Projektleiter ändert einen Teilnehmer: Nick und Kontaktperson gehören zur Person (gelten also dauerhaft),
 * die Breite (einfach/doppelt) und der Status (offen, zugesagt, abgesagt) zur Teilnahme an diesem Event.
 */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const actor = leader
  const R = tables.registrations
  const P = tables.persons

  useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    const reg = findRegistration(tx, ev.id, id)
    if (!reg) throw createError({ statusCode: 404, statusMessage: 'Diesen Teilnehmer gibt es nicht.' })
    const person: Partial<typeof P.$inferInsert> = {}
    const changes: string[] = []

    if (body.nick !== undefined) {
      const nick = validNick(tx, body.nick, reg.personId)
      if (nick !== reg.nick) {
        person.nick = nick
        changes.push(`Nick ${reg.nick} → ${nick}`)
      }
    }
    if (body.contactId !== undefined && body.contactId !== reg.contactId) {
      const contact = requireContact(tx, body.contactId)
      person.contactId = body.contactId
      changes.push(`Kontaktperson → ${contact?.nick ?? 'keine'}`)
    }
    if (body.double !== undefined && body.double !== reg.double) {
      if (reg.status !== 'zugesagt') throw createError({ statusCode: 409, statusMessage: `${reg.nick} hat nicht zugesagt.` })
      const check = checkDouble(loadRows(tx, ev.id), seatHolders(tx, ev.id), reg.id, body.double)
      if (!check.ok) throw createError({ statusCode: check.status, statusMessage: check.reason })
      tx.update(R).set({ double: body.double, updatedAt: new Date() }).where(eq(R.id, reg.id)).run()
      changes.push(body.double ? 'doppelt breit' : 'einfach breit')
    }
    if (Object.keys(person).length) tx.update(P).set({ ...person, updatedAt: new Date() }).where(eq(P.id, reg.personId)).run()
    if (changes.length) writeLog(tx, ev.id, actor, { action: 'geändert', registration: { id: reg.id, nick: person.nick ?? reg.nick }, detail: changes.join(', ') })
  })
  if (body.status !== undefined) setStatus(leader, id, body.status)
  return { ok: true }
})
