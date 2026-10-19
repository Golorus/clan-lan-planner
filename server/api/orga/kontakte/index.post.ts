import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  discordId: z.string().regex(/^\d{5,25}$/),
  discordName: z.string().max(100),
  nick: z.string().max(100),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
})

/** Kontaktperson ernennen (Auswahl aus den Discord-Mitgliedern) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const nick = cleanText(body.nick)
  if (nick.length < 2 || nick.length > 32) throw createError({ statusCode: 400, statusMessage: 'Der Nickname muss 2 bis 32 Zeichen lang sein.' })
  const db = useDb()
  const C = tables.contacts
  if (db.select({ id: C.id }).from(C).where(eq(C.discordId, body.discordId)).get()) {
    throw createError({ statusCode: 409, statusMessage: 'Diese Person ist schon Kontaktperson.' })
  }
  const used = new Set(db.select({ color: C.color }).from(C).all().map(c => c.color))
  const color = body.color ?? CONTACT_COLORS.find(c => !used.has(c)) ?? CONTACT_COLORS[used.size % CONTACT_COLORS.length]!
  const created = db.insert(C).values({ discordId: body.discordId, discordName: cleanText(body.discordName), nick, color, createdAt: new Date() })
    .returning({ id: C.id }).get()
  return { id: created.id }
})
