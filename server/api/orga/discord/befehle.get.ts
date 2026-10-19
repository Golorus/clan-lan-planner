/** Slash-Befehle, die Module mitbringen (zum Anmelden in /orga › Discord) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  return { commands: listDiscordCommands().map(c => ({ name: c.name, description: c.description })), botConfigured: discordConfigured() }
})
