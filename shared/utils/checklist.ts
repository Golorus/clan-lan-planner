import { formatEventRange, utcToBerlinLocal } from './eventTime'
import { bookingStarted, countdown, deadlineMs, demandPhase, seatsOpen, waitlistActive, type EventRules, type Status } from './registration'
import { DEFAULT_EVENT_ROLE_NAME } from './branding'

/**
 * Persönliche Checkliste „Dein Stand“ auf der Startseite. Speichert nichts: wird bei jedem Laden aus denselben
 * Daten und Regeln (demandPhase, seatsOpen, waitlistActive, bookingStarted) berechnet, die auch Knöpfe und Backend
 * benutzen. Reiner Code ohne Datenbank, damit er sich testen lässt; die Komponente zeigt nur an.
 *
 * Ablauf: Bedarfsmeldung (bis „Bedarfsabfrage bis“) → Platzwahl (bis zum Buchungsstart) → Buchung (bis „Buchen bis“) → LAN.
 */

export interface ChecklistEvent {
  startsAt: string, endsAt: string, location: string | null
  registrationOpen: boolean
  /** ISO-Zeitpunkt, wenn von Hand vorzeitig geschlossen */
  demandClosedAt: string | null
  demandUntil: string, bookingFrom: string, bookingUntil: string
  maxParticipants: number | null
  areaSize: number | null
  areaFixed: boolean
  bookingReleased: boolean
  bookingReleasedAt: string | null
}

export interface ChecklistMe {
  status: Status | null
  seat: string | null
  swapLeft: boolean
  waitlistPosition: number | null
  offer: { seat: string | null, expiresAt: string | Date } | null
  booking: { status: 'offen' | 'gebucht', bookedSeat: string | null } | null
  /** false = nicht auf unserem Discord-Server, null = unbekannt */
  isMember: boolean | null
  /** zugesagt, aber die Event-Rolle fehlt auf Discord */
  roleMissing: boolean
  contactId: number | null
}

export type StepState = 'done' | 'now' | 'later' | 'missed'
export type StepAction = 'join' | 'zusagen' | 'warteliste' | 'platz' | 'buchen' | 'angebot'
export type StepKey = 'angebot' | 'discord' | 'zusage' | 'platz' | 'bereich' | 'buchungsstart' | 'buchung'

export interface ChecklistStep {
  key: StepKey
  state: StepState
  label: string
  detail?: string
  /** Hinweis ist eine Warnung (rot), z. B. gebuchter Platz weicht vom Plan ab */
  warn?: boolean
  /** Frist bzw. bekanntes Datum als Text, z. B. „bis Fr 20.11.2026, 18:00“ */
  dueText?: string
  /** nur bei „jetzt dran“: Restzeit, z. B. „noch 3 Tage 4 Std.“ */
  left?: string
  action?: StepAction
  /** Orga-Schritt, nur zur Info: zählt nicht mit und ist nie „jetzt dran“ oder „verpasst“ */
  orga?: boolean
}

export interface TimelineSegment {
  key: 'bedarf' | 'platzwahl' | 'buchung' | 'lan'
  label: string
  /** kurz, z. B. „bis 20.11.“; auf dem Handy steht nur das */
  date: string
  state: 'past' | 'current' | 'future'
}

export interface Checklist {
  mode: 'liste' | 'abgesagt'
  steps: ChecklistStep[]
  /** nur die eigenen Schritte (ohne Orga-Info und ohne Platzangebot) */
  done: number
  total: number
  /** eingeklappt zu sehen: „jetzt dran“, sonst Verpasstes, sonst das Nächste; null = alles erledigt */
  focus: { step: ChecklistStep, kind: 'now' | 'missed' | 'next' } | null
  /** Hinweise, die kein Schritt sind (z. B. fehlende Discord-Rolle) */
  warnings: string[]
  declined: { text: string, action: 'zusagen' | 'warteliste' } | null
  /** summary: alle Fristen (die LAN steht im Kopf, nicht hier; leer ab Beginn der LAN); short: fürs Handy nur die nächste */
  timeline: { segments: TimelineSegment[], marker: number, summary: string, short: string }
  event: { when: string, where: string | null, countdown: string }
}

