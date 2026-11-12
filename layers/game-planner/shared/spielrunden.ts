/**
 * Gemeinsame Spielrunden vor Ort (Discord: /spielen, /spiele), der Teil ohne Datenbank:
 * Uhrzeit lesen, Karte und Knöpfe bauen, Spiele für die Auswahl sortieren. Server-Teil: ../server/utils/spielrunden.ts.
 */
import { berlinToUtcIso, utcToBerlinLocal } from '../../../shared/utils/eventTime'

/** Erinnerung so lange vor dem Start */
export const REMIND_BEFORE_MS = 15 * 60_000
/** so lange nach dem Start kann man noch dazukommen, danach gilt die Runde als gespielt */
export const OPEN_AFTER_START_MS = 30 * 60_000
/** weiter als so weit im Voraus wird keine Runde angesetzt */
export const MAX_AHEAD_MS = 24 * 60 * 60_000
export const MAX_PLAYERS = 64

/**
 * Zeit aus /spielen zeit:… lesen: leer oder „jetzt“, „in 30 min“, „in 2 h“, „+45“, „20:30“, „20.30“, „20 Uhr“.
 * Eine Uhrzeit, die heute schon vorbei ist (mehr als 5 Minuten), gilt für morgen, damit Runden nach Mitternacht gehen.
 */
export function parseRoundTime(input: string | undefined | null, now: Date): { at: Date } | { error: string } {
  const s = String(input ?? '').trim().toLocaleLowerCase('de').replace(/\s+/g, ' ')
  if (!s || s === 'jetzt' || s === 'sofort' || s === 'gleich') return { at: now }

  const rel = /^(?:in |\+ ?)(\d{1,3}(?:[.,]\d)?) ?(m|min|minute|minuten|h|std|stunde|stunden)?$/.exec(s)
  if (rel) {
    const n = Number(rel[1]!.replace(',', '.'))
    const hours = !!rel[2] && /^(h|std|stunde|stunden)$/.test(rel[2])
    const ms = Math.round(n * (hours ? 3_600_000 : 60_000))
    if (ms > MAX_AHEAD_MS) return { error: 'Höchstens 24 Stunden im Voraus.' }
    return { at: new Date(now.getTime() + ms) }
  }

  const clock = /^(\d{1,2})(?:[:.](\d{2}))?(?: ?uhr)?$/.exec(s)
  if (clock) {
    const h = Number(clock[1])
    const m = Number(clock[2] ?? 0)
    if (h > 23 || m > 59) return { error: 'Diese Uhrzeit gibt es nicht.' }
    const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const today = utcToBerlinLocal(now).slice(0, 10)
    let at = new Date(berlinToUtcIso(`${today}T${hhmm}`))
    if (at.getTime() < now.getTime() - 5 * 60_000) {
      const tomorrow = utcToBerlinLocal(now.getTime() + 24 * 3_600_000).slice(0, 10)
      at = new Date(berlinToUtcIso(`${tomorrow}T${hhmm}`))
    }
    return { at }
  }
  return { error: 'Die Zeit verstehe ich nicht. Beispiele: jetzt, 20:30, in 30 min.' }
}

/**
 * Wann erinnert wird: 15 Minuten vor dem Start. Startet die Runde früher als das (z. B. „jetzt“),
 * gibt es keine feste Erinnerung; dann pingt der Bot, sobald die Runde voll ist.
 */
export function remindAtFor(startsAt: Date, createdAt: Date): Date | null {
  const at = startsAt.getTime() - REMIND_BEFORE_MS
  return at > createdAt.getTime() + 60_000 ? new Date(at) : null
}

export interface RoundView {
  id: number
  game: string
  mode: string
  number: number
  startsAt: Date
  maxPlayers: number
  minPlayers: number | null
  note: string | null
  createdBy: string
  status: 'offen' | 'gestartet' | 'abgesagt'
  /** Discord-IDs in Anmelde-Reihenfolge */
  players: string[]
  /** Link zur nächsten Runde derselben Reihe, falls diese voll ist */
  nextUrl?: string | null
  /** Link zur Runde davor (bei Runde 2, 3 …) */
  prevUrl?: string | null
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000)

