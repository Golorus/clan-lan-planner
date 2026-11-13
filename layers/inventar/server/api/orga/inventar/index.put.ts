import { z } from 'zod'

/** Orga: den ganzen Bestand speichern; rev = die Fassung, die die Seite gelesen hat (409 bei Änderung durch andere) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const body = await readValidatedBody(event, z.object({
    rev: z.number().int().min(0),
    containers: z.array(z.record(z.string(), z.unknown())).max(500),
    articles: z.array(z.record(z.string(), z.unknown())).max(5000),
  }).parse)
  return writeStock(body, body.rev)
})
