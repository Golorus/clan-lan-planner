/**
 * Prüfung der Einrichtung (.env, Event-Rolle aus /orga und die Prüfungen der Module) als Ampel; nennt keine geheimen Werte.
 * Was zum Umfang gehört (inScope), ist bei einer Warnung rot.
 */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const cfg = useRuntimeConfig()
  const scope = currentScope()
  const checks = applyScope([...checkConfig({
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
  }), ...await moduleSetupChecks()], scope.keys)
  return { checks: checks.map(c => ({ ...c, inScope: scope.keys.includes(c.key) })), scopeSource: scope.source }
})
