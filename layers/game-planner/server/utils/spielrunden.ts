import { and, asc, desc, eq, isNull, lte, ne, sql } from 'drizzle-orm'
import {
  gameChoiceLabel, MAX_AHEAD_MS, MAX_PLAYERS, OPEN_AFTER_START_MS, parseRoundButton, parseRoundTime, REMIND_BEFORE_MS,
  remindAtFor, roundButtons, roundCardText, roundTitle, sortGames, type GameStat, type RoundView,
} from '../../shared/spielrunden'
import type { ButtonPress, CommandInteraction, DiscordCommand } from '../../../../server/utils/discordCommands'

/**
 * Gemeinsame Spielrunden vor Ort: /spielen macht eine Runde auf, der Bot postet sie als Karte in den Spielkanal
 * (/orga › Spiele), Knöpfe „Bin dabei“, „Raus“, „Absagen“. Ist eine Runde voll, macht „Bin dabei“ die nächste auf.
 * 15 Minuten vor dem Start erinnert der Bot die Spieler im Kanal; 30 Minuten nach dem Start gilt sie als gespielt.
 * Mitmachen dürfen Zugesagte des aktuellen Events und die Orga. Text und Knöpfe: ../../shared/spielrunden.ts.
 */

const STRING = 3
const INTEGER = 4
const SUB = 1
const MESSAGE = 4
const UPDATE_MESSAGE = 7
const EPHEMERAL = 64

const G = tables.games
const M = tables.gameModes
const R = tables.gameRounds
const P = tables.gameRoundPlayers

const reply = (text: string) => ({ type: MESSAGE, data: { content: text.slice(0, 2000), flags: EPHEMERAL, allowed_mentions: { parse: [] } } })
const norm = (s: string) => s.trim().replace(/\s+/g, ' ')
const same = (a: string, b: string) => norm(a).toLocaleLowerCase('de') === norm(b).toLocaleLowerCase('de')

/** Einstellungen des Moduls (settings, Schlüssel „gamePlanner“): Kanal für die Karten aus /orga › Spiele */
export function playChannelId(): string | null {
  const row = useDb().select().from(tables.settings).where(eq(tables.settings.key, 'gamePlanner')).get()
  const id = row ? (JSON.parse(row.value) as { channelId?: unknown }).channelId : null
  return typeof id === 'string' && /^\d{5,25}$/.test(id) ? id : null
}

export function savePlayChannelId(channelId: string | null) {
  const value = JSON.stringify({ channelId })
  useDb().insert(tables.settings).values({ key: 'gamePlanner', value }).onConflictDoUpdate({ target: tables.settings.key, set: { value } }).run()
}

function botCanPost() {
  return discordConfigured() && !demoMode()
}

/** Zugesagt zum aktuellen Event oder Orga */
export async function canPlay(discordId: string) {
  const ev = currentEvent()
  if (ev) {
    const reg = useDb().select({ status: tables.registrations.status }).from(tables.registrations)
      .innerJoin(tables.persons, eq(tables.persons.id, tables.registrations.personId))
      .where(and(eq(tables.registrations.eventId, ev.id), eq(tables.persons.discordId, discordId))).get()
    if (reg?.status === 'zugesagt') return true
  }
  return isLeader(discordId)
}

// ── Spiele und Modi ──

export function findGame(name: string) {
  return useDb().select().from(G).all().find(g => same(g.name, name)) ?? null
}

function activeModes(gameId: number) {
  return useDb().select().from(M).where(and(eq(M.gameId, gameId), eq(M.archived, false))).orderBy(asc(M.maxPlayers), asc(M.name)).all()
}

function findMode(gameId: number, name: string) {
  return useDb().select().from(M).where(eq(M.gameId, gameId)).all().find(m => same(m.name, name)) ?? null
}

/** Das Event „letztes Mal“: das jüngste andere Event, in dem schon gespielt wurde */
function lastEventId(currentId: number | null) {
  const row = useDb().select({ id: tables.events.id }).from(tables.events)
    .innerJoin(R, eq(R.eventId, tables.events.id))
    .where(and(eq(R.status, 'gestartet'), currentId ? ne(tables.events.id, currentId) : undefined))
    .orderBy(desc(tables.events.date), desc(tables.events.id)).limit(1).get()
  return row?.id ?? null
}

