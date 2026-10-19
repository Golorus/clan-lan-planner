import { z } from 'zod'

const bodySchema = z.object({ offerId: z.number().int().positive(), accept: z.boolean() })

/** Platzangebot von der Warteliste annehmen oder ablehnen (die eigene Person; die Orga auch für andere) */
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  if (!actor.isLeader) limitParticipant(event, actor.discordId)
  const { offerId, accept } = await readValidatedBody(event, bodySchema.parse)
  return answerOffer(offerId, accept, actor)
})
