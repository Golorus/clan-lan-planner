import { z } from 'zod'

/**
 * Für andere Module: der Bestand je Artikelart des Moduls (Schlüssel → Anzahl), z. B. für ein „haben wir“
 * neben dem eigenen Bedarf. Lesen darf, wer in den Planner darf.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await requireAccess(user.discordId)
  const { modul } = await getValidatedQuery(event, z.object({ modul: z.string().min(1).max(60) }).parse)
  setHeader(event, 'Cache-Control', 'no-store')
  return { modul, counts: stockCounts(modul) }
})
