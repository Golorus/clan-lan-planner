import { z } from 'zod'

const bodySchema = z.object({ personId: z.number().int().positive() })

/** Projektleiter fügt eine vorhandene Person zum aktuellen Event hinzu, als „offen“ (zusagen kann sie dann selbst) */
export default defineEventHandler(async (event) => {
  const leader = await requireLeader(event)
  const { personId } = await readValidatedBody(event, bodySchema.parse)
  const actor = { discordId: leader.discordId, name: leader.displayName || leader.username }
  const id = useDb().transaction(tx => addParticipation(tx, actor, personId))
  return { id }
})
