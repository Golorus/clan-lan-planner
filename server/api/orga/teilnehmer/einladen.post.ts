/** Alle bekannten Personen (mit Discord-ID), die im aktuellen Event noch fehlen, als „offen“ eintragen */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const invited = useDb().transaction(tx => inviteKnownPersons(tx, requireCurrentEvent(tx), leader))
  return { invited }
})
