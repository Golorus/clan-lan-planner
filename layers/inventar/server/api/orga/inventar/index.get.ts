/** Orga: der ganze Bestand zum Pflegen, mit seiner Fassung (rev) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  setHeader(event, 'Cache-Control', 'no-store')
  return readStock()
})
