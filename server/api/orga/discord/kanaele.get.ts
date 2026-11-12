/** Textkanäle zur Auswahl für die Ankündigung und die Spielrunden, dazu die gespeicherten Kanäle und der Text */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const s = getDiscordSettings()
  let channels: { id: string, name: string }[] = []
  let error: string | null = null
  if (discordConfigured()) {
    try {
      channels = (await listTextChannels()).map(c => ({ id: c.id, name: c.name }))
    }
    catch (e) {
      error = channelErrorText(e)
    }
  }
  return { botConfigured: discordConfigured(), channels, channelId: s.announceChannelId, playChannelId: s.playChannelId, body: s.announceBody, defaultBody: DEFAULT_ANNOUNCE, error }
})
