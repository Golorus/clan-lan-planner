/**
 * „Abgleichen“: Zugesagte des aktuellen Events bekommen die Event-Rolle, alle anderen verlieren sie; der private
 * Thread des Events (falls angekündigt) bekommt Orga, Kontaktpersonen und Zugesagte.
 */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  if (!discordConfigured()) throw createError({ statusCode: 500, statusMessage: 'Der Discord-Bot ist nicht eingerichtet (NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_GUILD_ID).' })
  const cfg = roleConfig()
  if (cfg.clash) throw createError({ statusCode: 400, statusMessage: `Orga-Rolle und ${branding().eventRoleName} haben dieselbe ID. Bitte in der .env korrigieren, bis dahin fasst der Bot keine Rolle an.` })
  const thread = await syncEventThread(leader)
  if (!cfg.eventRoleId && !thread.configured) throw createError({ statusCode: 400, statusMessage: `Es ist weder eine ${branding().eventRoleName} eingetragen noch ein Event angekündigt.` })
  const role = cfg.eventRoleId ? await syncEventRole(leader) : null
  return { ...(role ?? { configured: false, added: [], removed: [], errors: [] }), thread }
})
