import { z } from 'zod'

const bodySchema = z.union([z.object({ registrationId: z.number().int().positive() }), z.object({ all: z.literal(true) })])

/** „Jetzt erinnern“ an Offene: die Orga an alle oder eine Person, Kontaktpersonen an ihre eigenen Leute */
export default defineEventHandler(async (event) => {
  const actor = await requireTeamActor(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  if (!discordConfigured() && !botOptional()) {
    throw createError({ statusCode: 500, statusMessage: 'Der Discord-Bot ist nicht eingerichtet (NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_GUILD_ID).' })
  }
  return { queued: remindNow(actor, 'all' in body ? 'alle' : [body.registrationId]) }
})
