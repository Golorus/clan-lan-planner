import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

/** Einzelne Zustellungen einer Rundnachricht (mit Fehlern, z. B. DMs gesperrt) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const D = tables.messageDeliveries
  return useDb().select().from(D).where(eq(D.batchId, id)).orderBy(asc(D.nick)).all()
    .map(d => ({ id: d.id, nick: d.nick, status: d.status, error: d.error, text: d.text, sentAt: d.sentAt }))
})
