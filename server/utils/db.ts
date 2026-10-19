import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../database/schema'

export const tables = schema

let instance: BetterSQLite3Database<typeof schema> | null = null

export function useDb() {
  if (instance) return instance
  const file = resolve(useRuntimeConfig().dbPath)
  mkdirSync(dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  instance = drizzle(sqlite, { schema })
  return instance
}
