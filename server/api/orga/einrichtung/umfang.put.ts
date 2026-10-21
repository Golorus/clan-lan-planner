import { z } from 'zod'

/** Was zum Umfang gehört, setzt die Orga per Haken in /orga › Discord; keys null = zurück zum Standard */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { keys } = await readValidatedBody(event, z.object({ keys: z.array(z.string().regex(scopeKeySchema)).max(100).nullable() }).parse)
  saveScope(keys)
  return currentScope()
})
