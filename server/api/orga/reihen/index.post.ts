import { eq, max } from 'drizzle-orm'
import { z } from 'zod'
import { CARPETS, ROW_LETTER } from '#shared/utils/seating'

const bodySchema = z.object({
  letter: z.string().trim().toUpperCase().regex(ROW_LETTER, 'Reihe: ein oder zwei Buchstaben A–Z'),
  start: z.number().int().min(1).max(9960),
  carpet: z.enum(CARPETS),
})

/** Neue Reihe im aktuellen Event (hinten angehängt) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const S = tables.seatRows
  const id = useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    if (loadRows(tx, ev.id).some(r => r.letter === body.letter)) throw createError({ statusCode: 409, statusMessage: `Reihe ${body.letter} gibt es schon.` })
    const position = (tx.select({ p: max(S.position) }).from(S).where(eq(S.eventId, ev.id)).get()?.p ?? -1) + 1
    return tx.insert(S).values({ eventId: ev.id, ...body, position }).returning({ id: S.id }).get().id
  })
  return { id }
})