/** Alle Spiele mit aktiven Modi und wie oft sie diesmal bzw. beim letzten Mal gespielt wurden */
export function gameStats() {
  const db = useDb()
  const cur = currentEvent()?.id ?? null
  const last = lastEventId(cur)
  const played = db.select({ gameId: R.gameId, eventId: R.eventId, n: sql<number>`count(*)`, latest: sql<number>`max(${R.startsAt})` })
    .from(R).where(eq(R.status, 'gestartet')).groupBy(R.gameId, R.eventId).all()
  const modes = db.select().from(M).where(eq(M.archived, false)).orderBy(asc(M.maxPlayers), asc(M.name)).all()
  const out = db.select().from(G).all().map((g) => {
    const rows = played.filter(p => p.gameId === g.id)
    const stat: GameStat & { id: number, modes: typeof modes } = {
      id: g.id,
      name: g.name,
      playedNow: cur ? rows.filter(p => p.eventId === cur).reduce((n, p) => n + p.n, 0) : 0,
      playedLast: last ? rows.filter(p => p.eventId === last).reduce((n, p) => n + p.n, 0) : 0,
      lastPlayedAt: rows.length ? Math.max(...rows.map(p => Number(p.latest))) : null,
      modes: modes.filter(m => m.gameId === g.id),
    }
    return stat
  }).filter(g => g.modes.length)
  return { games: sortGames(out), lastEventName: last ? db.select({ name: tables.events.name }).from(tables.events).where(eq(tables.events.id, last)).get()?.name ?? null : null }
}

/** Spiele aus runtimeConfig.gamesSeed anlegen, die es noch nicht gibt; Bestehendes bleibt unangetastet */
export function seedGames() {
  const seed = useRuntimeConfig().gamesSeed as { name?: unknown, modes?: { name?: unknown, max?: unknown, min?: unknown }[] }[] | undefined
  if (!Array.isArray(seed)) return 0
  const db = useDb()
  let added = 0
  for (const g of seed) {
    const name = norm(String(g?.name ?? '')).slice(0, 60)
    const modes = (Array.isArray(g?.modes) ? g.modes : [])
      .map(m => ({ name: norm(String(m?.name ?? '')).slice(0, 60), max: Number(m?.max), min: m?.min === undefined ? null : Number(m.min) }))
      .filter(m => m.name && Number.isInteger(m.max) && m.max >= 1 && m.max <= MAX_PLAYERS)
    if (!name || !modes.length || findGame(name)) continue
    db.transaction((tx) => {
      const row = tx.insert(G).values({ name, createdAt: new Date() }).returning().get()
      for (const m of modes) tx.insert(M).values({ gameId: row.id, name: m.name, maxPlayers: m.max, minPlayers: m.min && Number.isInteger(m.min) && m.min > 0 ? Math.min(m.min, m.max) : null }).run()
    })
    added++
  }
  return added
}

// ── Runden ──

type RoundRow = typeof R.$inferSelect

function playersOf(roundId: number) {
  return useDb().select({ discordId: P.discordId }).from(P).where(eq(P.roundId, roundId)).orderBy(asc(P.joinedAt), asc(P.id)).all().map(p => p.discordId)
}

function messageUrl(r: Pick<RoundRow, 'channelId' | 'messageId'> | null | undefined) {
  return r?.channelId && r.messageId ? channelUrl(r.channelId, r.messageId) : null
}

/** Nächste Runde derselben Reihe (höhere Nummer, noch offen) */
function nextInSeries(r: RoundRow) {
  return useDb().select().from(R).where(and(eq(R.seriesId, r.seriesId ?? r.id), eq(R.status, 'offen'), sql`${R.number} > ${r.number}`))
    .orderBy(asc(R.number)).all()
}