/** Titelzeile, auch für Erinnerungen: „Counter-Strike 2 · Wingman (2er-Stack) · Runde 2“ */
export function roundTitle(r: Pick<RoundView, 'game' | 'mode' | 'number'>) {
  return `${r.game} · ${r.mode}${r.number > 1 ? ` · Runde ${r.number}` : ''}`
}

/** Text der Karte im Kanal. Erwähnungen zeigen nur Namen; gepingt wird nicht (allowed_mentions leer). */
export function roundCardText(r: RoundView, now = new Date()) {
  const full = r.players.length >= r.maxPlayers
  const lines: string[] = []
  const title = `**${roundTitle(r)}**`
  lines.push(r.status === 'abgesagt' ? `🎮 ~~${title}~~ · abgesagt` : `🎮 ${title}`)
  const when = r.startsAt.getTime() <= now.getTime() + 60_000 && r.status === 'offen'
    ? `<t:${unix(r.startsAt)}:t>, jetzt`
    : `<t:${unix(r.startsAt)}:t> (<t:${unix(r.startsAt)}:R>)`
  lines.push(`🕗 ${when} · 👥 ${r.players.length}/${r.maxPlayers}${r.minPlayers ? ` (ab ${r.minPlayers})` : ''} · von <@${r.createdBy}>`)
  if (r.note) lines.push(`📝 ${r.note}`)
  lines.push(r.players.length ? `Dabei: ${r.players.map(id => `<@${id}>`).join(', ')}` : 'Noch niemand dabei.')
  if (r.status === 'gestartet') lines.push('▶️ Gestartet. Viel Spaß!')
  else if (r.status === 'offen' && full) lines.push(r.nextUrl ? `✅ Voll. Weiter geht's in der nächsten Runde: ${r.nextUrl}` : '✅ Voll. Wer noch will, macht mit „Bin dabei“ die nächste Runde auf.')
  else if (r.status === 'offen' && r.minPlayers && r.players.length < r.minPlayers) lines.push(`Es fehlen noch ${r.minPlayers - r.players.length}.`)
  if (r.prevUrl) lines.push(`↩️ Runde davor: ${r.prevUrl}`)
  return lines.join('\n').slice(0, 2000)
}

/** custom_id der Knöpfe: sr:dabei|raus|ab:<runde> */
export type RoundButton = { action: 'dabei' | 'raus' | 'ab', roundId: number }

export function parseRoundButton(id: string): RoundButton | null {
  const m = /^sr:(dabei|raus|ab):(\d{1,12})$/.exec(id)
  return m ? { action: m[1] as RoundButton['action'], roundId: Number(m[2]) } : null
}

/** Knöpfe unter der Karte; nur solange die Runde offen ist */
export function roundButtons(r: Pick<RoundView, 'id' | 'status' | 'players' | 'maxPlayers'>) {
  if (r.status !== 'offen') return []
  const full = r.players.length >= r.maxPlayers
  return [{ type: 1, components: [
    { type: 2, style: full ? 1 : 3, label: full ? 'Bin dabei (nächste Runde)' : 'Bin dabei', custom_id: `sr:dabei:${r.id}` },
    { type: 2, style: 2, label: 'Raus', custom_id: `sr:raus:${r.id}` },
    { type: 2, style: 4, label: 'Absagen', custom_id: `sr:ab:${r.id}` },
  ] }]
}

export interface GameStat { name: string, playedLast: number, playedNow: number, lastPlayedAt: number | null }

/** Reihenfolge in der Auswahl: diesmal oder letztes Mal gespielt zuerst (nach Häufigkeit), dann zuletzt gespielt, dann ABC */
export function sortGames<T extends GameStat>(games: T[]) {
  return [...games].sort((a, b) =>
    (b.playedNow + b.playedLast) - (a.playedNow + a.playedLast)
    || (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)
    || a.name.localeCompare(b.name, 'de'))
}

/** Name in der Auswahl: „Dota 2 · letztes Mal 3×“ */
export function gameChoiceLabel(g: GameStat) {
  const parts: string[] = []
  if (g.playedNow) parts.push(`diesmal ${g.playedNow}×`)
  if (g.playedLast) parts.push(`letztes Mal ${g.playedLast}×`)
  return parts.length ? `${g.name} · ${parts.join(', ')}` : g.name
}
