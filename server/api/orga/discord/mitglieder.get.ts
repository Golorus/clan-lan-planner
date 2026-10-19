import { z } from 'zod'

/** Mitglieder unseres Discord-Servers suchen (für Teilnehmer anlegen und Kontaktpersonen ernennen) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { q } = await getValidatedQuery(event, z.object({ q: z.string().max(100).default('') }).parse)
  if (!discordConfigured()) throw createError({ statusCode: 500, statusMessage: 'Der Discord-Bot ist nicht eingerichtet (NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_GUILD_ID).' })
  try {
    return await searchGuildMembers(q)
  }
  catch (e) {
    throw createError({ statusCode: 502, statusMessage: e instanceof Error ? e.message : String(e) })
  }
})