export function roundView(r: RoundRow): RoundView {
  const db = useDb()
  const game = db.select({ name: G.name }).from(G).where(eq(G.id, r.gameId)).get()?.name ?? '?'
  const mode = db.select({ name: M.name }).from(M).where(eq(M.id, r.modeId)).get()?.name ?? '?'
  const next = nextInSeries(r)[0]
  const prev = r.number > 1
    ? db.select().from(R).where(and(sql`coalesce(${R.seriesId}, ${R.id}) = ${r.seriesId ?? r.id}`, eq(R.number, r.number - 1))).get()
    : null
  return {
    id: r.id, game, mode, number: r.number, startsAt: r.startsAt, maxPlayers: r.maxPlayers, minPlayers: r.minPlayers,
    note: r.note, createdBy: r.createdBy, status: r.status, players: playersOf(r.id), nextUrl: messageUrl(next), prevUrl: messageUrl(prev),
  }
}

function card(r: RoundRow) {
  const v = roundView(r)
  return { content: roundCardText(v), components: roundButtons(v) }
}

function loadRound(id: number) {
  return useDb().select().from(R).where(eq(R.id, id)).get() ?? null
}

interface NewRound { gameId: number, modeId: number, startsAt: Date, maxPlayers: number, minPlayers: number | null, note: string | null, createdBy: string, seriesId?: number | null, number?: number }

export function createRound(n: NewRound) {
  const db = useDb()
  const now = new Date()
  return db.transaction((tx) => {
    const r = tx.insert(R).values({
      eventId: currentEvent(tx)?.id ?? null, gameId: n.gameId, modeId: n.modeId, seriesId: n.seriesId ?? null, number: n.number ?? 1,
      startsAt: n.startsAt, maxPlayers: n.maxPlayers, minPlayers: n.minPlayers, note: n.note, createdBy: n.createdBy,
      remindAt: remindAtFor(n.startsAt, now), createdAt: now,
    }).returning().get()
    tx.insert(P).values({ roundId: r.id, discordId: n.createdBy, joinedAt: now }).run()
    return r
  })
}

/** Karte selbst in den Spielkanal posten; false = geht nicht (kein Bot/Kanal), dann antwortet die Interaktion mit der Karte */
async function publishRound(r: RoundRow) {
  const channelId = playChannelId()
  if (!channelId || !botCanPost()) return false
  const c = card(r)
  const messageId = await postChannelCard(channelId, c.content, { components: c.components })
  useDb().update(R).set({ channelId, messageId }).where(eq(R.id, r.id)).run()
  return true
}

/** Karte einer Runde neu zeichnen, die gerade nicht gedrückt wurde (z. B. Runde 1, wenn Runde 2 dazukommt) */
async function refreshCard(id: number) {
  const r = loadRound(id)
  if (!r?.channelId || !r.messageId || !botCanPost()) return
  const c = card(r)
  try {
    await editChannelMessage(r.channelId, r.messageId, c.content, c.components)
  }
  catch (e) {
    console.error('[spielrunden] Karte nicht aktualisierbar:', e instanceof Error ? e.message : e)
  }
}

/** Voll und startet gleich, aber noch keine Erinnerung: dann jetzt erinnern */
function remindNowIfFullAndSoon(r: RoundRow) {
  if (r.remindedAt || r.status !== 'offen') return
  if (playersOf(r.id).length < r.maxPlayers) return
  if (r.startsAt.getTime() - Date.now() > REMIND_BEFORE_MS) return
  useDb().update(R).set({ remindAt: new Date() }).where(eq(R.id, r.id)).run()
  kickRoundTicker()
}

// ── Takt: Erinnerungen und Runden schließen ──

let ticking = false
let soon: ReturnType<typeof setTimeout> | null = null

export function kickRoundTicker() {
  if (soon) return
  soon = setTimeout(() => {
    soon = null
    void roundTick()
  }, 500)
}

