import type { Status } from './registration'

/**
 * Stand einer Person im aktuellen Event für die Teilnehmer-Liste der Orga, in der Reihenfolge des Ablaufs:
 * offen → eingeladen → zugesagt → platziert → gebucht, danach Warteliste, abgesagt, nicht im Event.
 * „offen“ steht im Event, hat aber noch keine Nachricht aus dem Tool bekommen; „eingeladen“ hat mindestens eine
 * (Erinnerung oder Nachricht von Hand) erhalten.
 * Dazu „Erreicht“: ob die Nachricht, auf die es im jeweiligen Stand ankommt, die Person erreicht hat.
 * Reiner Code ohne Datenbank, damit er sich testen lässt.
 */

export type Stage = 'offen' | 'eingeladen' | 'zugesagt' | 'platziert' | 'gebucht' | 'warteliste' | 'abgesagt' | 'nicht'

/** Reihenfolge, Beschriftung und Fortschritt (zugesagt, Platz, gebucht als Punkte; null = kein Fortschritt) */
export const STAGES: { key: Stage, label: string, steps: number | null, icon?: string }[] = [
  { key: 'offen', label: 'offen', steps: 0 },
  { key: 'eingeladen', label: 'eingeladen', steps: 0 },
  { key: 'zugesagt', label: 'zugesagt', steps: 1 },
  { key: 'platziert', label: 'platziert', steps: 2 },
  { key: 'gebucht', label: 'gebucht', steps: 3 },
  { key: 'warteliste', label: 'Warteliste', steps: null, icon: '⏳' },
  { key: 'abgesagt', label: 'abgesagt', steps: null, icon: '✗' },
  { key: 'nicht', label: 'nicht im Event', steps: null, icon: '·' },
]
const RANK = new Map(STAGES.map((s, i) => [s.key, i]))

/**
 * Zusammengefasste Stände, wie /leute in Discord sie auch kennt: „nicht gebucht“ ist kein eigener Status, sondern
 * zugesagt (ohne oder mit Platz), aber noch ohne Buchung; „nicht zugesagt“ heißt offen oder eingeladen.
 */
export type StageGroup = 'nicht_zugesagt' | 'nicht_gebucht'
export const STAGE_GROUPS: { key: StageGroup, label: string, title: string, stages: Stage[] }[] = [
  { key: 'nicht_zugesagt', label: 'nicht zugesagt', title: 'offen oder eingeladen: noch keine Antwort', stages: ['offen', 'eingeladen'] },
  { key: 'nicht_gebucht', label: 'nicht gebucht', title: 'zugesagt (mit oder ohne Platz), aber noch nicht gebucht', stages: ['zugesagt', 'platziert'] },
]
export const inStageGroup = (stage: Stage, group: StageGroup) => STAGE_GROUPS.find(g => g.key === group)!.stages.includes(stage)

export interface StageInput {
  /** steht im aktuellen Event */
  registered: boolean
  status?: Status | null
  seat?: string | null
  booking?: 'offen' | 'gebucht' | null
  waitlist?: boolean
  /** hat in diesem Event schon eine Nachricht aus dem Tool erhalten (gesendet) */
  contacted?: boolean
}

export function stageOf(p: StageInput): Stage {
  if (!p.registered) return 'nicht'
  if (p.status === 'zugesagt') return p.booking === 'gebucht' ? 'gebucht' : p.seat ? 'platziert' : 'zugesagt'
  if (p.waitlist) return 'warteliste'
  if (p.status === 'abgesagt') return 'abgesagt'
  return p.contacted ? 'eingeladen' : 'offen'
}

/** nach Stand (Ablauf), dann Nick */
export function compareByStage(a: { stage: Stage, nick: string }, b: { stage: Stage, nick: string }) {
  return (RANK.get(a.stage)! - RANK.get(b.stage)!) || a.nick.localeCompare(b.nick, 'de')
}

// ── Erreicht ──

export type MessageKindForReach = 'erinnerung_offen' | 'manuell' | 'registrierung' | 'buchung' | 'angebot'
export type Delivery = { status: 'wartet' | 'gesendet' | 'fehler' | 'entfallen', at: Date | string | null, error: string | null } | null

