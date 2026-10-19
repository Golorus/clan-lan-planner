import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  nick: z.string().max(100).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
})

export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const set: { nick?: string, color?: string } = {}
  if (body.nick !== undefined) {
    set.nick = cleanText(body.nick)
    if (set.nick.length < 2 || set.nick.length > 32) throw createError({ statusCode: 400, statusMessage: 'Der Nickname muss 2 bis 32 Zeichen lang sein.' })
  }
  if (body.color) set.color = body.color.toLowerCase()
  if (!Object.keys(set).length) return { ok: true }
  const res = useDb().update(tables.contacts).set(set).where(eq(tables.contacts.id, id)).run()
  if (!res.changes) throw createError({ statusCode: 404, statusMessage: 'Diese Kontaktperson gibt es nicht.' })
  return { ok: true }
})
