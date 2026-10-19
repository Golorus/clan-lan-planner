import { z } from 'zod'

const bodySchema = z.object({
  /** leer = die eigene Teilnahme */
  registrationId: z.number().int().positive().optional(),
  status: z.enum(['offen', 'zugesagt', 'abgesagt']),
})

/**
 * Status einer Teilnahme setzen: „Bin dabei“ / „Bin nicht dabei“ für sich selbst, absagen auch als Kontaktperson
 * für die eigenen Leute, alles als Orga. Fristen und Rechte prüft checkStatus (shared/utils/registration.ts).
 */
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  if (!actor.isLeader) limitParticipant(event, actor.discordId)
  const body = await readValidatedBody(event, bodySchema.parse)
  return setStatus(actor, resolveRegistrationId(actor, body.registrationId), body.status)
})