export const MISSED_HINT = 'Frist abgelaufen. Melde dich bei deiner Kontaktperson.'
const DAY_MS = 24 * 60 * 60 * 1000

/** Regeln wie im Backend (eventRules) aus den Feldern von GET /api/sitzplan */
export function planRules(ev: ChecklistEvent): EventRules {
  return {
    registrationOpen: ev.registrationOpen,
    demandClosedAt: ev.demandClosedAt ? new Date(ev.demandClosedAt) : null,
    demandUntil: ev.demandUntil, bookingFrom: ev.bookingFrom, bookingUntil: ev.bookingUntil,
    bookingReleased: ev.bookingReleased,
    maxParticipants: ev.maxParticipants, areaSize: ev.areaSize,
  }
}

const fmt = (ms: number) => formatEventRange(utcToBerlinLocal(ms), '')
/** „20.11.“ */
const dm = (ms: number) => {
  const l = utcToBerlinLocal(ms)
  return `${l.slice(8, 10)}.${l.slice(5, 7)}.`
}
/** ganze Kalendertage von a bis b (beide JJJJ-MM-TT) */
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
const days = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`
/** knapp für die Zahlenzeile: ganze Tage, darunter Stunden/Minuten */
function shortLeft(ms: number, now: Date) {
  const d = Math.floor((ms - now.getTime()) / DAY_MS)
  return d >= 1 ? days(d) : countdown(ms, now)
}
const minMs = (...v: (number | null)[]) => {
  const list = v.filter((x): x is number => x !== null)
  return list.length ? Math.min(...list) : null
}

/** eventRoleName: wie die Event-Rolle in der Warnung heißt (NUXT_PUBLIC_EVENT_ROLE_NAME) */
export function buildChecklist(ev: ChecklistEvent, me: ChecklistMe, confirmedCount: number, now: Date, eventRoleName = DEFAULT_EVENT_ROLE_NAME): Checklist {
  const rules = planRules(ev)
  const t = now.getTime()
  const phase = demandPhase(rules, now)
  const canPick = seatsOpen(rules, now)
  const wl = waitlistActive(rules, now, confirmedCount)
  const started = bookingStarted(rules, now)

  const demandUntil = deadlineMs(ev.demandUntil)
  const closedAt = ev.demandClosedAt ? Date.parse(ev.demandClosedAt) : null
  /** tatsächliches Ende der Bedarfsabfrage: Frist oder vorzeitiges Schließen */
  const demandEnd = phase === 'nachher' ? minMs(demandUntil, closedAt) : demandUntil
  const releasedAt = ev.bookingReleasedAt ? Date.parse(ev.bookingReleasedAt) : null
  /** Buchungsstart = Ende der Platzwahl: geplant, oder früher, wenn die Orga von Hand freigegeben hat */
  const startAt = minMs(deadlineMs(ev.bookingFrom), releasedAt)
  const bookEnd = deadlineMs(ev.bookingUntil)

  const confirmed = me.status === 'zugesagt'
  const onWaitlist = !confirmed && (!!me.waitlistPosition || !!me.offer)
  const due = (ms: number | null, running = false) => ms === null ? {} : {
    dueText: `bis ${fmt(ms)}`,
    ...(running ? { left: `noch ${countdown(ms, now)}` } : {}),
  }

  const steps: ChecklistStep[] = []

  if (me.offer) {
    const exp = new Date(me.offer.expiresAt).getTime()
    steps.push({
      key: 'angebot', state: 'now', action: 'angebot',
      label: `Ein Platz ist frei geworden${me.offer.seat ? `: ${me.offer.seat}` : ''}`,
      detail: me.offer.seat ? 'Danach geht er an den Nächsten auf der Warteliste.' : 'Nimm an und such dir danach einen freien Platz aus. Sonst geht er an den Nächsten auf der Warteliste.',
      ...due(exp, true),
    })
  }

  if (me.isMember === false) {
    steps.push({ key: 'discord', state: 'now', action: 'join', label: 'Unserem Discord-Server beitreten', detail: 'Sonst erreichen dich unsere Nachrichten nicht.' })
  }

  // ── zusagen ──
  if (onWaitlist) {
    steps.push({
      key: 'zusage', state: 'later',
      label: me.waitlistPosition ? `Auf der Warteliste, Platz ${me.waitlistPosition}` : 'Auf der Warteliste',
      detail: 'Wird ein Platz frei, schreiben wir dir über Discord.',
    })
  }
  else if (confirmed) steps.push({ key: 'zusage', state: 'done', label: 'Zugesagt' })
  else if (phase === 'vorher') steps.push({ key: 'zusage', state: 'later', label: 'Zusagen', detail: 'Die Bedarfsmeldung startet bald.', ...due(demandUntil) })
  else if (phase === 'abfrage' && !wl) steps.push({ key: 'zusage', state: 'now', action: 'zusagen', label: 'Zusagen', ...due(demandUntil, true) })
  else if (phase === 'abfrage') steps.push({ key: 'zusage', state: 'now', action: 'warteliste', label: 'Alle Plätze vergeben: auf die Warteliste' })
  else steps.push({ key: 'zusage', state: 'missed', action: 'warteliste', label: 'Zusagen', detail: MISSED_HINT, ...due(demandEnd) })

  // ── Platz wählen: bis zum Buchungsstart ──
  const pickHint = 'Tipp unten im Plan auf dein Bild und dann auf einen freien Platz.'
  const inArea = ev.areaFixed ? 'Im gemeldeten Bereich (gestrichelt umrandet): tipp unten auf dein Bild und dann auf einen freien Platz darin.' : undefined
  if (confirmed && me.seat) {
    const booked = me.booking?.status === 'gebucht'
    steps.push({
      key: 'platz', state: 'done', label: `Platz ${me.seat} gewählt`,
      ...(!booked && canPick ? { detail: `Umsetzen kannst du dich selbst bis ${startAt !== null ? fmt(startAt) : 'zum Buchungsstart'}${ev.areaFixed ? ', im gemeldeten Bereich' : ''}.` } : {}),
    })
  }
  else if (!confirmed) steps.push({ key: 'platz', state: 'later', label: 'Platz wählen', ...due(startAt !== null && t < startAt ? startAt : null) })
  else if (canPick) steps.push({ key: 'platz', state: 'now', action: 'platz', label: 'Platz wählen', detail: inArea ?? pickHint, ...due(startAt, true) })
  // nach dem Buchungsstart: wer noch keinen Platz hat, setzt sich im Bereich (oder einmal nach dem Nachrücken)
  else if (started && (ev.areaFixed || me.swapLeft)) {
    steps.push({ key: 'platz', state: 'now', action: 'platz', label: 'Platz wählen', detail: inArea ?? 'Du bist nachgerückt und kannst dir einen freien Platz aussuchen.' })
  }
  else if (phase === 'vorher') steps.push({ key: 'platz', state: 'later', label: 'Platz wählen', ...due(startAt) })
  else steps.push({ key: 'platz', state: 'missed', label: 'Platz wählen', detail: MISSED_HINT, ...due(startAt) })

  // ── Orga, nur zur Info ──
  steps.push(ev.areaFixed
    ? { key: 'bereich', state: 'done', orga: true, label: 'Plätze beim Veranstalter geblockt' }
    : { key: 'bereich', state: 'later', orga: true, label: 'Plätze beim Veranstalter blocken', detail: 'Macht die Orga nach der Bedarfsmeldung.' })
  steps.push(ev.bookingReleased
    ? { key: 'buchungsstart', state: 'done', orga: true, label: 'Buchung gestartet', ...(releasedAt !== null ? { dueText: `am ${fmt(releasedAt)}` } : {}) }
    : {
        key: 'buchungsstart', state: 'later', orga: true, label: 'Buchungsstart',
        ...(startAt !== null ? { dueText: `am ${fmt(startAt)}` } : { detail: 'Termin folgt.' }),
        ...(startAt !== null ? { detail: 'Dann kommen Code und Link per Discord; umsetzen geht danach nur noch über die Kontaktperson.' } : {}),
      })

  // ── buchen und melden ──
  if (me.booking?.status === 'gebucht') {
    const booked = me.booking.bookedSeat ?? me.seat
    const differs = !!(me.booking.bookedSeat && me.seat && me.booking.bookedSeat !== me.seat)
    steps.push({
      key: 'buchung', state: 'done', label: booked ? `Buchung gemeldet: Platz ${booked}` : 'Buchung gemeldet',
      ...(differs ? { warn: true, detail: `Geplant war ${me.seat}. Sag bitte deiner Kontaktperson Bescheid, damit der Plan stimmt.` } : {}),
    })
  }
  else if (!confirmed || !ev.bookingReleased) steps.push({ key: 'buchung', state: 'later', label: 'Buchen und hier melden', ...due(bookEnd) })
  else if (bookEnd === null || t < bookEnd) {
    steps.push({
      key: 'buchung', state: 'now', action: 'buchen', label: 'Buchen und hier melden',
      detail: 'Im Shop buchen, dann hier „Ich habe gebucht“: erst dann ist es bei uns erledigt.',
      ...due(bookEnd, true),
    })
  }
  else steps.push({ key: 'buchung', state: 'missed', label: 'Buchen und hier melden', detail: MISSED_HINT, ...due(bookEnd) })

  // ── abgesagt: eine Zeile statt Liste ──
  let declined: Checklist['declined'] = null
  if (me.status === 'abgesagt' && !onWaitlist) {
    declined = !wl && phase !== 'nachher'
      ? { action: 'zusagen', text: `Du hast abgesagt. Du kannst es dir ${demandUntil !== null ? `bis ${fmt(demandUntil)}` : 'bis zum Ende der Bedarfsmeldung'} noch anders überlegen.` }
      : { action: 'warteliste', text: `Du hast abgesagt. ${phase === 'abfrage' ? 'Alle Plätze sind vergeben' : 'Die Bedarfsmeldung ist vorbei'}: über die Warteliste bekommst du einen frei gewordenen Platz angeboten.` }
  }

  const counted = steps.filter(s => !s.orga && s.key !== 'angebot')
  const pick = (state: StepState) => steps.find(s => s.state === state)
  const nowStep = pick('now'), missed = pick('missed'), next = pick('later')
  const focus: Checklist['focus'] = nowStep ? { step: nowStep, kind: 'now' }
    : missed ? { step: missed, kind: 'missed' }
      : next ? { step: next, kind: 'next' } : null

  const warnings: string[] = []
  if (confirmed && me.roleMissing) warnings.push(`Dir fehlt auf Discord die ${eventRoleName}. Melde dich bitte bei der Orga.`)

  const lan = lanStatus(ev, now)
  return {
    mode: declined ? 'abgesagt' : 'liste',
    steps: declined ? [] : steps,
    done: counted.filter(s => s.state === 'done').length,
    total: counted.length,
    focus: declined ? null : focus,
    warnings,
    declined,
    timeline: timeline(),
    event: { when: formatEventRange(ev.startsAt, ev.endsAt), where: ev.location || null, countdown: lan.text },
  }

  function timeline(): Checklist['timeline'] {
    const s = deadlineMs(ev.startsAt), e = deadlineMs(ev.endsAt)
    const bookingState: TimelineSegment['state'] = !started ? 'future' : bookEnd !== null && t >= bookEnd ? 'past' : 'current'
    const segs: (TimelineSegment & { from: number | null, to: number | null })[] = [
      {
        key: 'bedarf', label: 'Bedarfsmeldung', date: demandEnd !== null ? `bis ${dm(demandEnd)}` : 'offen',
        state: phase === 'vorher' ? 'future' : phase === 'abfrage' ? 'current' : 'past', from: null, to: demandEnd,
      },
      {
        // die Platzwahl läuft schon während der Bedarfsmeldung; hervorgehoben wird sie erst danach, wenn sie das Wichtigste ist
        key: 'platzwahl', label: 'Platzwahl', date: startAt !== null ? `bis ${dm(startAt)}` : 'bis Buchungsstart',
        state: started ? 'past' : canPick && phase === 'nachher' ? 'current' : 'future', from: demandEnd, to: startAt,
      },
      {
        key: 'buchung', label: 'Buchung',
        date: startAt !== null ? `${dm(startAt)}–${bookEnd !== null ? dm(bookEnd) : ''}` : bookEnd !== null ? `bis ${dm(bookEnd)}` : 'folgt',
        state: bookingState, from: startAt, to: bookEnd,
      },
      {
        key: 'lan', label: 'LAN', date: s !== null ? (e !== null && dm(e) !== dm(s) ? `${dm(s)}–${dm(e)}` : dm(s)) : '',
        state: lan.state, from: s, to: e,
      },
    ]

    // „heute“: gleich breite Abschnitte; im laufenden anteilig, wenn Anfang und Ende bekannt sind
    const i = segs.findIndex(x => x.state === 'current')
    let marker: number
    if (i >= 0) {
      const c = segs[i]!
      const part = c.from !== null && c.to !== null && c.to > c.from ? Math.min(1, Math.max(0, (t - c.from) / (c.to - c.from))) : 0.5
      marker = (i + part) / segs.length
    }
    else marker = segs.filter(x => x.state === 'past').length / segs.length

    const parts: string[] = []
    if (lan.state === 'future') {
      if (phase === 'vorher') parts.push('Bedarfsmeldung startet bald')
      else if (phase === 'abfrage') parts.push(demandUntil !== null ? `Bedarfsmeldung noch ${shortLeft(demandUntil, now)}` : 'Bedarfsmeldung läuft')
      if (!started) {
        if (startAt === null) parts.push('Buchungsstart folgt')
        else parts.push(phase === 'nachher' ? `Platzwahl noch ${shortLeft(startAt, now)}` : `Platzwahl bis ${dm(startAt)}`)
        if (bookEnd !== null) parts.push(`Buchen bis ${dm(bookEnd)}`)
      }
      else if (bookEnd === null) parts.push('Buchung läuft')
      else parts.push(t < bookEnd ? `Buchen noch ${shortLeft(bookEnd, now)}` : 'Buchung vorbei')
    }
    const short = parts[0] ?? ''
    return { segments: segs.map(({ from: _f, to: _t, ...seg }) => seg), marker, summary: parts.join(' · '), short }
  }
}

/** Countdown in Kalendertagen (Berlin) bis zur LAN, während der LAN „Tag n von m“ */
export function lanStatus(ev: Pick<ChecklistEvent, 'startsAt' | 'endsAt'>, now: Date): { state: TimelineSegment['state'], text: string } {
  const s = deadlineMs(ev.startsAt), e = deadlineMs(ev.endsAt)
  const today = utcToBerlinLocal(now).slice(0, 10)
  const startDay = ev.startsAt.slice(0, 10)
  if (s === null || now.getTime() < s) {
    if (s === null) return { state: 'future', text: '' }
    const n = dayDiff(today, startDay)
    return { state: 'future', text: n <= 0 ? 'LAN beginnt heute' : `noch ${days(n)} bis zur LAN` }
  }
  if (e === null || now.getTime() < e) {
    const total = e === null ? 1 : dayDiff(startDay, ev.endsAt.slice(0, 10)) + 1
    return { state: 'current', text: `LAN läuft, Tag ${Math.min(total, dayDiff(startDay, today) + 1)} von ${total}` }
  }
  return { state: 'past', text: 'LAN vorbei' }
}
