import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm'
import { formatEventRange } from '#shared/utils/eventTime'
import { countdown, deadlineMs } from '#shared/utils/registration'
import { CODE_MASK, moveMessageObsolete, renderMessage, type MessageVars } from '#shared/utils/messageText'

/**
 * Direktnachrichten über den Bot, als Warteschlange in der Datenbank (message_deliveries).
 * Ein Arbeiter im Prozess schickt eine nach der anderen mit Pause dazwischen, damit wir
 * unter den Discord-Rate-Limits bleiben; 429-Antworten fängt discordApi ab, vorübergehende
 * Fehler werden später erneut versucht. Platzhalter werden erst beim Senden eingesetzt, damit z. B.
 * {platz} aktuell ist. Was sich bis dahin erledigt hat (Erinnerung an jemanden, der schon zugesagt hat),
 * wird nicht mehr geschickt („entfallen“). Der Buchungscode steht nie im gespeicherten Text.
 */

const PAUSE_MS = 1100
/** Automatische Umsetzungs-Nachrichten warten kurz, damit mehrfaches Umsetzen nur eine Nachricht auslöst */
const MOVE_DELAY_MS = 60_000
/** vorübergehende Fehler (Rate-Limit, Discord gestört): so oft insgesamt versuchen, mit wachsender Pause */
const MAX_ATTEMPTS = 3
const RETRY_MS = 5 * 60_000

export type AutoKind = 'registrierung' | 'umsetzung' | 'erinnerung_offen' | 'erinnerung_platz' | 'erinnerung_buchung'
  | 'buchung' | 'absage_kontakt' | 'angebot' | 'nachgerueckt_kontakt' | 'bereich'
export type MessageKind = 'manuell' | AutoKind
export interface AutoSetting { enabled: boolean, body: string }
export type MessageSettings = Record<AutoKind, AutoSetting>

/** Nachrichten, die den Buchungscode enthalten dürfen */
const CODE_KINDS: MessageKind[] = ['buchung', 'erinnerung_buchung']
/** Erinnerungen: kommen nicht bei Personen, die sie abbestellt haben */
export const REMINDER_KINDS: MessageKind[] = ['erinnerung_offen', 'erinnerung_platz', 'erinnerung_buchung']

export const MESSAGE_KINDS: Record<AutoKind, string> = {
  registrierung: 'Bei Zusage (Info-Nachricht)',
  umsetzung: 'Bei Umsetzung durch andere',
  erinnerung_offen: 'Erinnerung an Offene vor dem Ende der Bedarfsabfrage',
  erinnerung_platz: 'Erinnerung an Zugesagte ohne Platz',
  erinnerung_buchung: 'Erinnerung an Zugesagte, die noch nicht gebucht haben',
  buchung: 'Buchung freigegeben (mit Buchungscode)',
  absage_kontakt: 'An die Kontaktperson bei einer Absage',
  angebot: 'Platzangebot an die Warteliste',
  nachgerueckt_kontakt: 'An die Kontaktperson, wenn jemand nachrückt',
  bereich: 'Platz außerhalb des gemeldeten Bereichs',
}

