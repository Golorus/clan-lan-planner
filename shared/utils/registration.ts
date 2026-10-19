import { berlinToUtcIso, LOCAL_DATETIME } from './eventTime'

/**
 * Regeln der Registrierung in zwei Phasen (wie bei LANs, auf denen der Veranstalter die Plätze bucht):
 * Bedarfsabfrage (zusagen/absagen, Platz wählen) bis zur Frist, danach Warteliste; Buchungsphase mit Code.
 * Reiner Code ohne Datenbank, damit er in Server und Browser gleich gilt und sich testen lässt.
 */

export type Status = 'offen' | 'zugesagt' | 'abgesagt'
export type Role = 'leader' | 'contact' | 'self'

export interface EventRules {
  /** Bedarfsabfrage geöffnet (der Schalter in /orga) */
  registrationOpen: boolean
  /** von Hand geschlossen; null = noch nie geöffnet oder wieder offen */
  demandClosedAt: Date | null
  /** Fristen als Ortszeit Europe/Berlin JJJJ-MM-TTTHH:mm, leer = keine */
  demandUntil: string
  /** Buchungsstart = Ende der Platzwahl; der Takt gibt dann automatisch frei */
  bookingFrom: string
  bookingUntil: string
  /** Buchung schon freigegeben (automatisch oder von Hand vorgezogen) */
  bookingReleased: boolean
  maxParticipants: number | null
  /** Plätze im fixierten Bereich; null = kein Bereich fixiert */
  areaSize?: number | null
}

/** Ortszeit Berlin → Zeitpunkt in ms, null wenn leer oder ungültig */
export function deadlineMs(local: string | null | undefined) {
  if (!local || !LOCAL_DATETIME.test(local)) return null
  return Date.parse(berlinToUtcIso(local))
}

/**
 * vorher: noch nicht geöffnet · abfrage: Bedarfsabfrage läuft · nachher: Frist vorbei oder vorzeitig geschlossen.
 * Erst ab „nachher“ gibt es die Warteliste (oder vorher, wenn die Höchstzahl erreicht ist).
 */
export function demandPhase(ev: EventRules, now: Date): 'vorher' | 'abfrage' | 'nachher' {
  const until = deadlineMs(ev.demandUntil)
  if (until !== null && now.getTime() >= until) return 'nachher'
  if (ev.registrationOpen) return 'abfrage'
  return ev.demandClosedAt ? 'nachher' : 'vorher'
}

/** Höchstzahl an Zusagen: die eingestellte, bei fixiertem Bereich höchstens so viele wie er Plätze hat; null = ohne Grenze */
export function capacity(ev: Pick<EventRules, 'maxParticipants' | 'areaSize'>) {
  const caps = [ev.maxParticipants, ev.areaSize].filter((v): v is number => typeof v === 'number' && v >= 0)
  return caps.length ? Math.min(...caps) : null
}

/** Höchstzahl an Zusagen erreicht? */
export function isFull(ev: Pick<EventRules, 'maxParticipants' | 'areaSize'>, zugesagt: number) {
  const cap = capacity(ev)
  return cap !== null && (cap > 0 || ev.areaSize !== undefined && ev.areaSize !== null) && zugesagt >= cap
}

export function waitlistActive(ev: EventRules, now: Date, zugesagt: number) {
  const phase = demandPhase(ev, now)
  return phase === 'nachher' || (phase === 'abfrage' && isFull(ev, zugesagt))
}

/** Buchung läuft: von Hand freigegeben oder der Buchungsstart ist erreicht (auf die Minute, auch bevor der Takt freigibt) */
export function bookingStarted(ev: Pick<EventRules, 'bookingFrom' | 'bookingReleased'>, now: Date) {
  if (ev.bookingReleased) return true
  const from = deadlineMs(ev.bookingFrom)
  return from !== null && now.getTime() >= from
}

