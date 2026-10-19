import { z } from 'zod'

const bodySchema = z.object({
  registrationId: z.number().int().positive(),
  /** Sitz-ID wie A-12 oder null = Platz freigeben */
  seat: z.string().max(10).nullable(),
})

/**
 * Jemanden auf einen Platz setzen, umsetzen, tauschen oder den Platz freigeben.
 * Wer was darf (Teilnehmer, Kontaktperson, Projektleiter), entscheidet checkMove (shared/utils/seating.ts).
 */
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  if (!actor.isLeader) limitParticipant(event, actor.discordId)
  const { registrationId, seat } = await readValidatedBody(event, bodySchema.parse)
  const moved = moveRegistration(actor, registrationId, seat)
  return { moved: moved.map(m => ({ registrationId: m.registrationId, seat: m.toSeat })) }
})