export async function roundTick(now = new Date()) {
  if (ticking) return
  ticking = true
  const db = useDb()
  try {
    const due = db.select().from(R).where(and(eq(R.status, 'offen'), isNull(R.remindedAt), lte(R.remindAt, now))).all()
    for (const r of due) {
      db.update(R).set({ remindedAt: now }).where(eq(R.id, r.id)).run()
      const players = playersOf(r.id)
      if (!players.length || !r.channelId || !botCanPost()) continue
      const v = roundView(r)
      const missing = r.minPlayers && players.length < r.minPlayers ? ` Es fehlen noch ${r.minPlayers - players.length}.` : ''
      const text = `⏰ Gleich geht's los (<t:${Math.floor(r.startsAt.getTime() / 1000)}:R>): **${roundTitle(v)}**. Startet schon mal das Spiel!${missing}\n${players.map(id => `<@${id}>`).join(' ')}`
      try {
        await postChannelCard(r.channelId, text, { ping: players, replyTo: r.messageId })
      }
      catch (e) {
        console.error('[spielrunden] Erinnerung nicht gesendet:', e instanceof Error ? e.message : e)
      }
    }
    const over = db.select().from(R).where(and(eq(R.status, 'offen'), lte(R.startsAt, new Date(now.getTime() - OPEN_AFTER_START_MS)))).all()
    for (const r of over) {
      db.update(R).set({ status: playersOf(r.id).length ? 'gestartet' : 'abgesagt' }).where(eq(R.id, r.id)).run()
      await refreshCard(r.id)
    }
  }
  catch (e) {
    console.error('[spielrunden] Takt abgebrochen:', e)
  }
  finally {
    ticking = false
  }
}

// ── /spielen ──

/** Vorschläge: Spiele (diesmal/letztes Mal gespielt zuerst) bzw. die Modi des gewählten Spiels */
function autocomplete(focused: string | null, values: Record<string, string | number | boolean>) {
  const needle = String(values[focused ?? ''] ?? '').toLocaleLowerCase('de').trim()
  if (focused === 'spiel') {
    return commandChoices(gameStats().games.filter(g => g.name.toLocaleLowerCase('de').includes(needle))
      .map(g => ({ name: gameChoiceLabel(g), value: g.name })))
  }
  if (focused === 'modus') {
    const game = findGame(String(values.spiel ?? ''))
    if (!game) return commandChoices([])
    return commandChoices(activeModes(game.id).filter(m => m.name.toLocaleLowerCase('de').includes(needle))
      .map(m => ({ name: `${m.name} · ${m.maxPlayers} Plätze`, value: m.name })))
  }
  return commandChoices([])
}

