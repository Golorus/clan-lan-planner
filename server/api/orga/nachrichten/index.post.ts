import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  target: z.discriminatedUnion('type', [
    z.object({ type: z.literal('person'), registrationId: z.number().int().positive() }),
    z.object({ type: z.literal('contact'), contactId: z.number().int().positive() }),
    z.object({ type: z.literal('all') }),
  ]),
  body: z.string().trim().min(1, 'Die Nachricht ist leer.').max(1900),
})

/** Nachricht über den Bot an eine Person, an die zugesagten Leute einer Kontaktperson oder an alle Zugesagten */
export default defineEventHandler(async (event) => {
  const leader = await requireLeader(event)
  const { target, body } = await readValidatedBody(event, bodySchema.parse)
  if (!discordConfigured() && !botOptional()) {
    throw createError({ statusCode: 500, statusMessage: 'Der Discord-Bot ist nicht eingerichtet (NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_GUILD_ID).' })
  }
  const db = useDb()
  const ev = requireCurrentEvent(db)
  const regs = loadRegistrations(db, ev.id)
  const confirmed = regs.filter(r => r.status === 'zugesagt')
  let recipients = confirmed
  let label = 'alle Zugesagten'
  if (target.type === 'person') {
    recipients = regs.filter(r => r.id === target.registrationId)
    label = recipients[0]?.nick ?? ''
  }
  else if (target.type === 'contact') {
    const contact = db.select().from(tables.contacts).where(eq(tables.contacts.id, target.contactId)).get()
    if (!contact) throw createError({ statusCode: 400, statusMessage: 'Diese Kontaktperson gibt es nicht.' })
    recipients = confirmed.filter(r => r.contactId === contact.id)
    label = `Leute von ${contact.nick}`
  }
  if (!recipients.length) throw createError({ statusCode: 400, statusMessage: 'Keine Empfänger.' })
  const id = queueBatch(ev.id, leader.displayName || leader.username, label, body, recipients)
  return { id, recipients: recipients.length }
})
