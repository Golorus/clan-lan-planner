import { eq } from 'drizzle-orm'
import { z } from 'zod'

/** Kontaktperson entfernen; ihre Leute bleiben registriert, nur ohne Kontaktperson */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const res = useDb().delete(tables.contacts).where(eq(tables.contacts.id, id)).run()
  if (!res.changes) throw createError({ statusCode: 404, statusMessage: 'Diese Kontaktperson gibt es nicht.' })
  return { ok: true }
})
