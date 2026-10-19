import { z } from 'zod'

const bodySchema = z.object({
  channelId: z.string().regex(/^\d{5,25}$/, 'Bitte einen Kanal wählen.'),
  body: z.string().trim().min(1, 'Der Text ist leer.').max(1800),
})

/** Event in #organisation ankündigen (mit @everyone, wenn im Text) und den privaten Thread dazu anlegen */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const { channelId, body } = await readValidatedBody(event, bodySchema.parse)
  return announceEvent(leader, id, channelId, body)
})