export interface ReachInput {
  stage: Stage
  /** hat eine Discord-ID (sonst erreichen ihn keine Nachrichten) */
  discord: boolean
  messages: Partial<Record<MessageKindForReach, Delivery>>
  /** Buchung freigegeben: Zugesagte brauchen die Buchungsnachricht */
  bookingReleased: boolean
  /** auf der Warteliste mit offenem Angebot */
  offer: boolean
}

/**
 * ok = angekommen (oder abgehakt) · wartet = in der Warteschlange · fehler = Discord hat abgelehnt ·
 * fehlt = eine nötige Nachricht ist nie rausgegangen · offen = noch nichts nötig, aber auch nichts geschickt · none = nicht relevant
 */
export type ReachState = 'ok' | 'wartet' | 'fehler' | 'fehlt' | 'offen' | 'none'
export interface Reach { state: ReachState, label: string, kind: MessageKindForReach | null, at: Date | string | null, error: string | null }

const KIND_LABEL: Record<MessageKindForReach, string> = { erinnerung_offen: 'Erinnerung', manuell: 'Nachricht', registrierung: 'Info', buchung: 'Buchung', angebot: 'Angebot' }

function fromDelivery(kind: MessageKindForReach, d: NonNullable<Delivery>): Reach {
  const name = KIND_LABEL[kind]
  const base = { kind, at: d.at, error: d.error }
  if (d.status === 'gesendet') return { ...base, state: 'ok', label: `${name} angekommen` }
  if (d.status === 'entfallen') return { ...base, state: 'ok', label: `${name} erledigt` }
  if (d.status === 'wartet') return { ...base, state: 'wartet', label: `${name} wartet` }
  return { ...base, state: 'fehler', label: `${name}: Fehler` }
}

export function reachOf(p: ReachInput): Reach {
  const none = (label = ''): Reach => ({ state: 'none', label, kind: null, at: null, error: null })
  if (p.stage === 'nicht' || p.stage === 'abgesagt') return none()
  if (!p.discord) return { state: 'fehlt', label: 'ohne Discord', kind: null, at: null, error: null }
  const need = (kind: MessageKindForReach, missing: string, missingState: ReachState = 'fehlt'): Reach => {
    const d = p.messages[kind]
    return d ? fromDelivery(kind, d) : { state: missingState, label: missing, kind, at: null, error: null }
  }
  // die neueste Erinnerung, sonst die neueste Nachricht von Hand (die Ankündigung im Kanal zählt nicht pro Person)
  const invite = p.messages.erinnerung_offen ? 'erinnerung_offen' : p.messages.manuell ? 'manuell' : null
  switch (p.stage) {
    case 'offen': {
      // noch nichts angekommen: zeigt, ob etwas wartet oder scheiterte; „erledigt“ heißt hier nichts
      const d = invite ? p.messages[invite] : null
      return d && d.status !== 'entfallen' && invite ? fromDelivery(invite, d) : { state: 'offen', label: 'noch nicht angeschrieben', kind: null, at: null, error: null }
    }
    case 'eingeladen':
      // angekommen ist schon etwas; scheiterte die letzte Nachricht, zeigt es das
      return invite ? fromDelivery(invite, p.messages[invite]!) : { state: 'ok', label: 'angeschrieben', kind: null, at: null, error: null }
    case 'warteliste':
      return p.offer ? need('angebot', 'Angebot fehlt') : none('wartet auf einen Platz')
    case 'gebucht': {
      // fertig: zeigt die letzte Nachricht, ein Fehler dort ist erledigt
      const d = p.messages.buchung ?? p.messages.registrierung
      if (!d) return { state: 'ok', label: 'hat gebucht', kind: null, at: null, error: null }
      const r = fromDelivery(p.messages.buchung ? 'buchung' : 'registrierung', d)
      return r.state === 'fehler' ? { ...r, state: 'ok', label: 'hat gebucht' } : r
    }
    default: // zugesagt, platziert
      return p.bookingReleased ? need('buchung', 'Buchung fehlt') : need('registrierung', 'Info fehlt')
  }
}

/** zählt für „nicht erreicht“ */
export const unreached = (r: Reach) => r.state === 'fehler' || r.state === 'fehlt'
