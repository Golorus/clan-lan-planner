/** Packstand für alle, die in den Planner dürfen: Kisten, Artikel, Runde und Zähler */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await requireAccess(user.discordId)
  setHeader(event, 'Cache-Control', 'no-store')
  return packView()
})
