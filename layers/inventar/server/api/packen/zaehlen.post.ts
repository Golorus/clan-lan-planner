import { z } from 'zod'

/** Zählt beim Packen (+1/−1 je Artikel); mehrere auf einmal, z. B. nachgesendet nach einer Zeit ohne Netz */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await requireAccess(user.discordId)
  const { ops } = await readValidatedBody(event, z.object({ ops: z.array(opSchema).min(1).max(500) }).parse)
  const applied = countPacked(ops, packNick(user))
  return { applied, ...packView() }
})
