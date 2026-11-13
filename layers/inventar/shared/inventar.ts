/**
 * Inventar und Packen: Datenformen und die Regeln dazu, ohne Server und Browser (auch für die Tests).
 *
 *   inventar/bestand  {containers: [{id, name, kind}], articles: [{id, name, count, checked, container, source, key, note}]}
 *   inventar/packen   {round, roundId, counts: {artikelId: n}, by: {artikelId: Nick}, at: {artikelId: ISO}, ops: [opId…]}
 *
 * Die id von Kiste und Artikel steht im QR-Code (/packen/k/<id>, /packen/a/<id>) und bleibt beim Umbenennen.
 * source/key ordnen einen Artikel der Artikelart eines Moduls zu (inventarQuellen); leer = allgemeines Inventar.
 */
export const CONTAINER_KINDS = ['Kiste', 'Tasche', 'Koffer', 'Sonstiges'] as const
export interface Container { id: string, name: string, kind: string }
export interface Article { id: string, name: string, count: number, checked: boolean, container: string, source: string, key: string, note: string }
export interface Stock { containers: Container[], articles: Article[] }

/** Artikelarten, die ein Modul anmeldet (app.config.ts: inventarQuellen) */
export interface InventarQuelle {
  /** Name des Moduls, steht als source am Artikel */
  modul: string
  label: string
  /** Schalter in runtimeConfig.public; nur bei false fehlt die Quelle */
  flag?: string
  arten: { key: string, label: string }[]
}
export function visibleQuellen(quellen: readonly InventarQuelle[] | undefined, pub: Record<string, unknown>) {
  return (quellen ?? []).filter(q => !q.flag || pub[q.flag] !== false)
}

const str = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : ''
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const ID = /^[A-Za-z0-9_-]{1,40}$/
export const newId = (prefix: string) => prefix + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6)

/** bringt beliebige Daten in die Form des Bestands: ungültige Einträge fallen weg, doppelte ids auch */
export function normaliseStock(raw: unknown): Stock {
  const src = obj(raw) ? raw : {}
  const seen = new Set<string>()
  const fresh = (id: string) => ID.test(id) && !seen.has(id) && !!seen.add(id)
  const containers: Container[] = (Array.isArray(src.containers) ? src.containers : []).filter(obj)
    .map(c => ({ id: str(c.id, 40), name: str(c.name, 100).trim(), kind: (CONTAINER_KINDS as readonly string[]).includes(str(c.kind, 20)) ? str(c.kind, 20) : 'Kiste' }))
    .filter(c => fresh(c.id))
  const boxes = new Set(containers.map(c => c.id))
  seen.clear()
  const articles: Article[] = (Array.isArray(src.articles) ? src.articles : []).filter(obj)
    .map(a => ({
      id: str(a.id, 40),
      name: str(a.name, 200).trim(),
      count: Number.isInteger(a.count) && (a.count as number) >= 0 ? Math.min(a.count as number, 100000) : 0,
      checked: a.checked === true,
      container: boxes.has(str(a.container, 40)) ? str(a.container, 40) : '',
      source: str(a.source, 60),
      key: str(a.source, 60) ? str(a.key, 100) : '',
      note: str(a.note, 300),
    }))
    .filter(a => fresh(a.id))
  return { containers, articles }
}

/** Bestand je Artikelart eines Moduls: Schlüssel → Summe der Anzahl */
export function countsOf(stock: Stock, modul: string) {
  const out: Record<string, number> = {}
  for (const a of stock.articles) if (a.source === modul && a.key) out[a.key] = (out[a.key] ?? 0) + a.count
  return out
}

// ── Packen ──
export type Round = 'hin' | 'rueck'
export interface PackState { round: Round, roundId: string, counts: Record<string, number>, by: Record<string, string>, at: Record<string, string>, ops: string[] }
export interface PackOp { id: string, article: string, delta: 1 | -1, roundId: string }
const OPS_KEEP = 5000

export function normalisePackState(raw: unknown): PackState {
  const s = obj(raw) ? raw : {}
  const rec = <T>(v: unknown, ok: (x: unknown) => x is T) => Object.fromEntries(Object.entries(obj(v) ? v : {}).filter(([, x]) => ok(x))) as Record<string, T>
  const text = (x: unknown): x is string => typeof x === 'string'
  return {
    round: s.round === 'rueck' ? 'rueck' : 'hin',
    roundId: str(s.roundId, 40) || 'start',
    counts: rec(s.counts, (x): x is number => Number.isInteger(x) && (x as number) >= 0),
    by: rec(s.by, text),
    at: rec(s.at, text),
    ops: Array.isArray(s.ops) ? s.ops.filter(text) : [],
  }
}

/**
 * Zählungen anwenden. Jede trägt eine Kennung, damit ein Handy, das ohne Netz gezählt hat, beim Nachsenden nichts
 * doppelt zählt, und die Kennung der Runde, damit Klicks von vor dem Umschalten (Hinweg → Rückweg) nicht in die
 * neue Runde zählen. Unbekannte Artikel werden übergangen. Gibt den neuen Stand und die Zahl der gezählten zurück.
 */
export function applyPackOps(state: PackState, ops: readonly PackOp[], known: ReadonlySet<string>, nick: string, now: string) {
  const s: PackState = { ...state, counts: { ...state.counts }, by: { ...state.by }, at: { ...state.at }, ops: [...state.ops] }
  const seen = new Set(s.ops)
  let applied = 0
  for (const op of ops) {
    if (seen.has(op.id) || op.roundId !== s.roundId || !known.has(op.article)) continue
    seen.add(op.id)
    s.ops.push(op.id)
    s.counts[op.article] = Math.max(0, (s.counts[op.article] ?? 0) + op.delta)
    s.by[op.article] = nick
    s.at[op.article] = now
    applied++
  }
  s.ops = s.ops.slice(-OPS_KEEP)
  return { state: s, applied }
}

export const newRound = (round: Round, roundId: string): PackState => ({ round, roundId, counts: {}, by: {}, at: {}, ops: [] })

/** eingefügte Liste: je Zeile „Name; Anzahl“ (auch mit Tab, „x“ oder „×“ davor: „10 x Patchkabel“); ohne Zahl zählt 1 */
export function parseArticleLines(text: string) {
  const out: { name: string, count: number }[] = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const lead = /^(\d{1,6})\s*[x×]\s+(.+)$/i.exec(t)
    const tail = /^(.+?)\s*[;\t:]\s*(\d{1,6})\s*$/.exec(t)
    if (lead) out.push({ name: lead[2]!.trim(), count: +lead[1]! })
    else if (tail) out.push({ name: tail[1]!.trim(), count: +tail[2]! })
    else out.push({ name: t.replace(/[;\t:]\s*$/, '').trim(), count: 1 })
  }
  return out.filter(a => a.name)
}
