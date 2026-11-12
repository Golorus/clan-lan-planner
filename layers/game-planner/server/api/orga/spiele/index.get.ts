/** /orga › Spiele: Spielkanal, Textkanäle zur Auswahl und die Spieleliste mit Modi und wie oft gespielt */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
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
  const { games, lastEventName } = gameStats()
  return {
    botConfigured: discordConfigured(),
    channels,
    error,
    playChannelId: playChannelId(),
    lastEventName,
    games: games.map(g => ({ name: g.name, playedNow: g.playedNow, playedLast: g.playedLast, modes: g.modes.map(m => ({ name: m.name, max: m.maxPlayers, min: m.minPlayers })) })),
  }
})