const DEFAULT_SETTINGS: MessageSettings = {
  registrierung: { enabled: true, body: 'Hallo {nick}, danke für deine Zusage zu {event} ({datum})! Deine Kontaktperson ist {kontakt}. Dein Platz: {platz}. Ändern kannst du alles über die Anmeldung mit Discord hier: {link}' },
  umsetzung: { enabled: true, body: 'Hallo {nick}, du wurdest für {event} auf Platz {platz} gesetzt.' },
  erinnerung_offen: { enabled: true, body: 'Hallo {nick}, bist du bei {event} ({datum}) dabei? Die Bedarfsabfrage läuft noch bis {frist} ({countdown}). Sag einfach hier mit den Knöpfen zu oder ab – oder auf {link}' },
  erinnerung_platz: { enabled: true, body: 'Hallo {nick}, du hast für {event} zugesagt, aber noch keinen Platz gewählt. Such dir bis {platz_bis} einen aus: {link}' },
  erinnerung_buchung: { enabled: true, body: 'Hallo {nick}, du hast für {event} noch nicht gebucht. Buche bitte bis {buchen_bis} Platz {platz} mit dem Code {code}: {buchungslink} – und sag hier mit dem Knopf Bescheid, wenn du gebucht hast.' },
  buchung: { enabled: true, body: 'Hallo {nick}, die Buchung für {event} ist offen! Buche bitte Platz {platz} bis {buchen_bis} im Buchungstool des Veranstalters: {buchungslink}\nUnser Buchungscode: {code}\nDer Code ist nur für dich, bitte nicht weitergeben. Sag hier mit dem Knopf Bescheid, wenn du gebucht hast.' },
  absage_kontakt: { enabled: true, body: 'Hallo {kontakt}, {nick} hat für {event} abgesagt. Platz {platz} ist wieder frei.' },
  angebot: { enabled: true, body: 'Hallo {nick}, bei {event} ist ein Platz frei geworden. Willst du dabei sein? Bitte bis {angebot_bis} mit den Knöpfen annehmen oder ablehnen, danach geht er an den Nächsten auf der Warteliste. Nach dem Annehmen suchst du dir hier einen freien Platz aus: {link}' },
  nachgerueckt_kontakt: { enabled: true, body: 'Hallo {kontakt}, {nick} ist für {event} von der Warteliste nachgerückt und sucht sich jetzt einen Platz aus.' },
  bereich: { enabled: true, body: 'Hallo {nick}, für {event} steht jetzt fest, in welchem Bereich wir sitzen. Dein bisheriger Platz {platz} liegt leider außerhalb – such dir bitte im Planner einen freien Platz im Bereich aus: {link}' },
}

/** frühere Standardtexte: wer sie unverändert gespeichert hat, bekommt den neuen Standard (Angebote nennen keinen Platz mehr) */
const OLD_DEFAULTS: Partial<Record<AutoKind, string[]>> = {
  angebot: ['Hallo {nick}, bei {event} ist ein Platz frei geworden: {platz}. Willst du ihn? Bitte bis {angebot_bis} mit den Knöpfen annehmen oder ablehnen, danach geht er an den Nächsten auf der Warteliste.'],
  nachgerueckt_kontakt: ['Hallo {kontakt}, {nick} ist für {event} von der Warteliste nachgerückt (Platz {platz}).'],
}

export function getMessageSettings(): MessageSettings {
  const row = useDb().select().from(tables.settings).where(eq(tables.settings.key, 'messages')).get()
  const saved = row ? JSON.parse(row.value) as Partial<MessageSettings> : {}
  return Object.fromEntries((Object.keys(DEFAULT_SETTINGS) as AutoKind[]).map((k) => {
    const s = { ...DEFAULT_SETTINGS[k], ...saved[k] }
    if (OLD_DEFAULTS[k]?.includes(s.body)) s.body = DEFAULT_SETTINGS[k].body
    return [k, s]
  })) as MessageSettings
}

export function saveMessageSettings(s: Partial<MessageSettings>) {
  const value = JSON.stringify({ ...getMessageSettings(), ...s })
  useDb().insert(tables.settings).values({ key: 'messages', value })
    .onConflictDoUpdate({ target: tables.settings.key, set: { value } }).run()
}

type Db = ReturnType<typeof useDb>
type Q = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

interface Recipient { id: number, discordId: string | null, nick: string }

/** Legt eine Rundnachricht an; Leute ohne Discord-ID landen gleich als Fehler in der Liste */
export function queueBatch(eventId: number, createdBy: string, target: string, body: string, recipients: Recipient[]) {
  const now = new Date()
  const batchId = useDb().transaction((tx) => {
    const batch = tx.insert(tables.messageBatches).values({ eventId, createdAt: now, createdBy, target, body }).returning({ id: tables.messageBatches.id }).get()
    for (const r of recipients) {
      tx.insert(tables.messageDeliveries).values({
        batchId: batch.id, eventId, kind: 'manuell', body, registrationId: r.id, discordId: r.discordId, nick: r.nick,
        status: r.discordId ? 'wartet' : 'fehler', error: r.discordId ? null : 'Keine Discord-ID (aus dem Import).',
        sendAfter: now, createdAt: now,
      }).run()
    }
    return batch.id
  })
  kickMessageWorker()
  return batchId
}

