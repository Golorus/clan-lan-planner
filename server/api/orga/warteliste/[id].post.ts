import { z } from 'zod'

const bodySchema = z.object({ action: z.enum(['nachruecken', 'entfernen', 'anbieten']) })

/**
 * Orga an der Warteliste: jemanden direkt nachrücken lassen (zugesagt, mit seinem offenen Angebot falls vorhanden),
 * von der Liste nehmen (ein offenes Angebot geht weiter) oder ihm jetzt ein Angebot ohne festen Platz machen.
 */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const { action } = await readValidatedBody(event, bodySchema.parse)
  if (action === 'nachruecken') return promoteByLeader(leader, id)
  if (action === 'entfernen') {
    removeFromWaitlistByLeader(leader, id)
    return { ok: true }
  }
  return offerToByLeader(leader, id)
})
