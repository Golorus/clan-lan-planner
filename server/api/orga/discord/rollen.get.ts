/** Rollen unseres Servers (zur Auswahl der Event-Rolle) und was gerade eingestellt ist */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const d = useRuntimeConfig().discord
  const saved = getDiscordSettings().eventRoleId
  const cfg = roleConfig()
  let roles: { id: string, name: string }[] = []
  let error: string | null = null
  if (discordConfigured()) {
    try {
      roles = (await listGuildRoles()).map(r => ({ id: r.id, name: r.name }))
    }
    catch (e) {
      error = roleErrorText(e)
    }
  }
  return {
    botConfigured: discordConfigured(),
    eventRoleId: cfg.eventRoleId,
    /** woher die Event-Rolle kommt: in /orga gesetzt oder aus NUXT_DISCORD_EVENT_ROLE_ID */
    source: saved ? 'orga' : d.eventRoleId ? 'env' : null,
    orgaRoleId: cfg.orgaRoleId,
    /** Orga- und Event-Rolle gleich eingetragen: keine gilt */
    clash: cfg.clash,
    roles,
    error,
  }
})
