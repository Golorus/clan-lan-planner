import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = eventFieldsSchema.extend({
  /** Reihen von diesem Event übernehmen */
  copyRowsFrom: z.number().int().positive().nullable(),
  makeCurrent: z.boolean(),
})

/** Neues Event; die Personen bleiben und stehen, wenn es das aktuelle wird, darin als „offen“ */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const fields = eventFields(body)
  const E = tables.events
  let becameCurrent = false
  const id = useDb().transaction((tx) => {
    const isFirst = !tx.select({ id: E.id }).from(E).get()
    const makeCurrent = body.makeCurrent || isFirst
    if (makeCurrent) tx.update(E).set({ isCurrent: false }).run()
    const created = tx.insert(E).values({ ...fields, registrationOpen: false, isCurrent: makeCurrent, createdAt: new Date() })
      .returning({ id: E.id }).get()
    if (body.copyRowsFrom) {
      if (!tx.select({ id: E.id }).from(E).where(eq(E.id, body.copyRowsFrom)).get()) {
        throw createError({ statusCode: 400, statusMessage: 'Das Event zum Übernehmen der Reihen gibt es nicht.' })
      }
      for (const r of loadRows(tx, body.copyRowsFrom)) {
        tx.insert(tables.seatRows).values({ eventId: created.id, letter: r.letter, start: r.start, carpet: r.carpet, position: r.position }).run()
      }
    }
    if (makeCurrent) {
      becameCurrent = true
      inviteKnownPersons(tx, tx.select().from(E).where(eq(E.id, created.id)).get()!, leader)
    }
    return created.id
  })
  if (becameCurrent) void syncEventRole(leader).catch(e => console.error('[rolle] Abgleich fehlgeschlagen:', e))
  return { id }
})
