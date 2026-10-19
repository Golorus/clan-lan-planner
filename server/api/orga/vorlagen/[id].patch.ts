import { eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const body = await readValidatedBody(event, z.object({ name: z.string().trim().min(1).max(60), body: z.string().trim().min(1).max(1900) }).parse)
  const res = useDb().update(tables.messageTemplates).set(body).where(eq(tables.messageTemplates.id, id)).run()
  if (!res.changes) throw createError({ statusCode: 404, statusMessage: 'Diese Vorlage gibt es nicht.' })
  return { ok: true }
})
