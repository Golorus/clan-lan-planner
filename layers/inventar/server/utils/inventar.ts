import { eq, max } from 'drizzle-orm'
import { z } from 'zod'
import {
  applyPackOps, countsOf, newId, newRound, normalisePackState, normaliseStock,
  type PackOp, type Round, type Stock,
} from '../../shared/inventar'

/** Inventar und Packstand liegen als Dokumente in der Tabelle docs des Planners (wie die Daten anderer Module) */
export const STOCK_DOC = 'inventar/bestand'
export const PACK_DOC = 'inventar/packen'

type Db = ReturnType<typeof useDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

function readDoc(tx: Tx | Db, path: string) {
  const row = tx.select().from(tables.docs).where(eq(tables.docs.path, path)).get()
  return row?.data ? { data: JSON.parse(row.data) as Record<string, unknown>, rev: row.rev } : null
}
function writeDoc(tx: Tx, path: string, data: Record<string, unknown>) {
  const rev = (tx.select({ rev: max(tables.docs.rev) }).from(tables.docs).get()?.rev ?? 0) + 1
  const json = JSON.stringify(data)
  const updatedAt = new Date()
  tx.insert(tables.docs).values({ path, data: json, rev, updatedAt })
    .onConflictDoUpdate({ target: tables.docs.path, set: { data: json, rev, updatedAt } })
    .run()
  return rev
}

/** der Bestand und seine Fassung (rev): wer speichert, nennt die Fassung, die er gelesen hat */
export function readStock(): Stock & { rev: number } {
  const doc = readDoc(useDb(), STOCK_DOC)
  return { ...normaliseStock(doc?.data), rev: doc?.rev ?? 0 }
}
export const stockExists = () => readDoc(useDb(), STOCK_DOC) !== null

/** speichert den ganzen Bestand; 409, wenn inzwischen jemand anderes gespeichert hat (rev undefined = ohne Prüfung) */
export function writeStock(raw: unknown, rev?: number) {
  return useDb().transaction((tx) => {
    const current = readDoc(tx, STOCK_DOC)
    if (rev !== undefined && (current?.rev ?? 0) !== rev) {
      throw createError({ statusCode: 409, statusMessage: 'Das Inventar wurde inzwischen von jemand anderem geändert. Bitte neu laden.' })
    }
    const stock = normaliseStock(raw)
    return { ...stock, rev: writeDoc(tx, STOCK_DOC, { ...stock, version: 1 }) }
  })
}

/** Artikel aus runtimeConfig.inventarSeed anlegen, solange es noch kein Inventar gibt */
export function seedStock() {
  if (stockExists()) return 0
  const seed = useRuntimeConfig().inventarSeed as { name?: unknown, count?: unknown, note?: unknown, source?: unknown, key?: unknown }[] | undefined
  const articles = (Array.isArray(seed) ? seed : []).filter(a => typeof a?.name === 'string' && a.name.trim())
    .map((a, i) => ({ id: 'a' + (i + 1), name: a.name, count: a.count, note: a.note, source: a.source, key: a.key, checked: false }))
  if (!articles.length) return 0
  return writeStock({ containers: [], articles }).articles.length
}

/** Bestand je Artikelart eines Moduls (für dessen „haben wir“) */
export const stockCounts = (modul: string) => countsOf(readStock(), modul)

// ── Packen ──
export function readPackState() {
  return normalisePackState(readDoc(useDb(), PACK_DOC)?.data)
}

/** was die Seiten zum Packen brauchen: Kisten, Artikel mit Anzahl, Runde und Zähler (ohne die Zählkennungen) */
export function packView() {
  const { containers, articles } = readStock()
  const { ops: _ops, ...state } = readPackState()
  return {
    containers,
    articles: articles.filter(a => a.name && a.count > 0).map(({ id, name, count, container, note }) => ({ id, name, count, container, note })),
    ...state,
  }
}

export const opSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  article: z.string().min(1).max(40),
  delta: z.union([z.literal(1), z.literal(-1)]),
  roundId: z.string().min(1).max(40),
})

/** Zählungen anwenden (lesen und schreiben in einer Transaktion, damit gleichzeitige Klicks sich nicht überschreiben) */
export function countPacked(ops: PackOp[], nick: string) {
  const known = new Set(readStock().articles.map(a => a.id))
  return useDb().transaction((tx) => {
    const { state, applied } = applyPackOps(normalisePackState(readDoc(tx, PACK_DOC)?.data), ops, known, nick, new Date().toISOString())
    if (applied) writeDoc(tx, PACK_DOC, { ...state })
    return applied
  })
}

/** neue Runde (Hinweg oder Rückweg): alle Zähler wieder bei null */
export function startRound(round: Round) {
  useDb().transaction(tx => writeDoc(tx, PACK_DOC, { ...newRound(round, newId('r')) }))
}

export function packNick(user: { displayName: string | null, username: string }) {
  return (user.displayName || user.username || 'jemand').slice(0, 40)
}
