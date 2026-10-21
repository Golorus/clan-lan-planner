/** Prüfung der Einrichtung (.env, Event-Rolle aus /orga und die Prüfungen der Module) als Ampel; nennt keine geheimen Werte */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const cfg = useRuntimeConfig()
  return {
    checks: applyScope([...checkConfig({
      appUrl: appUrl(),
      sessionPassword: cfg.session.password,
      leaderDiscordId: cfg.leaderDiscordId,
      oauth: cfg.oauth.discord,
      botToken: cfg.discord.botToken,
      guildId: cfg.discord.guildId,
      orgaRoleId: cfg.discord.orgaRoleId,
      eventRoleIdEnv: cfg.discord.eventRoleId,
      eventRoleIdOrga: getDiscordSettings().eventRoleId,
      publicKey: cfg.discord.publicKey,
      dev: import.meta.dev,
    }), ...await moduleSetupChecks()], parseScope(cfg.setupScope)),
  }
})
