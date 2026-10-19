import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

/** Beim Start: Datenbank auf den Stand der Migrationen bringen */
export default defineNitroPlugin(() => {
  const folder = resolve(useRuntimeConfig().migrationsDir)
  migrate(useDb(), { migrationsFolder: folder })
  console.log('[db] Migrationen angewendet aus', folder)
  // QA-Umgebung: frische Datenbank mit ausgedachten Daten füllen
  if (demoMode() && seedDemo()) console.log('[demo] Demo-Daten angelegt')
})
