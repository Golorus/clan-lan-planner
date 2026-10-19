import { z } from 'zod'

const REDIRECT_COOKIE = 'lan-planner-login-redirect'

const discordUserSchema = z.object({
  id: z.string().regex(/^\d{5,25}$/),
  username: z.string(),
  global_name: z.string().nullish(),
  avatar: z.string().nullish(),
})

function handler(scope: string[]) {
  return defineOAuthDiscordEventHandler({
    // „identify“: ID, Benutzername, Anzeigename – keine E-Mail
    config: { scope, emailRequired: false },
    async onSuccess(event, { user: raw, tokens }) {
      const profile = discordUserSchema.parse(raw)
      const now = new Date()
      const user = { discordId: profile.id, username: profile.username, displayName: profile.global_name ?? null }

      useDb().insert(tables.users)
        .values({ ...user, createdAt: now, lastLoginAt: now })
        .onConflictDoUpdate({ target: tables.users.discordId, set: { username: user.username, displayName: user.displayName, lastLoginAt: now } })
        .run()

      // Avatar bei jedem Login frisch holen und bei uns ablegen (Fehler halten den Login nicht auf)
      await refreshAvatar(user.discordId, profile.avatar)
      await setUserSession(event, { user: { ...user, isLeader: await isLeader(user.discordId) }, loggedInAt: now.toISOString() })
      let target = safeRedirect(getCookie(event, REDIRECT_COOKIE))
      deleteCookie(event, REDIRECT_COOKIE, { path: '/' })

      // Bei der Registrierung hat die Person zugestimmt, unserem Discord-Server beizutreten (Scope guilds.join)
      const granted = String((tokens as { scope?: string }).scope ?? '').split(' ')
      // Unbekannte holt der Planner nie selbst auf den Server: erst nach Freigabe (server/utils/freigabe.ts)
      if (granted.includes('guilds.join') && !(await mayJoin(user.discordId))) {
        target += (target.includes('?') ? '&' : '?') + 'beitritt=freigabe'
      }
      else if (granted.includes('guilds.join')) {
        let result = 'ok'
        try {
          await addGuildMember(user.discordId, (tokens as { access_token: string }).access_token)
          forgetGuildMember(user.discordId)
        }
        catch (e) {
          console.error('[auth] Server-Beitritt fehlgeschlagen:', e instanceof Error ? e.message : e)
          result = 'fehler'
        }
        target += (target.includes('?') ? '&' : '?') + 'beitritt=' + result
      }
      return sendRedirect(event, target)
    },
    onError(event, error) {
      console.error('[auth] Discord-Anmeldung fehlgeschlagen:', error.message)
      return sendRedirect(event, '/?login=fehler')
    },
  })
}

const login = handler(['identify'])
/** nur auf ausdrücklichen Wunsch bei der Registrierung: zusätzlich unserem Server beitreten */
const loginAndJoin = handler(['identify', 'guilds.join'])

export default defineEventHandler((event) => {
  const query = getQuery(event)
  // Beim Start der Anmeldung merken, wohin es danach geht (z. B. /orga)
  if (!query.code && !query.error && query.redirect) {
    setCookie(event, REDIRECT_COOKIE, safeRedirect(query.redirect), { httpOnly: true, sameSite: 'lax', secure: !import.meta.dev, path: '/', maxAge: 600 })
  }
  // Der Rückweg (?code=…) ist für beide gleich; welche Rechte erteilt wurden, steht im Token
  return (query.join === '1' && !query.code ? loginAndJoin : login)(event)
})
