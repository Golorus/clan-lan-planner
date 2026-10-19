import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

/** Protokoll des aktuellen Events: wer hat wann wen auf welchen Platz gesetzt */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const { limit } = await getValidatedQuery(event, z.object({ limit: z.coerce.number().int().min(1).max(5000).default(500) }).parse)
  const db = useDb()
  const ev = currentEvent(db)
  if (!ev) return []
  return db.select().from(tables.seatLog).where(eq(tables.seatLog.eventId, ev.id))
    .orderBy(desc(tables.seatLog.id)).limit(limit).all()
})
