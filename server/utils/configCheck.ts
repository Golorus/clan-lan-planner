/**
 * Prüft die Einrichtung aus der .env (und die in /orga gesetzte Event-Rolle), ohne Discord zu fragen.
 * Reiner Code ohne Nuxt-Auto-Imports, damit er sich mit vitest prüfen lässt; die Werte gibt der Aufrufer herein.
 * Geheime Werte (Token, Secret, Passwort) tauchen im Ergebnis nie auf, nur ob sie gesetzt sind.
 */
import { resolveRoles } from './roleGuard'

export interface ConfigInput {
  /** Adresse der App für Links (NUXT_APP_URL oder https://DOMAIN/) */
  appUrl: string
  sessionPassword: string
  leaderDiscordId: string
  oauth: { clientId: string, clientSecret: string, redirectURL: string }
  botToken: string
  guildId: string
  orgaRoleId: string
  /** Event-Rolle aus der .env und die in /orga gesetzte (gilt vor der aus der .env) */
  eventRoleIdEnv: string
  eventRoleIdOrga: string | null
  publicKey: string
  /** lokaler Dev-Server: localhost und http sind dort in Ordnung */
  dev?: boolean
}

export type CheckLevel = 'ok' | 'warn' | 'error'
export interface ConfigCheck { key: string, level: CheckLevel, text: string }

const SNOWFLAKE = /^\d{17,20}$/
const BOT_TOKEN = /^[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/
const PUBLIC_KEY = /^[0-9a-f]{64}$/i

export function checkConfig(input: ConfigInput): ConfigCheck[] {
  const c = (v: string | null | undefined) => String(v ?? '').trim()
  const out: ConfigCheck[] = []
  const add = (key: string, level: CheckLevel, text: string) => out.push({ key, level, text })

  // Sitzungen
  add('session', c(input.sessionPassword).length >= 32 ? 'ok' : 'error',
    c(input.sessionPassword).length >= 32 ? 'Sitzungs-Passwort gesetzt.' : 'NUXT_SESSION_PASSWORD fehlt oder hat weniger als 32 Zeichen.')

  // Adresse der App
  const app = c(input.appUrl)
  let appOrigin: string | null = null
  try {
    appOrigin = new URL(app).origin
  }
  catch { /* unten als Fehler */ }
  if (!appOrigin) add('app-url', 'error', `Die Adresse der App ist ungültig („${app}“). Bitte DOMAIN oder NUXT_APP_URL prüfen.`)
  else if (!input.dev && /localhost|127\.0\.0\.1/.test(appOrigin)) add('app-url', 'error', 'Weder DOMAIN noch NUXT_APP_URL ist gesetzt: Links in Nachrichten zeigen auf localhost.')
  else if (!input.dev && !appOrigin.startsWith('https://')) add('app-url', 'warn', `Links in Nachrichten gehen über http statt https (${appOrigin}).`)
  else add('app-url', 'ok', `Links in Nachrichten zeigen auf ${appOrigin}/.`)

  // Notzugang
  const leader = c(input.leaderDiscordId)
  if (!leader) add('leader', 'warn', 'NUXT_LEADER_DISCORD_ID ist leer: Ohne Orga-Rolle kommt niemand in /orga.')
  else add('leader', SNOWFLAKE.test(leader) ? 'ok' : 'error', SNOWFLAKE.test(leader) ? 'Notzugang zu /orga gesetzt.' : 'NUXT_LEADER_DISCORD_ID ist keine Discord-ID.')

  // Login mit Discord
  const { clientId, clientSecret, redirectURL } = input.oauth
  if (!SNOWFLAKE.test(c(clientId)) || !c(clientSecret)) {
    add('oauth', input.dev ? 'warn' : 'error', 'Login mit Discord: NUXT_OAUTH_DISCORD_CLIENT_ID oder _SECRET fehlt bzw. ist ungültig.')
  }
  else add('oauth', 'ok', 'Login mit Discord eingerichtet.')
  const expected = appOrigin ? `${appOrigin}/auth/discord` : null
  const redirect = c(redirectURL).replace(/\/$/, '')
  if (!redirect) add('oauth-redirect', input.dev ? 'warn' : 'error', 'NUXT_OAUTH_DISCORD_REDIRECT_URL fehlt.')
  else if (expected && redirect !== expected) add('oauth-redirect', 'warn', `Die Redirect-URL (${redirect}) passt nicht zur Adresse der App, erwartet: ${expected}.`)
  else add('oauth-redirect', 'ok', 'Redirect-URL passt zur Adresse der App.')

  // Bot
  const token = c(input.botToken), guild = c(input.guildId)
  if (!token && !guild) add('bot', 'warn', 'Kein Bot eingerichtet: keine Direktnachrichten, keine Rollen, keine Ankündigungen.')
  else if (!token || !guild) add('bot', 'error', `Für den Bot fehlt ${!token ? 'NUXT_DISCORD_BOT_TOKEN' : 'NUXT_DISCORD_GUILD_ID'}.`)
  else if (!BOT_TOKEN.test(token)) add('bot', 'error', 'NUXT_DISCORD_BOT_TOKEN sieht nicht wie ein Bot-Token aus.')
  else if (!SNOWFLAKE.test(guild)) add('bot', 'error', 'NUXT_DISCORD_GUILD_ID ist keine Server-ID.')
  else add('bot', 'ok', 'Bot und Server eingetragen.')

  // Rollen
  const orga = c(input.orgaRoleId)
  const eventRole = c(input.eventRoleIdOrga) || c(input.eventRoleIdEnv)
  const source = c(input.eventRoleIdOrga) ? 'in /orga gesetzt' : 'aus der .env'
  const roles = resolveRoles(orga, eventRole)
  if (roles.clash) {
    add('roles', 'error', 'Orga-Rolle und Event-Rolle haben dieselbe ID: Dann gilt keine von beiden.')
  }
  else {
    if (!orga) add('orga-role', 'warn', 'Keine Orga-Rolle: In /orga kommt nur der Notzugang (NUXT_LEADER_DISCORD_ID).')
    else add('orga-role', SNOWFLAKE.test(orga) ? 'ok' : 'error', SNOWFLAKE.test(orga) ? 'Orga-Rolle eingetragen.' : 'NUXT_DISCORD_ORGA_ROLE_ID ist keine Rollen-ID.')
    if (!eventRole) add('event-role', 'warn', 'Keine Event-Rolle: Der Bot vergibt den Zugesagten keine Rolle.')
    else add('event-role', SNOWFLAKE.test(eventRole) ? 'ok' : 'error', SNOWFLAKE.test(eventRole) ? `Event-Rolle eingetragen (${source}).` : `Die Event-Rolle (${source}) ist keine Rollen-ID.`)
  }

  // Knöpfe in Nachrichten
  const key = c(input.publicKey)
  if (!key) add('public-key', 'warn', 'Kein NUXT_DISCORD_PUBLIC_KEY: Nachrichten haben nur Links, keine Knöpfe.')
  else add('public-key', PUBLIC_KEY.test(key) ? 'ok' : 'error', PUBLIC_KEY.test(key)
    ? 'Knöpfe in Nachrichten aktiv. Dazu muss im Developer Portal die Interactions Endpoint URL eingetragen sein.'
    : 'NUXT_DISCORD_PUBLIC_KEY ist kein Public Key (64 Hex-Zeichen).')

  return out
}
