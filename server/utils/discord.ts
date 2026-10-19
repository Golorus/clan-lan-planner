/**
 * Der Bot (gleiche Discord-Anwendung wie der Login) schreibt Teilnehmern Direktnachrichten,
 * fügt sie bei der Registrierung auf Wunsch unserem Server hinzu und sucht Servermitglieder für /orga.
 * Voraussetzungen siehe ANLEITUNG-VPS.md, Schritt 3: Bot auf dem Server mit „Einladung erstellen“,
 * „Server Members Intent“ an. DMs kommen nur an, wenn der Empfänger DMs von Servermitgliedern erlaubt.
 */
const API = 'https://discord.com/api/v10'

export class DiscordError extends Error {
  constructor(public status: number, public code: number | undefined, message: string) {
    super(message)
  }
}

/** Was Discord-Fehler für die Orga bedeuten */
function describe(status: number, code: number | undefined, message: string) {
  if (code === 50007) return 'Discord lässt keine Direktnachricht zu (DMs gesperrt oder nicht mehr auf dem Server).'
  if (code === 10013) return 'Diesen Discord-Benutzer gibt es nicht.'
  if (code === 10007) return 'Nicht auf unserem Discord-Server.'
  if (code === 30001) return 'Die Person ist schon auf zu vielen Servern.'
  if (status === 401) return 'Der Bot-Token ist ungültig (NUXT_DISCORD_BOT_TOKEN).'
  if (status === 403) return 'Dem Bot fehlt eine Berechtigung oder der „Server Members Intent“.'
  return `Discord-Fehler ${status}${code ? ` (${code})` : ''}: ${message}`
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export function discordConfigured() {
  const { botToken, guildId } = useRuntimeConfig().discord
  return !!botToken && !!guildId
}

function guildId() {
  const id = useRuntimeConfig().discord.guildId
  if (!id) throw createError({ statusCode: 500, statusMessage: 'NUXT_DISCORD_GUILD_ID fehlt' })
  return id
}

/**
 * Aufruf der Discord-API als Bot. Hält sich an die Rate-Limits:
 * bei 429 wird nach retry_after wiederholt, bei leerem Kontingent vor dem nächsten Aufruf gewartet.
 */
async function discordApi<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
  const token = useRuntimeConfig().discord.botToken
  if (!token) throw createError({ statusCode: 500, statusMessage: 'NUXT_DISCORD_BOT_TOKEN fehlt' })
  const res = await fetch(API + path, {
    method,
    headers: {
      'Authorization': `Bot ${token}`,
      'User-Agent': 'DiscordBot (https://github.com/Golorus/clan-lan-planner, 1.0)',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 429) {
    const data = await res.json().catch(() => ({})) as { retry_after?: number }
    const wait = (data.retry_after ?? Number(res.headers.get('retry-after') || 1)) * 1000
    if (attempt >= 5) throw new DiscordError(429, undefined, 'Discord bremst gerade (Rate-Limit). Später erneut versuchen.')
    await sleep(wait + 250)
    return discordApi<T>(method, path, body, attempt + 1)
  }
  if (res.headers.get('x-ratelimit-remaining') === '0') {
    await sleep(Number(res.headers.get('x-ratelimit-reset-after') || 1) * 1000)
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { code?: number, message?: string } | null
    throw new DiscordError(res.status, data?.code, describe(res.status, data?.code, data?.message || res.statusText))
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

/** DM-Kanäle merken, damit nicht jede Nachricht einen neuen anfragt */
const dmChannels = new Map<string, string>()

/** Schickt eine Direktnachricht, auf Wunsch mit Buttons; wirft DiscordError, wenn Discord sie ablehnt (z. B. DMs gesperrt) */
export async function sendDirectMessage(discordUserId: string, content: string, components?: unknown[]) {
  let channelId = dmChannels.get(discordUserId)
  if (!channelId) {
    channelId = (await discordApi<{ id: string }>('POST', '/users/@me/channels', { recipient_id: discordUserId })).id
    dmChannels.set(discordUserId, channelId)
  }
  await discordApi('POST', `/channels/${channelId}/messages`, {
    content: content.slice(0, 2000), allowed_mentions: { parse: [] }, ...(components?.length ? { components } : {}),
  })
}

// ── Rollen: der Bot fasst nur die Event-Rolle an (server/utils/roleGuard.ts) ──

/**
 * Event-Rolle geben oder nehmen. Nur über PUT/DELETE auf genau diese eine Rolle, nie über die ganze
 * Rollenliste eines Mitglieds; eventRolePath bricht ab, wenn roleId nicht die konfigurierte Event-Rolle ist.
 */
export async function setMemberRole(discordUserId: string, roleId: string, on: boolean) {
  const path = eventRolePath(roleConfig(), guildId(), discordUserId, roleId)
  await discordApi(on ? 'PUT' : 'DELETE', path, undefined)
  memberCache.delete(discordUserId)
}

export interface GuildRole { id: string, name: string, position: number, managed: boolean, color: number }

/** Rollen unseres Servers (nur lesen, für die Auswahl in /orga) */
export async function listGuildRoles() {
  const roles = await discordApi<GuildRole[]>('GET', `/guilds/${guildId()}/roles`)
  return roles.filter(r => r.id !== guildId() && !r.managed).sort((a, b) => b.position - a.position)
}

/** Alle Mitglieder mit einer Rolle (seitenweise, braucht den „Server Members Intent“) */
export async function membersWithRole(roleId: string) {
  const found: GuildMember[] = []
  let after = '0'
  for (let page = 0; page < 50; page++) {
    const batch = await discordApi<(RawMember & { roles: string[] })[]>('GET', `/guilds/${guildId()}/members?limit=1000&after=${after}`)
    for (const m of batch) if (!m.user.bot && m.roles.includes(roleId)) found.push(toMember(m))
    if (batch.length < 1000) break
    after = batch[batch.length - 1]!.user.id
  }
  return found
}

// ── Ankündigung in #organisation und der private Thread dazu ──

export interface GuildChannel { id: string, name: string, type: number, position: number }

/** Text- und Ankündigungskanäle unseres Servers (zur Auswahl von #organisation) */
export async function listTextChannels() {
  const channels = await discordApi<GuildChannel[]>('GET', `/guilds/${guildId()}/channels`)
  return channels.filter(c => c.type === 0 || c.type === 5).sort((a, b) => a.position - b.position)
}

/** Nachricht in einen Kanal; @everyone pingt nur, wenn everyone = true (und der Bot das Recht dazu hat) */
export async function postChannelMessage(channelId: string, content: string, everyone = false) {
  return (await discordApi<{ id: string }>('POST', `/channels/${channelId}/messages`, {
    content: content.slice(0, 2000), allowed_mentions: { parse: everyone ? ['everyone'] : [] },
  })).id
}

/** Privaten Thread im Kanal anlegen: nur Mitglieder sehen ihn, nur Moderatoren laden ein; archiviert erst nach einer Woche Ruhe */
export async function createPrivateThread(channelId: string, name: string) {
  return (await discordApi<{ id: string }>('POST', `/channels/${channelId}/threads`, {
    name: name.slice(0, 100), type: 12, invitable: false, auto_archive_duration: 10080,
  })).id
}

/** Discord-IDs aller Mitglieder eines Threads (braucht den „Server Members Intent“) */
export async function threadMemberIds(threadId: string) {
  const ids: string[] = []
  let after = '0'
  for (let page = 0; page < 20; page++) {
    const batch = await discordApi<{ user_id: string }[]>('GET', `/channels/${threadId}/thread-members?limit=100&after=${after}`)
    ids.push(...batch.map(m => m.user_id))
    if (batch.length < 100) break
    after = batch[batch.length - 1]!.user_id
  }
  return ids
}

/** Jemanden in den Thread holen bzw. herausnehmen; ein archivierter Thread wird dafür wieder geöffnet */
export async function setThreadMember(threadId: string, discordUserId: string, on: boolean) {
  const path = `/channels/${threadId}/thread-members/${discordUserId}`
  try {
    await discordApi(on ? 'PUT' : 'DELETE', path)
  }
  catch (e) {
    if (!(e instanceof DiscordError && e.code === 50083)) throw e
    await discordApi('PATCH', `/channels/${threadId}`, { archived: false })
    await discordApi(on ? 'PUT' : 'DELETE', path)
  }
}

let botId: string | null = null
/** Discord-ID des Bots selbst (gemerkt) */
export async function botUserId() {
  botId ??= (await discordApi<{ id: string }>('GET', '/users/@me')).id
  return botId
}

/** Link zu einer Nachricht oder einem Thread auf unserem Server */
export function channelUrl(channelId: string, messageId?: string | null) {
  return `https://discord.com/channels/${useRuntimeConfig().discord.guildId}/${channelId}${messageId ? `/${messageId}` : ''}`
}

/** Was ein Rollenfehler für die Orga bedeutet */
export function roleErrorText(e: unknown) {
  if (e instanceof RoleGuardError) return e.message
  if (e instanceof DiscordError) {
    if (e.code === 50013) return `Dem Bot fehlt „Rollen verwalten“, oder seine Rolle steht nicht über der ${branding().eventRoleName}.`
    if (e.code === 10011) return `Die ${branding().eventRoleName} gibt es auf dem Server nicht (falsche ID?).`
    if (e.code === 10007) return 'Nicht auf unserem Discord-Server.'
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

export interface GuildMember { discordId: string, username: string, name: string }

interface RawMember { nick?: string | null, user: { id: string, username: string, global_name?: string | null, bot?: boolean, avatar?: string | null } }

function toMember(m: RawMember): GuildMember {
  return { discordId: m.user.id, username: m.user.username, name: m.nick || m.user.global_name || m.user.username }
}

/** Mitgliedschaften kurz merken: Orga-Seiten fragen bei jeder Anfrage nach der Rolle */
const MEMBER_TTL_MS = 60_000
const memberCache = new Map<string, { roles: string[] | null, at: number }>()

/** Rollen-IDs eines Mitglieds unseres Servers; null = kein Mitglied. Wirft, wenn Discord nicht antwortet. */
export async function guildMemberRoles(discordUserId: string) {
  const hit = memberCache.get(discordUserId)
  if (hit && Date.now() - hit.at < MEMBER_TTL_MS) return hit.roles
  let roles: string[] | null
  try {
    roles = (await discordApi<RawMember & { roles: string[] }>('GET', `/guilds/${guildId()}/members/${discordUserId}`)).roles
  }
  catch (e) {
    if (!(e instanceof DiscordError && e.status === 404)) throw e
    roles = null
  }
  memberCache.set(discordUserId, { roles, at: Date.now() })
  return roles
}

/** Ist jemand auf unserem Discord-Server? Wirft, wenn Discord nicht antwortet. */
export async function isGuildMember(discordUserId: string) {
  return (await guildMemberRoles(discordUserId)) !== null
}

/** Nach einem Beitritt über guilds.join soll die nächste Abfrage frisch sein */
export function forgetGuildMember(discordUserId: string) {
  memberCache.delete(discordUserId)
}

/**
 * Fügt jemanden unserem Server hinzu (OAuth2-Scope guilds.join, sein Access-Token aus dem Login).
 * Der Bot braucht dafür auf dem Server die Berechtigung „Einladung erstellen“.
 * true = neu hinzugefügt, false = war schon Mitglied.
 */
export async function addGuildMember(discordUserId: string, accessToken: string) {
  const added = await discordApi<RawMember | undefined>('PUT', `/guilds/${guildId()}/members/${discordUserId}`, { access_token: accessToken })
  return !!added
}

/** Mitglieder suchen (Name beginnt mit query); ohne query die ersten 100. Braucht den „Server Members Intent“. */
export async function searchGuildMembers(query: string) {
  const q = query.trim()
  const raw = q
    ? await discordApi<RawMember[]>('GET', `/guilds/${guildId()}/members/search?query=${encodeURIComponent(q)}&limit=25`)
    : await discordApi<RawMember[]>('GET', `/guilds/${guildId()}/members?limit=100`)
  return raw.filter(m => !m.user.bot).map(toMember).sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/** Ist jemand auf unserem Server? null = unbekannt (Bot nicht eingerichtet oder Discord nicht erreichbar) */
export async function memberStatus(discordUserId: string) {
  if (!discordConfigured()) return null
  try {
    return await isGuildMember(discordUserId)
  }
  catch {
    return null
  }
}

/** Link zu einem Discord-Event (Scheduled Event) auf unserem Server */
export function discordEventUrl(eventId: string) {
  return `https://discord.com/events/${useRuntimeConfig().discord.guildId}/${eventId}`
}

export interface ScheduledEventInput {
  name: string
  description: string
  location: string
  /** ISO-Zeit in UTC */
  start: string
  end: string
}

/**
 * Discord-Event (Scheduled Event, extern mit Ort) anlegen oder, wenn id gesetzt ist, aktualisieren.
 * Wurde es in Discord gelöscht, wird es neu angelegt. Der Bot braucht „Veranstaltungen verwalten“.
 * Gibt die ID des Discord-Events zurück.
 */
export async function upsertScheduledEvent(id: string | null, e: ScheduledEventInput) {
  const body = {
    name: e.name.slice(0, 100),
    description: e.description.slice(0, 1000),
    privacy_level: 2,
    entity_type: 3,
    entity_metadata: { location: e.location.slice(0, 100) },
    scheduled_start_time: e.start,
    scheduled_end_time: e.end,
  }
  const path = `/guilds/${guildId()}/scheduled-events`
  try {
    if (id) return (await discordApi<{ id: string }>('PATCH', `${path}/${id}`, body)).id
  }
  catch (err) {
    if (!(err instanceof DiscordError && err.status === 404)) throw scheduledEventError(err)
  }
  try {
    return (await discordApi<{ id: string }>('POST', path, body)).id
  }
  catch (err) {
    throw scheduledEventError(err)
  }
}

function scheduledEventError(err: unknown) {
  if (err instanceof DiscordError) {
    if (err.status === 403) return new Error('Dem Bot fehlt auf unserem Server die Berechtigung „Veranstaltungen verwalten“.')
    if (err.status === 400) return new Error(`Discord hat das Event abgelehnt (liegt der Beginn in der Vergangenheit?): ${err.message}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

/** Was ein Fehler bei Kanal oder Thread für die Orga bedeutet */
export function channelErrorText(e: unknown) {
  if (e instanceof DiscordError) {
    if (e.code === 10003) return 'Den Kanal bzw. Thread gibt es nicht mehr.'
    if (e.code === 10007 || e.code === 10013) return 'Nicht (mehr) auf unserem Discord-Server.'
    if (e.code === 50001) return 'Der Bot sieht den Kanal nicht (Berechtigung „Kanal ansehen“).'
    if (e.code === 50013 || e.status === 403) return 'Dem Bot fehlt eine Berechtigung im Kanal (Nachrichten senden, @everyone erwähnen, private Threads erstellen, Threads verwalten).'
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

/** Avatar-Hashes aller Mitglieder unseres Servers (seitenweise, braucht den „Server Members Intent“) */
export async function memberAvatars() {
  const map = new Map<string, string | null>()
  let after = '0'
  for (let page = 0; page < 50; page++) {
    const batch = await discordApi<RawMember[]>('GET', `/guilds/${guildId()}/members?limit=1000&after=${after}`)
    for (const m of batch) if (!m.user.bot) map.set(m.user.id, m.user.avatar ?? null)
    if (batch.length < 1000) break
    after = batch[batch.length - 1]!.user.id
  }
  return map
}

/**
 * Meldet die Slash-Befehle der Module auf unserem Server an (ersetzt alle bisherigen Server-Befehle der Anwendung).
 * Die Anwendungs-ID ist die Client-ID aus dem Discord-Login.
 */
export async function putGuildCommands(commands: { name: string, description: string, options?: unknown[] }[]) {
  const appId = String(useRuntimeConfig().oauth.discord.clientId || '').trim()
  if (!appId) throw createError({ statusCode: 500, statusMessage: 'NUXT_OAUTH_DISCORD_CLIENT_ID fehlt' })
  return discordApi<{ name: string }[]>('PUT', `/applications/${appId}/guilds/${guildId()}/commands`,
    commands.map(c => ({ type: 1, name: c.name, description: c.description.slice(0, 100), options: c.options ?? [] })))
}