export interface QueueInput {
  kind: AutoKind
  registrationId: number
  /** Empfänger, wenn nicht die Person der Teilnahme (z. B. ihre Kontaktperson) */
  to?: { discordId: string, nick: string }
  /** schon beim Einreihen einsetzen, z. B. der frei gewordene Platz bei einer Absage */
  vars?: MessageVars
  components?: unknown[]
  /** höchstens eine Nachricht je Schlüssel, auch nach einem Neustart */
  dedupeKey?: string
  sendAfter?: Date
  /** auch senden, wenn die Art in /orga ausgeschaltet ist (Knopf „Jetzt erinnern“) */
  force?: boolean
  /** Umsetzung: Platz vor der Änderung (siehe obsolete) */
  prevSeat?: string | null
}

/**
 * Reiht eine automatische Nachricht ein (in q, also auch innerhalb einer Transaktion); den Arbeiter danach
 * mit kickMessageWorker() anstoßen. Gibt zurück, ob etwas in die Warteschlange kam.
 */
export function queueMessage(q: Q, m: QueueInput) {
  const setting = getMessageSettings()[m.kind]
  if (!setting.enabled && !m.force) return false
  const reg = findRegistrationById(q, m.registrationId)
  if (!reg) return false
  const to = m.to ?? (reg.discordId ? { discordId: reg.discordId, nick: reg.nick } : null)
  if (!to) return false
  const now = new Date()
  const inserted = q.insert(tables.messageDeliveries).values({
    eventId: reg.eventId, kind: m.kind, body: m.vars ? renderMessage(setting.body, m.vars) : setting.body, registrationId: reg.id,
    discordId: to.discordId, nick: to.nick, status: 'wartet', sendAfter: m.sendAfter ?? now, createdAt: now,
    dedupeKey: m.dedupeKey ?? null, components: m.components?.length ? JSON.stringify(m.components) : null, prevSeat: m.prevSeat ?? null,
  }).onConflictDoNothing().returning({ id: tables.messageDeliveries.id }).get()
  return !!inserted
}

/**
 * Automatische Nachricht bei Zusage (Info-Nachricht) bzw. Umsetzung, wenn in /orga eingeschaltet.
 * force: trotzdem senden (Info-Nachricht per Knopf nachsenden); prevSeat: Platz vor der Umsetzung.
 * Gibt zurück, ob etwas in die Warteschlange kam.
 */
export function queueAutoMessage(kind: 'registrierung' | 'umsetzung', registrationId: number, force = false, prevSeat: string | null = null) {
  const setting = getMessageSettings()[kind]
  if (!setting.enabled && !force) return false
  const db = useDb()
  if (kind === 'umsetzung') {
    // noch nicht verschickte Umsetzungs-Nachricht für dieselbe Person: nur nach hinten schieben (der Platz von vorher bleibt)
    const D = tables.messageDeliveries
    const sendAfter = new Date(Date.now() + MOVE_DELAY_MS)
    const pending = db.select({ id: D.id }).from(D)
      .where(and(eq(D.registrationId, registrationId), eq(D.kind, 'umsetzung'), eq(D.status, 'wartet'))).get()
    if (pending) {
      db.update(D).set({ sendAfter, body: setting.body }).where(eq(D.id, pending.id)).run()
      return true
    }
    if (!queueMessage(db, { kind, registrationId, sendAfter, force, prevSeat })) return false
  }
  else if (!queueMessage(db, { kind, registrationId, components: seatLinkButtons(), force })) return false
  kickMessageWorker()
  return true
}

/** Stand der Info-Nachricht je Teilnahme: gesendet, wartet, fehler oder nichts (jeweils die neueste) */
export function infoMessageStatus(eventId: number) {
  const map = new Map<number, DeliveryState>()
  for (const [id, kinds] of deliveryStatus(eventId, ['registrierung'])) if (kinds.registrierung) map.set(id, kinds.registrierung)
  return map
}

/** Teilnahmen, bei denen in diesem Event schon mindestens eine Nachricht an die Person selbst angekommen ist */
export function contactedRegistrations(eventId: number) {
  const D = tables.messageDeliveries
  const R = tables.registrations
  const rows = useDb().select({ id: D.registrationId, to: D.discordId, own: tables.persons.discordId })
    .from(D)
    .innerJoin(R, eq(R.id, D.registrationId))
    .innerJoin(tables.persons, eq(tables.persons.id, R.personId))
    .where(and(eq(D.eventId, eventId), eq(D.status, 'gesendet'))).all()
  return new Set(rows.filter(r => r.id && (!r.to || !r.own || r.to === r.own)).map(r => r.id!))
}