/** Der Takt soll jetzt freigeben: Buchungsstart erreicht, aber noch nicht freigegeben */
export function autoReleaseDue(ev: Pick<EventRules, 'bookingFrom' | 'bookingReleased'>, now: Date) {
  return !ev.bookingReleased && bookingStarted(ev, now)
}

/**
 * Platzwahl für Teilnehmer: ab Beginn der Bedarfsabfrage bis zum Buchungsstart, also auch nach der Bedarfsabfrage.
 * Ab dem Buchungsstart steht der Platz in der Buchungsnachricht, deshalb setzt sich danach niemand mehr selbst um.
 */
export function seatsOpen(ev: EventRules, now: Date) {
  return demandPhase(ev, now) !== 'vorher' && !bookingStarted(ev, now)
}

export type StatusCheck = { ok: true } | { ok: false, status: number, reason: string, waitlist?: boolean }

/**
 * Darf role den Status von from auf to setzen? Absagen geht immer; zusagen nur in der Bedarfsabfrage und
 * unter der Höchstzahl, sonst bleibt nur die Warteliste. Der Projektleiter darf alles.
 */
export function checkStatus(role: Role, ev: EventRules, now: Date, zugesagt: number, from: Status, to: Status): StatusCheck {
  if (from === to) return { ok: true }
  if (role === 'leader') return { ok: true }
  if (to === 'abgesagt') return { ok: true }
  if (to === 'offen') return { ok: false, status: 403, reason: 'Zurück auf „offen“ setzt nur die Orga.' }
  if (role === 'contact') return { ok: false, status: 403, reason: 'Zusagen kann nur die Person selbst.' }
  const phase = demandPhase(ev, now)
  if (phase === 'vorher') return { ok: false, status: 403, reason: 'Die Bedarfsabfrage hat noch nicht begonnen.' }
  if (phase === 'nachher') return { ok: false, status: 409, reason: 'Die Bedarfsabfrage ist vorbei. Du kannst dich auf die Warteliste setzen.', waitlist: true }
  if (isFull(ev, zugesagt)) return { ok: false, status: 409, reason: 'Alle Plätze sind vergeben. Du kannst dich auf die Warteliste setzen.', waitlist: true }
  return { ok: true }
}

/** Auf die Warteliste: nur wenn sie aktiv ist und man nicht schon zugesagt hat */
export function checkWaitlist(ev: EventRules, now: Date, zugesagt: number, status: Status, onList: boolean): StatusCheck {
  if (status === 'zugesagt') return { ok: false, status: 409, reason: 'Du hast schon zugesagt.' }
  if (onList) return { ok: false, status: 409, reason: 'Du stehst schon auf der Warteliste.' }
  if (!waitlistActive(ev, now, zugesagt)) return { ok: false, status: 409, reason: 'Eine Warteliste gibt es erst nach dem Ende der Bedarfsabfrage. Sag einfach zu.' }
  return { ok: true }
}

export interface WaitlistEntry { id: number, waitlistAt: Date | null, waitlistRank: number | null }

/** Reihenfolge der Warteliste: von Hand gesetzte Ränge zuerst, sonst nach Zeitpunkt des Eintrags */
export function sortWaitlist<T extends WaitlistEntry>(list: T[]): T[] {
  const rank = (e: T) => e.waitlistRank ?? Number.MAX_SAFE_INTEGER
  return list.filter(e => e.waitlistAt).sort((a, b) => rank(a) - rank(b)
    || a.waitlistAt!.getTime() - b.waitlistAt!.getTime() || a.id - b.id)
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Tage-Liste aus /orga, z. B. „14, 7, 2“ → [14, 7, 2] (ganze Tage 1–90, absteigend, ohne doppelte) */
export function parseDays(input: unknown): number[] {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/[\s,;]+/)
  const days = raw.map(v => Number(v)).filter(n => Number.isInteger(n) && n >= 1 && n <= 90)
  return [...new Set(days)].sort((a, b) => b - a)
}

