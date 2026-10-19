/**
 * „Buchung freigeben“: alle Zugesagten, die noch nicht gebucht haben, bekommen per Bot Code, Link, Frist und ihren
 * geplanten Platz („Buche bitte Platz A-81“). Je Person nur einmal; wer später nachrückt, bekommt sie automatisch.
 */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  if (!discordConfigured() && !botOptional()) {
    throw createError({ statusCode: 500, statusMessage: 'Der Discord-Bot ist nicht eingerichtet (NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_GUILD_ID).' })
  }
  return { queued: releaseBooking(leader) }
})