export interface DeliveryState { status: 'wartet' | 'gesendet' | 'fehler' | 'entfallen', error: string | null, at: Date | null }

/** Je Teilnahme und Art die neueste Nachricht an die Person selbst (nicht an ihre Kontaktperson) */
export function deliveryStatus<K extends MessageKind>(eventId: number, kinds: K[]) {
  const D = tables.messageDeliveries
  const R = tables.registrations
  const rows = useDb().select({ registrationId: D.registrationId, kind: D.kind, status: D.status, error: D.error, at: D.sentAt, to: D.discordId, own: tables.persons.discordId })
    .from(D)
    .innerJoin(R, eq(R.id, D.registrationId))
    .innerJoin(tables.persons, eq(tables.persons.id, R.personId))
    .where(and(eq(D.eventId, eventId), inArray(D.kind, kinds))).orderBy(asc(D.id)).all()
  const map = new Map<number, Partial<Record<K, DeliveryState>>>()
  for (const r of rows) {
    if (!r.registrationId || (r.to && r.own && r.to !== r.own)) continue
    const entry: Partial<Record<K, DeliveryState>> = map.get(r.registrationId) ?? {}
    entry[r.kind as K] = { status: r.status, error: r.error, at: r.at }
    map.set(r.registrationId, entry)
  }
  return map
}

/** Adresse der App für {link}: NUXT_APP_URL oder https://<DOMAIN>/ aus der .env (lokal localhost) */
export function appUrl() {
  const configured = String(useRuntimeConfig().appUrl || '').trim()
  if (configured) return configured.endsWith('/') ? configured : configured + '/'
  return process.env.DOMAIN ? `https://${process.env.DOMAIN}/` : 'http://localhost:3000/'
}

/** Fristen lesbar: „Fr 20.11.2026, 18:00“ */
export function formatDeadline(local: string) {
  return local ? formatEventRange(local, '') : 'noch offen'
}

/** Platzhalter für eine Teilnahme (aktueller Stand); den Buchungscode nur, wenn withCode */
export function messageVars(reg: { id: number, nick: string, seat: string | null, contactId: number | null, eventId: number }, withCode = false): MessageVars {
  const db = useDb()
  const ev = db.select().from(tables.events).where(eq(tables.events.id, reg.eventId)).get()
  const contact = reg.contactId ? db.select().from(tables.contacts).where(eq(tables.contacts.id, reg.contactId)).get() : null
  const O = tables.waitlistOffers
  const offer = db.select().from(O).where(and(eq(O.registrationId, reg.id), eq(O.status, 'offen'))).orderBy(desc(O.id)).get()
  return {
    nick: reg.nick,
    platz: reg.seat ?? offer?.seat ?? 'noch keiner',
    event: ev?.name ?? '',
    datum: ev ? formatEventRange(ev.startsAt, ev.endsAt) : '',
    kontakt: contact?.nick ?? 'die Orga',
    link: appUrl(),
    frist: ev ? formatDeadline(ev.demandUntil) : '',
    platz_bis: ev ? formatDeadline(ev.bookingFrom) : '',
    countdown: ev ? countdown(deadlineMs(ev.demandUntil), new Date()) || 'ohne Frist' : '',
    buchungslink: ev?.bookingUrl || appUrl(),
    buchen_bis: ev ? formatDeadline(ev.bookingUntil) : '',
    angebot_bis: offer ? offer.expiresAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
    code: withCode && ev?.bookingCode ? ev.bookingCode : CODE_MASK,
  }
}

/**
 * Hat sich die Nachricht erledigt, bevor sie rausging? z. B. Erinnerung an jemanden, der inzwischen zugesagt hat,
 * oder ein Angebot, das schon abgelaufen ist. Gibt den Grund zurück oder null.
 */
function obsolete(kind: MessageKind, reg: NonNullable<ReturnType<typeof findRegistrationById>>, prevSeat: string | null) {
  if (REMINDER_KINDS.includes(kind) && reg.remindersOff) return 'Erinnerungen abbestellt.'
  if (kind === 'umsetzung') return moveMessageObsolete(reg.status, reg.seat, prevSeat)
  if (kind === 'erinnerung_offen' && (reg.status !== 'offen' || reg.waitlistAt)) return 'Hat inzwischen geantwortet.'
  if (kind === 'erinnerung_platz' && (reg.status !== 'zugesagt' || reg.seat)) return 'Hat inzwischen einen Platz.'
  if ((kind === 'erinnerung_buchung' || kind === 'buchung') && reg.status !== 'zugesagt') return 'Nicht mehr zugesagt.'
  if (kind === 'erinnerung_buchung' && reg.booking === 'gebucht') return 'Hat inzwischen gebucht.'
  if (kind === 'angebot') {
    const O = tables.waitlistOffers
    const open = useDb().select({ id: O.id }).from(O).where(and(eq(O.registrationId, reg.id), eq(O.status, 'offen'))).get()
    if (!open) return 'Das Angebot gilt nicht mehr.'
  }
  return null
}

