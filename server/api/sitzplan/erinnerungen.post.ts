import { z } from 'zod'

const bodySchema = z.object({ off: z.boolean() })

/** Erinnerungen für die eigene Person ab- oder wieder anbestellen */
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  limitParticipant(event, actor.discordId)
  const { off } = await readValidatedBody(event, bodySchema.parse)
  const person = findPersonByDiscordId(useDb(), actor.discordId)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Dich gibt es hier noch nicht.' })
  setRemindersOff(person.id, off)
  return { off }
})
