import { z } from 'zod'

const bodySchema = z.object({ ids: z.array(z.number().int().positive()).max(1000) })

/** Reihenfolge der Warteliste ändern: alle IDs der Liste in der neuen Reihenfolge */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const { ids } = await readValidatedBody(event, bodySchema.parse)
  reorderWaitlist(leader, ids)
  return { ok: true }
})
