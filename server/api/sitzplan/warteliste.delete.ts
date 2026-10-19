/** Sich selbst von der Warteliste nehmen; ein offenes Angebot geht dann an den Nächsten */
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  limitParticipant(event, actor.discordId)
  leaveWaitlist(actor, resolveRegistrationId(actor, undefined))
  return { ok: true }
})
