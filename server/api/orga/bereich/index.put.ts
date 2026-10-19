import { z } from 'zod'

const bodySchema = z.object({ seats: z.array(z.string().max(10)).max(2000) })

/** Orga: den dem Veranstalter gemeldeten Bereich markieren (Entwurf, solange nicht fixiert) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { seats } = await readValidatedBody(event, bodySchema.parse)
  return setArea(seats)
})
