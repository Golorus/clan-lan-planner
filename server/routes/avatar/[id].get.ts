import { eq } from 'drizzle-orm'
import { z } from 'zod'

/** Avatar einer Person (über ihre Personen-ID, nicht die Discord-ID), von unserem Server; nur für Eingeladene */
export default defineEventHandler(async (event) => {
  await requireInvited(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const person = useDb().select({ discordId: tables.persons.discordId }).from(tables.persons).where(eq(tables.persons.id, id)).get()
  const bytes = person?.discordId ? await readAvatar(person.discordId) : null
  if (!bytes) throw createError({ statusCode: 404, statusMessage: 'Kein Avatar' })
  setHeaders(event, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' })
  return bytes
})
