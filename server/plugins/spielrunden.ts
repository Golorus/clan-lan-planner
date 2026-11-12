/** Spielrunden: /spielen und /spiele anmelden, Takt für Erinnerungen und Abschluss (alle 30 s, übersteht Neustarts) */
export default defineNitroPlugin((nitro) => {
  registerDiscordCommand(spielenCommand)
  registerDiscordCommand(spieleCommand)
  registerSetupCheck('spielrunden', () => discordConfigured() ? playChannelCheck() : [])
  const timer = setInterval(() => void roundTick(), 30_000)
  setTimeout(() => void roundTick(), 5000)
  nitro.hooks.hook('close', () => clearInterval(timer))
})
