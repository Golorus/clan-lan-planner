import { z } from 'zod'

/** Orga: neue Runde beim Packen starten (Hinweg oder Rückweg); alle Zähler beginnen wieder bei null */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { round } = await readValidatedBody(event, z.object({ round: z.enum(['hin', 'rueck']) }).parse)
  startRound(round)
  return packView()
})
