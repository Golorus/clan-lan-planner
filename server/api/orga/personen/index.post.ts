import { z } from 'zod'

const bodySchema = z.object({
  discordId: z.string().regex(/^\d{5,25}$/),
  discordName: z.string().max(100),
  nick: z.string().max(100),
  contactId: z.number().int().positive().nullable(),
  /** gleich zum aktuellen Event einladen (Status „offen“) */
  addToEvent: z.boolean().default(false),
})

/** Projektleiter legt eine Person aus unserem Discord-Server an – unabhängig von Events */
export default defineEventHandler(async (event) => {
  const leader = await requireLeader(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const actor = { discordId: leader.discordId, name: leader.displayName || leader.username }
  const P = tables.persons
  const result = useDb().transaction((tx) => {
    if (findPersonByDiscordId(tx, body.discordId)) throw createError({ statusCode: 409, statusMessage: 'Diese Person gibt es schon.' })
    const nick = validNick(tx, body.nick)
    requireContact(tx, body.contactId)
    const now = new Date()
    const id = tx.insert(P).values({
      discordId: body.discordId, discordName: cleanText(body.discordName), nick, contactId: body.contactId, createdAt: now, updatedAt: now,
    }).returning({ id: P.id }).get().id
    const registrationId = body.addToEvent ? addParticipation(tx, actor, id) : null
    return { id, registrationId }
  })
  return result
})
