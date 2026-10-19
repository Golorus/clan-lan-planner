import { eq, inArray, or } from 'drizzle-orm'

/**
 * „Meine Daten löschen“: entfernt die Person mit allen Teilnahmen (in allen Events), Nachrichten und den Login-Eintrag
 * der angemeldeten Person. Im Protokoll bleibt nur „(gelöscht)“ stehen, damit die Platzhistorie lesbar bleibt.
 * Wer Kontaktperson ist, bleibt als solche eingetragen, bis die Orga sie entfernt (sonst verlören ihre Leute die Zuordnung).
 */
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  limitParticipant(event, actor.discordId)
  const R = tables.registrations
  const L = tables.seatLog
  const D = tables.messageDeliveries

  const fx = newEffects(currentEvent()?.id ?? 0)
  const result = useDb().transaction((tx) => {
    const person = findPersonByDiscordId(tx, actor.discordId)
    const regs = person ? tx.select({ id: R.id }).from(R).where(eq(R.personId, person.id)).all().map(r => r.id) : []
    // wie eine Absage: Platz an die Warteliste, Kontaktperson Bescheid, Rolle weg
    releaseBeforeDelete(tx, regs, actor, fx)
    if (regs.length) tx.update(L).set({ nick: '(gelöscht)' }).where(inArray(L.registrationId, regs)).run()
    tx.update(L).set({ actorDiscordId: null, actorName: '(gelöscht)' }).where(eq(L.actorDiscordId, actor.discordId)).run()
    tx.delete(D).where(regs.length ? or(eq(D.discordId, actor.discordId), inArray(D.registrationId, regs)) : eq(D.discordId, actor.discordId)).run()
    // Teilnahmen hängen per cascade an der Person
    if (person) tx.delete(tables.persons).where(eq(tables.persons.id, person.id)).run()
    const registrations = regs.length
    tx.delete(tables.users).where(eq(tables.users.discordId, actor.discordId)).run()
    return { registrations, stillContact: actor.contactId !== null }
  })
  finish(fx)
  await clearUserSession(event)
  removeAvatar(actor.discordId)
  return result
})
