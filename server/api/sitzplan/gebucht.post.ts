import { z } from 'zod'

const bodySchema = z.object({
  /** leer = die eigene Teilnahme; Kontaktpersonen für ihre Leute, die Orga für alle */
  registrationId: z.number().int().positive().optional(),
  booked: z.boolean(),
  /** der tatsächlich gebuchte Platz, z. B. A-81; leer = wie geplant */
  seat: z.string().max(10).nullable().default(null),
})

/** „Ich habe gebucht“ beim Veranstalter melden (oder zurücknehmen); ein anderer Platz als geplant wird in /orga markiert */
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  if (!actor.isLeader) limitParticipant(event, actor.discordId)
  const body = await readValidatedBody(event, bodySchema.parse)
  return setBooking(actor, resolveRegistrationId(actor, body.registrationId), body.booked, body.seat?.trim() || null)
})
