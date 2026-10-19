import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/** Wer sich per Discord angemeldet hat: nur ID, Benutzername und Anzeigename, keine E-Mail */
export const users = sqliteTable('users', {
  discordId: text('discord_id').primaryKey(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  /** Avatar-Hash von Discord beim letzten Login (das Bild liegt unter <uploadDir>/avatars/) */
  avatar: text('avatar'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }).notNull(),
})

/**
 * Speicher für Module (layers/*): JSON-Dokumente unter „sammlung/dokument“, z. B. plan/config oder images/<id>.
 * data ist JSON; null heißt gelöscht (damit andere offene Seiten das mitbekommen).
 * rev wächst mit jeder Änderung, darüber holt sich ein Modul, was neu ist.
 */
export const docs = sqliteTable('docs', {
  path: text('path').primaryKey(),
  data: text('data'),
  rev: integer('rev').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, t => [index('docs_rev_idx').on(t.rev)])

/** Hochgeladene Bilder der Module; die Datei liegt unter <uploadDir>/<id> */
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Sitzplan (nach dem Vorbild von d3molite/Seat-Planner, MIT-Lizenz, © Tobias Brinke) ──

/** Ein Event pro Jahr o. ä.; genau eins ist aktuell (is_current) und erscheint öffentlich unter / */
export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  /** Starttag JJJJ-MM-TT (aus starts_at abgeleitet, zum Sortieren) */
  date: text('date').notNull(),
  /** Beginn und Ende als Ortszeit Europe/Berlin, JJJJ-MM-TTTHH:mm (wie <input type="datetime-local">) */
  startsAt: text('starts_at').notNull().default(''),
  endsAt: text('ends_at').notNull().default(''),
  location: text('location').notNull().default(''),
  description: text('description').notNull().default(''),
  /** Discord-Event (Scheduled Event), das aus diesem Event erzeugt wurde */
  discordEventId: text('discord_event_id'),
  /** Ankündigung in #organisation (Kanal und Nachricht) und der private Thread dazu */
  announceChannelId: text('announce_channel_id'),
  announceMessageId: text('announce_message_id'),
  discordThreadId: text('discord_thread_id'),
  /** Bedarfsabfrage läuft; aus = vorzeitig geschlossen (die Frist demand_until gilt zusätzlich) */
  registrationOpen: integer('registration_open', { mode: 'boolean' }).notNull().default(false),
  /** wann die Bedarfsabfrage von Hand geschlossen wurde; null = noch nie geöffnet oder wieder offen */
  demandClosedAt: integer('demand_closed_at', { mode: 'timestamp' }),
  /** Fristen als Ortszeit Europe/Berlin wie starts_at; leer = keine */
  demandUntil: text('demand_until').notNull().default(''),
  /** Buchungsstart = Ende der Platzwahl; der Takt gibt die Buchung zu diesem Zeitpunkt automatisch frei */
  bookingFrom: text('booking_from').notNull().default(''),
  bookingUntil: text('booking_until').notNull().default(''),
  /** Buchungscode des Veranstalters: geheim, nur in der eigenen Ansicht von Zugesagten und in deren Nachricht */
  bookingCode: text('booking_code').notNull().default(''),
  bookingUrl: text('booking_url').notNull().default(''),
  bookingReleasedAt: integer('booking_released_at', { mode: 'timestamp' }),
  /** Erinnerungen so viele Tage vor dem Ende der Bedarfsabfrage bzw. vor „Buchen bis“ (JSON-Zahlenliste) */
  remindDays: text('remind_days').notNull().default('[14,7,2]'),
  bookingRemindDays: text('booking_remind_days').notNull().default('[7,2]'),
  /** Warteliste: so lange gilt ein Platzangebot; aus = nur von Hand nachrücken */
  offerHours: integer('offer_hours').notNull().default(48),
  waitlistAuto: integer('waitlist_auto', { mode: 'boolean' }).notNull().default(true),
  /** höchstens so viele Zusagen, danach Warteliste; null = ohne Grenze */
  maxParticipants: integer('max_participants'),
  /** dem Veranstalter gemeldeter Bereich (JSON-Liste von Sitz-IDs); fixiert = nur noch dort Plätze, so viele Zusagen wie Plätze */
  area: text('area'),
  areaFixedAt: integer('area_fixed_at', { mode: 'timestamp' }),
  isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/** Reihe A ab Platz 81 = A-81 … A-120 (40 Plätze, je zwei an einem Tisch) */
export const seatRows = sqliteTable('seat_rows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  letter: text('letter').notNull(),
  start: integer('start').notNull(),
  /** Teppich: none, front (vorn), back (hinten), both (beidseitig) */
  carpet: text('carpet', { enum: ['none', 'front', 'back', 'both'] }).notNull().default('none'),
  position: integer('position').notNull().default(0),
}, t => [uniqueIndex('seat_rows_event_letter').on(t.eventId, t.letter)])

