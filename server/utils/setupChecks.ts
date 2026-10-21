/**
 * Prüfungen der Module für die Einrichtungs-Ampel in /orga › Discord (neben checkConfig).
 * Ein Modul meldet sie in einem Nitro-Plugin an:
 *
 *   export default defineNitroPlugin(() => registerSetupCheck('led', () => [{ key: 'led-bridge', level: 'warn', text: '…' }]))
 *
 * Wie bei checkConfig nennen die Texte nie geheime Werte, nur ob sie gesetzt sind.
 */
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
