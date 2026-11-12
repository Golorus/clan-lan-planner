/**
 * Game Planner: Spiele aus gamesSeed anlegen, /spielen und /spiele und die Knöpfe anmelden,
 * Takt für Erinnerungen und Abschluss (alle 30 s, übersteht Neustarts). Aus mit NUXT_PUBLIC_GAME_PLANNER=false.
 */
export default defineNitroPlugin((nitro) => {
  if (useRuntimeConfig().public.gamePlanner === false) return
  const added = seedGames()
  if (added) console.log(`[spielrunden] ${added} Spiel(e) aus gamesSeed angelegt`)
  registerDiscordCommand(spielenCommand)
  registerDiscordCommand(spieleCommand)
  registerDiscordButtons({ prefix: 'sr', handle: async p => (await handleRoundButton(p)) ?? { type: 4, data: { content: 'Dieser Knopf ist veraltet.', flags: 64 } } })
  registerSetupCheck('spielrunden', () => discordConfigured() ? playChannelCheck() : [])
  const timer = setInterval(() => void roundTick(), 30_000)
  setTimeout(() => void roundTick(), 5000)
  nitro.hooks.hook('close', () => clearInterval(timer))
})
