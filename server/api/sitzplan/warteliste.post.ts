/** Sich selbst auf die Warteliste setzen (erst nach dem Ende der Bedarfsabfrage oder wenn alle Plätze vergeben sind) */
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  limitParticipant(event, actor.discordId)
  joinWaitlist(actor, resolveRegistrationId(actor, undefined))
  return { ok: true }
})