async function handleSpielen(it: CommandInteraction) {
  const { values, focused } = commandArgs(it.data)
  if (it.type === 4) return autocomplete(focused, values)
  if (!(await canPlay(it.userId))) return reply('Runden aufmachen können alle, die zum aktuellen Event zugesagt haben, und die Orga.')

  const gameName = norm(String(values.spiel ?? '')).slice(0, 60)
  const modeName = values.modus === undefined ? '' : norm(String(values.modus)).slice(0, 60)
  const seats = values['plätze'] === undefined ? null : Number(values['plätze'])
  const note = values.notiz === undefined ? null : norm(String(values.notiz)).slice(0, 100) || null
  if (!gameName) return reply('Welches Spiel? Zum Beispiel `/spielen spiel:Dota 2`.')
  if (seats !== null && (!Number.isInteger(seats) || seats < 2 || seats > MAX_PLAYERS)) return reply(`Plätze: 2 bis ${MAX_PLAYERS}.`)

  const now = new Date()
  const time = parseRoundTime(values.zeit === undefined ? '' : String(values.zeit), now)
  if ('error' in time) return reply(time.error)
  if (time.at.getTime() - now.getTime() > MAX_AHEAD_MS) return reply('Höchstens 24 Stunden im Voraus.')

  const db = useDb()
  let game = findGame(gameName)
  let mode: typeof M.$inferSelect | null = null
  if (!game) {
    if (seats === null) return reply(`„${gameName}“ kenne ich noch nicht. Gib einmal die Plätze mit an, z. B. \`plätze:5\`, dann merke ich mir das Spiel${modeName ? ' und den Modus' : ''}.`)
    game = db.insert(G).values({ name: gameName, createdBy: it.userId, createdAt: now }).returning().get()
  }
  if (modeName) {
    mode = findMode(game.id, modeName)
    if (mode?.archived) db.update(M).set({ archived: false }).where(eq(M.id, mode.id)).run()
    if (!mode) {
      if (seats === null) {
        const known = activeModes(game.id).map(m => m.name).join(', ')
        return reply(`Den Modus „${modeName}“ hat ${game.name} noch nicht${known ? ` (bisher: ${known})` : ''}. Gib einmal die Plätze mit an, z. B. \`plätze:5\`.`)
      }
      mode = db.insert(M).values({ gameId: game.id, name: modeName, maxPlayers: seats }).returning().get()
    }
  }
  else {
    const modes = activeModes(game.id)
    if (modes.length === 1) mode = modes[0]!
    else if (!modes.length) {
      if (seats === null) return reply(`Für ${game.name} gibt es noch keinen Modus. Gib \`modus:\` und \`plätze:\` mit an.`)
      mode = db.insert(M).values({ gameId: game.id, name: 'Standard', maxPlayers: seats }).returning().get()
    }
    else return reply(`Welcher Modus? ${game.name} hat: ${modes.map(m => `${m.name} (${m.maxPlayers})`).join(', ')}. Wähl ihn bei \`modus:\` aus.`)
  }

  const r = createRound({ gameId: game.id, modeId: mode.id, startsAt: time.at, maxPlayers: seats ?? mode.maxPlayers, minPlayers: mode.minPlayers, note, createdBy: it.userId })
  try {
    if (await publishRound(r)) {
      const posted = loadRound(r.id)!
      return reply(`✅ Deine Runde steht im Kanal: ${messageUrl(posted)}`)
    }
  }
  catch (e) {
    console.error('[spielrunden] Karte nicht gepostet:', e instanceof Error ? e.message : e)
  }
  // kein Spielkanal oder der Bot darf dort nicht schreiben: die Karte erscheint dort, wo der Befehl getippt wurde
  if (it.channelId) db.update(R).set({ channelId: it.channelId }).where(eq(R.id, r.id)).run()
  const c = card(r)
  return { type: MESSAGE, data: { ...c, allowed_mentions: { parse: [] } } }
}

export const spielenCommand: DiscordCommand = {
  name: 'spielen',
  description: 'Eine Spielrunde aufmachen: Spiel, Modus, Uhrzeit (Karte im Spielkanal)',
  options: [
    { type: STRING, name: 'spiel', description: 'Welches Spiel (neues: einmal mit plätze: angeben)', required: true, autocomplete: true, max_length: 60 },
    { type: STRING, name: 'modus', description: 'z. B. Wingman oder 5-Stack (Plätze merkt sich der Modus)', required: false, autocomplete: true, max_length: 60 },
    { type: STRING, name: 'zeit', description: 'jetzt, 20:30 oder in 30 min (Standard: jetzt)', required: false, max_length: 20 },
    { type: INTEGER, name: 'plätze', description: 'Nur für neue Spiele/Modi oder abweichend für diese Runde', required: false, min_value: 2, max_value: MAX_PLAYERS },
    { type: STRING, name: 'notiz', description: 'z. B. „nur Spaß, keine Ranked“', required: false, max_length: 100 },
  ],
  handle: handleSpielen,
}

// ── /spiele ──

function gameList() {
  const { games, lastEventName } = gameStats()
  if (!games.length) return 'Noch keine Spiele. Leg eins an mit `/spielen spiel:<Name> plätze:<Zahl>`.'
  const lines = [`**Spiele**${lastEventName ? ` (letztes Mal = ${lastEventName})` : ''}`]
  for (const g of games) {
    const played = [g.playedNow ? `diesmal ${g.playedNow}×` : '', g.playedLast ? `letztes Mal ${g.playedLast}×` : ''].filter(Boolean).join(', ')
    lines.push(`• **${g.name}**: ${g.modes.map(m => `${m.name} ${m.maxPlayers}${m.minPlayers ? ` (ab ${m.minPlayers})` : ''}`).join(' · ')}${played ? ` · ${played}` : ''}`)
  }
  lines.push('', 'Runde aufmachen: `/spielen`. Neues Spiel oder neuer Modus: einmal `plätze:` mit angeben.')
  let text = lines.join('\n')
  if (text.length > 2000) text = `${text.slice(0, 1980)}\n…`
  return text
}

