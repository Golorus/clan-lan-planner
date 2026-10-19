/**
 * „Bin nicht dabei“ für die eigene Teilnahme am aktuellen Event: geht immer, auch nach der Frist.
 * Der Platz wird sofort frei, die Kontaktperson bekommt Bescheid; die Person bleibt bestehen.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  limitParticipant(event, actor.discordId)
  return setStatus(actor, resolveRegistrationId(actor, undefined), 'abgesagt')
})
