/**
 * Nur in der Entwicklung (npm run dev): anmelden, ohne Discord.
 * Ohne Parameter als Projektleiter, mit ?as=<Discord-ID>&name=<Name> als beliebige Person (für Tests);
 * &mitglied=0: gilt ohne Bot als nicht auf unserem Discord-Server (zum Testen der Freigabe).
 * Im Produktions-Build ist diese Route nicht vorhanden (import.meta.dev ist dort false).
 */
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404 })
  const query = getQuery(event)
  const as = typeof query.as === 'string' && /^\d{1,25}$/.test(query.as) ? query.as : null
  const discordId = as ?? String(useRuntimeConfig().leaderDiscordId || '0')
  const name = typeof query.name === 'string' && query.name ? query.name : as ? `test-${as}` : 'Entwicklung'
  if (as && query.mitglied === '0') devNonMembers.add(as)
  else if (as) devNonMembers.delete(as)
  const now = new Date()
  const user = { discordId, username: name.toLowerCase().replace(/\s+/g, '_'), displayName: name }
  useDb().insert(tables.users).values({ ...user, createdAt: now, lastLoginAt: now })
    .onConflictDoUpdate({ target: tables.users.discordId, set: { username: user.username, displayName: user.displayName, lastLoginAt: now } }).run()
  await setUserSession(event, { user: { ...user, isLeader: isLeaderId(discordId) }, loggedInAt: now.toISOString() })
  return sendRedirect(event, safeRedirect(query.redirect, as ? '/' : '/orga'))
})