/** Vorübergehend: Rate-Limit, Discord gestört, Netz weg; dann später noch einmal */
function transient(e: unknown) {
  if (e instanceof DiscordError) return e.status === 429 || e.status >= 500
  return e instanceof TypeError
}

let running = false
let timer: ReturnType<typeof setTimeout> | null = null

export function kickMessageWorker() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!running) void runWorker()
}

async function runWorker() {
  running = true
  const db = useDb()
  const D = tables.messageDeliveries
  try {
    for (;;) {
      const next = db.select().from(D).where(and(eq(D.status, 'wartet'), lte(D.sendAfter, new Date())))
        .orderBy(asc(D.sendAfter), asc(D.id)).limit(1).get()
      if (!next) break
      const reg = next.registrationId ? findRegistrationById(db, next.registrationId) : null
      if (!reg && next.kind !== 'manuell') {
        db.update(D).set({ status: 'fehler', error: 'Die Registrierung gibt es nicht mehr.' }).where(eq(D.id, next.id)).run()
        continue
      }
      const skip = reg ? obsolete(next.kind, reg, next.prevSeat) : null
      if (skip) {
        db.update(D).set({ status: 'entfallen', error: skip }).where(eq(D.id, next.id)).run()
        continue
      }
      const withCode = CODE_KINDS.includes(next.kind)
      const vars = reg ? messageVars(reg, withCode) : { nick: next.nick, platz: '–', event: '', datum: '', kontakt: 'die Orga', link: appUrl() }
      if (next.kind === 'manuell') vars.code = CODE_MASK
      const text = renderMessage(next.body, vars)
      // gespeichert wird der Text immer ohne Buchungscode
      const stored = withCode ? renderMessage(next.body, { ...vars, code: CODE_MASK }) : text
      const components = next.components ? JSON.parse(next.components) as unknown[] : undefined
      // QA-Umgebung: Demo-Personen gibt es auf Discord nicht; die Nachricht gilt als zugestellt und ist in /orga zu lesen
      if (isDemoId(next.discordId ?? '')) {
        db.update(D).set({ status: 'gesendet', text: stored, sentAt: new Date(), error: null }).where(eq(D.id, next.id)).run()
        continue
      }
      try {
        await sendDirectMessage(next.discordId!, text, components)
        db.update(D).set({ status: 'gesendet', text: stored, sentAt: new Date(), error: null }).where(eq(D.id, next.id)).run()
      }
      catch (e) {
        const error = e instanceof Error ? (e as { statusMessage?: string }).statusMessage || e.message : String(e)
        const attempts = next.attempts + 1
        if (transient(e) && attempts < MAX_ATTEMPTS) {
          db.update(D).set({ attempts, error, sendAfter: new Date(Date.now() + RETRY_MS * attempts) }).where(eq(D.id, next.id)).run()
        }
        else {
          db.update(D).set({ status: 'fehler', text: stored, error, attempts }).where(eq(D.id, next.id)).run()
        }
      }
      await new Promise(r => setTimeout(r, PAUSE_MS))
    }
  }
  catch (e) {
    console.error('[nachrichten] Arbeiter abgebrochen:', e)
  }
  finally {
    running = false
    scheduleNext()
  }
}

/** Nächste verzögerte Nachricht (z. B. Umsetzung in 60 s) einplanen */
function scheduleNext() {
  const D = tables.messageDeliveries
  const next = useDb().select({ sendAfter: D.sendAfter }).from(D).where(eq(D.status, 'wartet'))
    .orderBy(asc(D.sendAfter)).limit(1).get()
  if (!next) return
  const wait = Math.max(1000, next.sendAfter.getTime() - Date.now())
  timer = setTimeout(() => {
    timer = null
    kickMessageWorker()
  }, Math.min(wait, 2_147_000_000))
}
