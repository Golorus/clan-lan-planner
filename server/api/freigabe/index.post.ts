import { z } from 'zod'

const bodySchema = z.object({ nick: z.string().max(100), contactId: z.number().int().positive() })

/** Freigabe anfragen: Nick und Kontaktperson; die Kontaktperson bekommt eine DM mit „Annehmen“/„Ablehnen“ */
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  limitParticipant(event, actor.discordId)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Bitte Nickname und Kontaktperson angeben.' })
  return requestApproval(actor, parsed.data.nick, parsed.data.contactId)
})