/** Kontaktpersonen bleiben über alle Events bestehen; nur der Projektleiter legt sie an */
export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  discordId: text('discord_id').notNull().unique(),
  discordName: text('discord_name').notNull(),
  nick: text('nick').notNull(),
  color: text('color').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/**
 * Personen bleiben über alle Events bestehen (Nick, Discord, Kontaktperson).
 * discord_id fehlt nur bei Leuten aus dem Import des Original-Seat-Planners.
 * Der Nick ist ohne Groß-/Kleinschreibung eindeutig (geprüft in nickTaken).
 */
export const persons = sqliteTable('persons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  discordId: text('discord_id').unique(),
  discordName: text('discord_name'),
  nick: text('nick').notNull(),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  /** Avatar-Hash von Discord; das Bild liegt unter <uploadDir>/avatars/<discord_id>.png */
  avatar: text('avatar'),
  /** keine Erinnerungen mehr (Absage-, Angebots- und Buchungsnachrichten kommen trotzdem) */
  remindersOff: integer('reminders_off', { mode: 'boolean' }).notNull().default(false),
  /**
   * Freigabe: „frei“ (Standard, auch alle, die die Orga anlegt), „wartet“ (hat sich selbst gemeldet, ohne Clan-Rolle;
   * die Kontaktperson oder die Orga muss annehmen), „abgelehnt“. Siehe server/utils/freigabe.ts.
   */
  approval: text('approval', { enum: ['frei', 'wartet', 'abgelehnt'] }).notNull().default('frei'),
  approvalAt: integer('approval_at', { mode: 'timestamp' }),
  /** wer freigegeben oder abgelehnt hat (Name) */
  approvalBy: text('approval_by'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

/**
 * Teilnahme einer Person an einem Event mit Status offen, zugesagt oder abgesagt, dazu Platz und Buchung.
 * seat ist die linke bzw. einzige Sitz-ID; double belegt zusätzlich den rechten Platz am Tisch.
 * Nur Zugesagte haben einen Platz. waitlist_at gesetzt = steht auf der Warteliste.
 */
export const registrations = sqliteTable('registrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  personId: integer('person_id').notNull().references(() => persons.id, { onDelete: 'cascade' }),
  seat: text('seat'),
  double: integer('double', { mode: 'boolean' }).notNull().default(false),
  /** bestehende Zeilen waren Zusagen */
  status: text('status', { enum: ['offen', 'zugesagt', 'abgesagt'] }).notNull().default('zugesagt'),
  statusAt: integer('status_at', { mode: 'timestamp' }),
  /** Buchung beim Veranstalter: gebucht mit dem tatsächlich gebuchten Platz */
  booking: text('booking', { enum: ['offen', 'gebucht'] }).notNull().default('offen'),
  bookedSeat: text('booked_seat'),
  bookedAt: integer('booked_at', { mode: 'timestamp' }),
  bookedBy: text('booked_by'),
  waitlistAt: integer('waitlist_at', { mode: 'timestamp' }),
  /** Reihenfolge auf der Warteliste, in /orga änderbar; gleich = nach waitlist_at */
  waitlistRank: integer('waitlist_rank'),
  /** nach dem Nachrücken einmal gegen einen anderen freien Platz tauschen, auch nach der Platzwahl */
  swapLeft: integer('swap_left', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, t => [
  uniqueIndex('registrations_event_person').on(t.eventId, t.personId),
  uniqueIndex('registrations_event_seat').on(t.eventId, t.seat),
])

/**
 * Platzangebot an den Ersten der Warteliste. Solange es offen ist, gilt der Platz als belegt.
 * seat leer = Teilnahme ohne festen Platz (der frei gewordene hatte keinen).
 */
export const waitlistOffers = sqliteTable('waitlist_offers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  registrationId: integer('registration_id').notNull().references(() => registrations.id, { onDelete: 'cascade' }),
  seat: text('seat'),
  status: text('status', { enum: ['offen', 'angenommen', 'abgelehnt', 'abgelaufen', 'zurückgezogen'] }).notNull().default('offen'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  answeredAt: integer('answered_at', { mode: 'timestamp' }),
}, t => [index('waitlist_offers_event_status').on(t.eventId, t.status)])

/** Protokoll: wer hat wann wen auf welchen Platz gesetzt (und Registrierungen, Löschungen …) */
export const seatLog = sqliteTable('seat_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  at: integer('at', { mode: 'timestamp' }).notNull(),
  actorDiscordId: text('actor_discord_id'),
  actorName: text('actor_name').notNull(),
  action: text('action').notNull(),
  registrationId: integer('registration_id'),
  nick: text('nick'),
  fromSeat: text('from_seat'),
  toSeat: text('to_seat'),
  detail: text('detail'),
}, t => [index('seat_log_event_idx').on(t.eventId, t.at)])

/** Eine Rundnachricht aus /orga (an eine Person, die Leute einer Kontaktperson oder alle) */
export const messageBatches = sqliteTable('message_batches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  createdBy: text('created_by').notNull(),
  target: text('target').notNull(),
  body: text('body').notNull(),
})

/**
 * Jede einzelne Direktnachricht, auch die automatischen (batch_id leer).
 * body ist die Vorlage mit Platzhaltern; text ist, was beim Senden wirklich herauskam.
 */
export const messageDeliveries = sqliteTable('message_deliveries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  batchId: integer('batch_id').references(() => messageBatches.id, { onDelete: 'cascade' }),
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['manuell', 'registrierung', 'umsetzung', 'erinnerung_offen', 'erinnerung_platz', 'erinnerung_buchung',
    'buchung', 'absage_kontakt', 'angebot', 'nachgerueckt_kontakt', 'bereich'] }).notNull(),
  body: text('body').notNull(),
  text: text('text'),
  registrationId: integer('registration_id').references(() => registrations.id, { onDelete: 'set null' }),
  discordId: text('discord_id'),
  nick: text('nick').notNull(),
  status: text('status', { enum: ['wartet', 'gesendet', 'fehler', 'entfallen'] }).notNull(),
  error: text('error'),
  sendAfter: integer('send_after', { mode: 'timestamp' }).notNull(),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  /** höchstens eine Nachricht je Schlüssel, z. B. offen:<event>:<teilnahme>:14 (auch nach einem Neustart) */
  dedupeKey: text('dedupe_key'),
  /** Discord-Buttons als JSON (Action Rows) */
  components: text('components'),
  /** Umsetzung: Platz vor der ersten Änderung; steht die Person beim Versand wieder dort, entfällt die Nachricht */
  prevSeat: text('prev_seat'),
  /** fehlgeschlagene Versuche bei vorübergehenden Fehlern */
  attempts: integer('attempts').notNull().default(0),
}, t => [
  index('message_deliveries_status_idx').on(t.status, t.sendAfter),
  uniqueIndex('message_deliveries_dedupe').on(t.dedupeKey),
])

/** Vorlagen für Nachrichten, mit Platzhaltern {nick}, {platz}, {event}, {datum}, {kontakt}, {link} */
export const messageTemplates = sqliteTable('message_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  body: text('body').notNull(),
})

/** Einstellungen als JSON, z. B. automatische Nachrichten */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