async function handleSpiele(it: CommandInteraction) {
  const { sub, values, focused } = commandArgs(it.data)
  if (it.type === 4) return autocomplete(focused, values)
  if (sub !== 'ändern') return reply(gameList())

  if (!(await isLeader(it.userId))) return reply('Spiele ändern kann nur die Orga. Neue legt jeder mit `/spielen … plätze:` an.')
  const game = findGame(String(values.spiel ?? ''))
  if (!game) return reply('Dieses Spiel kenne ich nicht.')
  const mode = findMode(game.id, String(values.modus ?? ''))
  if (!mode) return reply(`${game.name} hat diesen Modus nicht.`)
  const seats = values['plätze'] === undefined ? null : Number(values['plätze'])
  const min = values.mindestens === undefined ? undefined : Number(values.mindestens)
  if (seats === 0) {
    useDb().update(M).set({ archived: true }).where(eq(M.id, mode.id)).run()
    return reply(`🗑️ ${game.name} · ${mode.name} ist aus der Auswahl entfernt. Gespielte Runden bleiben im Verlauf.`)
  }
  const patch: Partial<typeof M.$inferInsert> = { archived: false }
  if (seats !== null) patch.maxPlayers = seats
  if (min !== undefined) patch.minPlayers = min || null
  useDb().update(M).set(patch).where(eq(M.id, mode.id)).run()
  const m = findMode(game.id, mode.name)!
  return reply(`✅ ${game.name} · ${m.name}: ${m.maxPlayers} Plätze${m.minPlayers ? `, ab ${m.minPlayers}` : ''}. Gilt für neue Runden.`)
}

export const spieleCommand: DiscordCommand = {
  name: 'spiele',
  description: 'Unsere Spiele mit Modi und was zuletzt gespielt wurde',
  options: [
    { type: SUB, name: 'liste', description: 'Alle Spiele, Modi und Plätze (nur für dich sichtbar)' },
    { type: SUB, name: 'ändern', description: 'Nur Orga: Plätze eines Modus ändern oder ihn entfernen', options: [
      { type: STRING, name: 'spiel', description: 'Spiel', required: true, autocomplete: true },
      { type: STRING, name: 'modus', description: 'Modus', required: true, autocomplete: true },
      { type: INTEGER, name: 'plätze', description: 'Neue Plätze; 0 = Modus aus der Auswahl nehmen', required: false, min_value: 0, max_value: MAX_PLAYERS },
      { type: INTEGER, name: 'mindestens', description: 'So viele braucht es mindestens; 0 = egal', required: false, min_value: 0, max_value: MAX_PLAYERS },
    ] },
  ],
  handle: handleSpiele,
}

// ── Knöpfe unter der Karte ──

