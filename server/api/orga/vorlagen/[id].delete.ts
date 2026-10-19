import { eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  useDb().delete(tables.messageTemplates).where(eq(tables.messageTemplates.id, id)).run()
  return { ok: true }
})
