import { z } from 'zod'

const bodySchema = z.object({ channelId: z.string().regex(/^\d{5,25}$/).nullable() })

/** Kanal für die Karten aus /spielen (null = keiner, dann erscheinen sie dort, wo der Befehl getippt wurde) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { channelId } = await readValidatedBody(event, bodySchema.parse)
  saveDiscordSettings({ playChannelId: channelId })
  return { playChannelId: getDiscordSettings().playChannelId }
})