/** Knöpfe mit custom_id sr:… (angemeldet in server/plugins/spielrunden.ts) */
export async function handleRoundButton(p: ButtonPress) {
  const btn = parseRoundButton(p.customId)
  if (!btn) return null
  const db = useDb()
  let r = loadRound(btn.roundId)
  if (!r) return reply('Diese Runde gibt es nicht mehr.')
  // Karte, die als Antwort auf /spielen erschien: Nachricht merken, damit Erinnerung und Abschluss sie finden
  if (!r.messageId && p.messageId && p.channelId) {
    db.update(R).set({ channelId: p.channelId, messageId: p.messageId }).where(eq(R.id, r.id)).run()
    r = loadRound(r.id)!
  }
  const update = (row: RoundRow) => ({ type: UPDATE_MESSAGE, data: { ...card(row), allowed_mentions: { parse: [] } } })
  if (r.status !== 'offen') return reply(r.status === 'abgesagt' ? 'Diese Runde ist abgesagt.' : 'Diese Runde läuft schon bzw. ist vorbei.')

  const players = playersOf(r.id)
  const isIn = players.includes(p.userId)

  if (btn.action === 'raus') {
    if (!isIn) return reply('Du warst in dieser Runde nicht dabei.')
    db.delete(P).where(and(eq(P.roundId, r.id), eq(P.discordId, p.userId))).run()
    if (players.length === 1) db.update(R).set({ status: 'abgesagt' }).where(eq(R.id, r.id)).run()
    return update(loadRound(r.id)!)
  }

  if (btn.action === 'ab') {
    if (r.createdBy !== p.userId && !(await isLeader(p.userId))) return reply('Absagen kann nur, wer die Runde aufgemacht hat (oder die Orga). Selbst raus: „Raus“.')
    db.update(R).set({ status: 'abgesagt' }).where(eq(R.id, r.id)).run()
    const others = players.filter(id => id !== p.userId)
    if (others.length && r.channelId && botCanPost()) {
      const v = roundView(r)
      postChannelCard(r.channelId, `❌ **${roundTitle(v)}** ist abgesagt. ${others.map(id => `<@${id}>`).join(' ')}`, { ping: others, replyTo: r.messageId })
        .catch(e => console.error('[spielrunden] Absage nicht gesendet:', e instanceof Error ? e.message : e))
    }
    return update(loadRound(r.id)!)
  }

  // Bin dabei
  if (isIn) return reply('Du bist schon dabei.')
  if (!(await canPlay(p.userId))) return reply('Mitspielen können alle, die zum aktuellen Event zugesagt haben, und die Orga.')
  const now = new Date()
  if (players.length < r.maxPlayers) {
    db.insert(P).values({ roundId: r.id, discordId: p.userId, joinedAt: now }).onConflictDoNothing().run()
    const fresh = loadRound(r.id)!
    remindNowIfFullAndSoon(fresh)
    return update(fresh)
  }

  // voll: in die nächste offene Runde der Reihe, sonst eine neue aufmachen
  const next = nextInSeries(r).find(n => playersOf(n.id).length < n.maxPlayers)
  if (next) {
    if (playersOf(next.id).includes(p.userId)) return reply(`Du bist schon in Runde ${next.number}${messageUrl(next) ? `: ${messageUrl(next)}` : ''}.`)
    db.insert(P).values({ roundId: next.id, discordId: p.userId, joinedAt: now }).onConflictDoNothing().run()
    remindNowIfFullAndSoon(loadRound(next.id)!)
    void refreshCard(next.id)
    return reply(`Runde ${r.number} ist voll, du bist in Runde ${next.number}${messageUrl(next) ? `: ${messageUrl(next)}` : ''}.`)
  }
  const lastNumber = db.select({ n: sql<number>`max(${R.number})` }).from(R).where(sql`coalesce(${R.seriesId}, ${R.id}) = ${r.seriesId ?? r.id}`).get()?.n ?? r.number
  const round2 = createRound({
    gameId: r.gameId, modeId: r.modeId, startsAt: r.startsAt.getTime() < now.getTime() ? now : r.startsAt, maxPlayers: r.maxPlayers,
    minPlayers: r.minPlayers, note: r.note, createdBy: p.userId, seriesId: r.seriesId ?? r.id, number: Number(lastNumber) + 1,
  })
  try {
    if (await publishRound(round2)) return update(loadRound(r.id)!)
  }
  catch (e) {
    console.error('[spielrunden] neue Runde nicht gepostet:', e instanceof Error ? e.message : e)
  }
  // ohne Bot: die neue Runde erscheint als neue Nachricht im selben Kanal
  if (p.channelId) db.update(R).set({ channelId: p.channelId }).where(eq(R.id, round2.id)).run()
  return { type: MESSAGE, data: { ...card(round2), allowed_mentions: { parse: [] } } }
}

/** Für die Einrichtungs-Ampel: ist ein Spielkanal gewählt? */
export function playChannelCheck() {
  const ok = !!playChannelId()
  return [{ key: 'play-channel', level: ok ? 'ok' as const : 'warn' as const, text: ok ? 'Spielkanal für /spielen gewählt.' : 'Kein Spielkanal für /spielen gewählt (/orga › Spiele); Karten erscheinen dann dort, wo der Befehl getippt wurde.' }]
}

