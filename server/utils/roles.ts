import { eq } from 'drizzle-orm'
import { resolveRoles, type RoleConfig } from './roleGuard'

/**
 * In /orga gespeicherte Discord-Einstellungen (settings, Schlüssel „discord“): Event-Rolle (leer = aus der .env),
 * Kanal für Ankündigungen (#organisation) und der Text dafür.
 */
export interface DiscordSettings { eventRoleId: string | null, announceChannelId: string | null, announceBody: string }

export const DEFAULT_ANNOUNCE = '@everyone {event} steht an: {datum}{ort}! Wer kommt mit? Sagt bis {frist} im Planner zu, dort sucht ihr euch auch gleich euren Platz aus: {link}\nAlles Weitere besprechen wir im Thread.'

export function getDiscordSettings(): DiscordSettings {
  const row = useDb().select().from(tables.settings).where(eq(tables.settings.key, 'discord')).get()
  const saved = row ? JSON.parse(row.value) as Partial<DiscordSettings> : {}
  const id = (v: unknown) => typeof v === 'string' && /^\d{5,25}$/.test(v) ? v : null
  return {
    eventRoleId: id(saved.eventRoleId),
    announceChannelId: id(saved.announceChannelId),
    announceBody: typeof saved.announceBody === 'string' && saved.announceBody.trim() ? saved.announceBody : DEFAULT_ANNOUNCE,
  }
}

export function saveDiscordSettings(patch: Partial<DiscordSettings>) {
  const value = JSON.stringify({ ...getDiscordSettings(), ...patch })
  useDb().insert(tables.settings).values({ key: 'discord', value })
    .onConflictDoUpdate({ target: tables.settings.key, set: { value } }).run()
}

/** Orga-Rolle aus der .env, Event-Rolle aus /orga oder der .env; bei gleicher ID gilt keine (siehe roleGuard) */
export function roleConfig(): RoleConfig {
  const d = useRuntimeConfig().discord
  return resolveRoles(d.orgaRoleId, getDiscordSettings().eventRoleId || d.eventRoleId)
}
