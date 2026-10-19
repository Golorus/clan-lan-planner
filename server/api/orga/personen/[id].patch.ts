import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  nick: z.string().max(100).optional(),
  contactId: z.number().int().positive().nullable().optional(),
})

/** Nick und Kontaktperson einer Person ändern (gilt für alle Events) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const P = tables.persons
  useDb().transaction((tx) => {
    if (!tx.select({ id: P.id }).from(P).where(eq(P.id, id)).get()) throw createError({ statusCode: 404, statusMessage: 'Diese Person gibt es nicht.' })
    const set: Partial<typeof P.$inferInsert> = {}
    if (body.nick !== undefined) set.nick = validNick(tx, body.nick, id)
    if (body.contactId !== undefined) {
      requireContact(tx, body.contactId)
      set.contactId = body.contactId
    }
    if (Object.keys(set).length) tx.update(P).set({ ...set, updatedAt: new Date() }).where(eq(P.id, id)).run()
  })
  return { ok: true }
})