/**
 * Welcher Erinnerungs-Zeitpunkt gilt gerade? Der jüngste schon erreichte vor der Frist; ältere,
 * verpasste (z. B. Frist erst 5 Tage vorher gesetzt) werden übersprungen, damit niemand zwei auf einmal bekommt.
 */
export function currentReminder(days: number[], deadline: number | null, now: Date): number | null {
  if (deadline === null || now.getTime() >= deadline) return null
  const due = days.filter(d => now.getTime() >= deadline - d * DAY_MS)
  return due.length ? Math.min(...due) : null
}

export interface ReminderEvent extends EventRules {
  id: number
  remindDays: number[]
  bookingRemindDays: number[]
}
export interface ReminderPerson {
  id: number
  status: Status
  seat: string | null
  booking: 'offen' | 'gebucht'
  remindersOff: boolean
  discordId: string | null
  onWaitlist: boolean
}
export type ReminderKind = 'erinnerung_offen' | 'erinnerung_platz' | 'erinnerung_buchung'
export interface DueReminder { registrationId: number, kind: ReminderKind, key: string }

/**
 * Fällige Erinnerungen: an Offene vor dem Ende der Bedarfsabfrage, an Zugesagte ohne Platz vor dem Ende
 * der Platzwahl, an Zugesagte ohne Buchung vor „Buchen bis“. Der Schlüssel macht jede höchstens einmal je
 * Person und Zeitpunkt (Unique-Index in message_deliveries).
 */
export function dueReminders(ev: ReminderEvent, people: ReminderPerson[], now: Date): DueReminder[] {
  const out: DueReminder[] = []
  const phase = demandPhase(ev, now)
  const reach = people.filter(p => p.discordId && !p.remindersOff)

  const demand = phase === 'abfrage' ? currentReminder(ev.remindDays, deadlineMs(ev.demandUntil), now) : null
  if (demand !== null) {
    for (const p of reach) if (p.status === 'offen' && !p.onWaitlist) out.push({ registrationId: p.id, kind: 'erinnerung_offen', key: `offen:${ev.id}:${p.id}:${demand}` })
  }

  const seatDeadline = deadlineMs(ev.bookingFrom)
  const seat = seatsOpen(ev, now) ? currentReminder(ev.remindDays, seatDeadline, now) : null
  if (seat !== null) {
    for (const p of reach) if (p.status === 'zugesagt' && !p.seat) out.push({ registrationId: p.id, kind: 'erinnerung_platz', key: `platz:${ev.id}:${p.id}:${seat}` })
  }

  const booking = ev.bookingReleased ? currentReminder(ev.bookingRemindDays, deadlineMs(ev.bookingUntil), now) : null
  if (booking !== null) {
    for (const p of reach) if (p.status === 'zugesagt' && p.booking === 'offen') out.push({ registrationId: p.id, kind: 'erinnerung_buchung', key: `buchung:${ev.id}:${p.id}:${booking}` })
  }
  return out
}

/** Restzeit bis zu einer Frist, z. B. „3 Tage 4 Std.“, „5 Std. 12 Min.“, „vorbei“ */
export function countdown(deadline: number | null, now: Date) {
  if (deadline === null) return ''
  const ms = deadline - now.getTime()
  if (ms <= 0) return 'vorbei'
  const min = Math.floor(ms / 60_000), h = Math.floor(min / 60), d = Math.floor(h / 24)
  if (d >= 1) return `${d} ${d === 1 ? 'Tag' : 'Tage'}${h % 24 ? ` ${h % 24} Std.` : ''}`
  if (h >= 1) return `${h} Std.${min % 60 ? ` ${min % 60} Min.` : ''}`
  return `${Math.max(1, min)} Min.`
}

/** Platz-ID wie A-81 aus einer Eingabe („a 81“, „A81“, „A-81“) */
export function normaliseSeat(input: string) {
  const m = /^\s*([a-z]{1,2})\s*-?\s*(\d{1,4})\s*$/i.exec(input)
  return m ? `${m[1]!.toUpperCase()}-${Number(m[2])}` : null
}
