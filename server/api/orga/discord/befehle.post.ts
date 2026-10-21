/** Meldet die Slash-Befehle der Module auf unserem Discord-Server an */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  if (!discordConfigured()) throw createError({ statusCode: 500, statusMessage: 'Der Discord-Bot ist nicht eingerichtet (NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_GUILD_ID).' })
  try {
    const done = await putGuildCommands(listDiscordCommands())
    return { names: done.map(c => c.name) }
  }
  catch (e) {
    if (e instanceof DiscordError) throw createError({ statusCode: 502, statusMessage: 'Discord hat abgelehnt: ' + e.message })
    throw e
  }
})
