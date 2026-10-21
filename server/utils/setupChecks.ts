/**
 * Prüfungen der Module für die Einrichtungs-Ampel in /orga › Discord (neben checkConfig).
 * Ein Modul meldet sie in einem Nitro-Plugin an:
 *
 *   export default defineNitroPlugin(() => registerSetupCheck('led', () => [{ key: 'led-bridge', level: 'warn', text: '…' }]))
 *
 * Wie bei checkConfig nennen die Texte nie geheime Werte, nur ob sie gesetzt sind.
 */
import { eq } from 'drizzle-orm'
import type { ConfigCheck } from './configCheck'

type SetupCheck = () => ConfigCheck[] | Promise<ConfigCheck[]>

const checks = new Map<string, SetupCheck>()

export function registerSetupCheck(name: string, fn: SetupCheck) {
  checks.set(name, fn)
}

/** Alle Prüfungen der Module; wirft eine, steht das als Fehler in der Ampel statt die Seite zu brechen */
export async function moduleSetupChecks(): Promise<ConfigCheck[]> {
  const out: ConfigCheck[] = []
  for (const [name, fn] of checks) {
    try {
      out.push(...await fn())
    }
    catch (e) {
      out.push({ key: `${name}-failed`, level: 'error', text: `Prüfung „${name}“ fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
  return out
}

/** Schlüssel aus runtimeConfig.setupScope; aus der .env kommt er als Komma-Liste */
export function parseScope(v: unknown): string[] {
  const list = Array.isArray(v) ? v : String(v ?? '').split(',')
  return list.map(x => String(x).trim()).filter(Boolean)
}

/** Warnungen zu Teilen, die diese Instanz nutzt, sind Fehler: Ohne sie fehlt etwas vom Umfang */
export function applyScope(checks: ConfigCheck[], scope: string[]): ConfigCheck[] {
  const s = new Set(scope)
  return checks.map(c => c.level === 'warn' && s.has(c.key) ? { ...c, level: 'error' } : c)
}

export const scopeKeySchema = /^[a-z0-9-]{1,40}$/

/**
 * Umfang der Instanz: von der Orga in /orga › Discord gesetzt (settings, Schlüssel „setupScope“),
 * sonst aus runtimeConfig.setupScope bzw. NUXT_SETUP_SCOPE.
 */
export function currentScope(): { keys: string[], source: 'orga' | 'config' } {
  const row = useDb().select().from(tables.settings).where(eq(tables.settings.key, 'setupScope')).get()
  if (row) return { keys: parseScope(JSON.parse(row.value)), source: 'orga' }
  return { keys: parseScope(useRuntimeConfig().setupScope), source: 'config' }
}

/** keys null = wieder der Standard aus der Konfiguration */
export function saveScope(keys: string[] | null) {
  const db = useDb()
  if (keys === null) {
    db.delete(tables.settings).where(eq(tables.settings.key, 'setupScope')).run()
    return
  }
  const value = JSON.stringify([...new Set(keys)].sort())
  db.insert(tables.settings).values({ key: 'setupScope', value })
    .onConflictDoUpdate({ target: tables.settings.key, set: { value } }).run()
}
