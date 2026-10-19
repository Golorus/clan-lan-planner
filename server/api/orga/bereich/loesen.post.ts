/** Orga: Fixierung des Bereichs lösen (der markierte Bereich bleibt zum Weiterbearbeiten) */
export default defineEventHandler(async (event) => {
  releaseArea(await requireLeaderActor(event))
  return { ok: true }
})
