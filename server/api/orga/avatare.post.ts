/**
 * „Avatare von Discord holen“: für alle bekannten Personen das aktuelle Profilbild über die Mitgliederliste des Servers
 * holen und bei uns ablegen (wie beim Login). Unveränderte Bilder werden übersprungen.
 */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  if (!discordConfigured()) throw createError({ statusCode: 500, statusMessage: 'Der Discord-Bot ist nicht eingerichtet (NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_GUILD_ID).' })
  let avatars: Map<string, string | null>
  try {
    avatars = await memberAvatars()
  }
  catch (e) {
    throw createError({ statusCode: 502, statusMessage: 'Discord hat die Mitgliederliste nicht geliefert: ' + (e instanceof Error ? e.message : e) })
  }
  const result = { updated: 0, unchanged: 0, without: 0, notMember: 0, failed: 0 }
  for (const p of useDb().select().from(tables.persons).all()) {
    if (!p.discordId) continue
    if (!avatars.has(p.discordId)) {
      result.notMember++
      continue
    }
    const hash = avatars.get(p.discordId) ?? null
    if (!hash) {
      if (p.avatar) await removeAvatar(p.discordId)
      result.without++
      continue
    }
    if (hash === p.avatar && await readAvatar(p.discordId)) {
      result.unchanged++
      continue
    }
    if (await refreshAvatar(p.discordId, hash)) result.updated++
    else result.failed++
  }
  return result
})
