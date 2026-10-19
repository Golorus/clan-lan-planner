/**
 * Demo-Betrieb für die QA-Umgebung (NUXT_PUBLIC_DEMO=true, deploy/qa/): ausgedachte Daten beim ersten Start,
 * Anmelden als Demo-Person ohne Discord (/auth/demo), Demo-Personen gelten ohne Bot als Server-Mitglieder.
 * Echte Discord-Konten verhalten sich wie in der Live-App (mit dem Test-Bot aus der QA-.env).
 */
export function demoMode() {
  const v = useRuntimeConfig().public.demo as unknown
  return v === true || v === 'true' || v === '1'
}

/** Discord-Prüfungen dürfen ohne Bot durchgehen: lokal (npm run dev) und im Demo-Betrieb */
export function botOptional() {
  return import.meta.dev || demoMode()
}

/** Feste Discord-IDs der Demo-Personen; echte IDs sind kürzer oder anders, Discord vergibt nie 99…-IDs in dieser Länge */
export const DEMO_IDS = {
  orga: '990000000000000001',
  kontakt: '990000000000000002',
  teilnehmer: '990000000000000003',
  neu: '990000000000000004',
} as const
export type DemoPersona = keyof typeof DEMO_IDS

export const DEMO_PERSONAS: Record<DemoPersona, { name: string, text: string }> = {
  orga: { name: 'Demo-Orga', text: 'darf alles, auch /orga' },
  kontakt: { name: 'Demo-Kontakt', text: 'Kontaktperson „Rot“ mit eigenen Leuten' },
  teilnehmer: { name: 'Demo-Teilnehmer', text: 'hat zugesagt und einen Platz' },
  neu: { name: 'Demo-Neu', text: 'unbekannt, muss eine Freigabe anfragen' },
}

export function isDemoId(discordId: string) {
  return demoMode() && /^99\d{16}$/.test(discordId)
}

/**
 * Rollen einer Demo-Person auf dem Server, wie guildMemberRoles: Demo-Neu ist kein Mitglied, bis sie freigegeben ist,
 * alle anderen sind Mitglied (mit Clan-Rolle, falls eingestellt). undefined = keine Demo-Person.
 */
export function demoRoles(discordId: string, approved: boolean, memberRole: string | null): string[] | null | undefined {
  if (!isDemoId(discordId)) return undefined
  if (discordId === DEMO_IDS.neu && !approved) return null
  return memberRole ? [memberRole] : []
}

const NICKS = ['Pixelpirat', 'Lagmonster', 'Respawn', 'Headshot', 'Kaffeebot', 'NoScope', 'Quickload', 'Tankwart',
  'Bugfix', 'Frostbyte', 'Clutch', 'Lootgoblin', 'Speedrun', 'Tilted', 'Ragequit', 'Afkler']

/** Ausgedachte Daten beim ersten Start im Demo-Betrieb (nur wenn es noch kein Event gibt) */
export function seedDemo() {
  const db = useDb()
  if (db.select({ id: tables.events.id }).from(tables.events).get()) return false
  const now = new Date()
  const day = 86_400_000
  const local = (d: number, h = 18) => {
    const t = new Date(now.getTime() + d * day)
    return `${t.toISOString().slice(0, 10)}T${String(h).padStart(2, '0')}:00`
  }
  db.transaction((tx) => {
    const ev = tx.insert(tables.events).values({
      name: 'Demo-LAN', date: local(60).slice(0, 10), startsAt: local(60, 10), endsAt: local(62, 16),
      location: 'Messehalle 2 (Demo)', description: 'Ausgedachtes Event für die QA-Umgebung.',
      registrationOpen: true, demandUntil: local(30), bookingFrom: local(40), bookingUntil: local(50),
      bookingCode: 'DEMO-1234', bookingUrl: 'https://example.org/buchung', maxParticipants: 30,
      isCurrent: true, createdAt: now,
    }).returning({ id: tables.events.id }).get()
    ;[['A', 81], ['B', 1], ['C', 41]].forEach(([letter, start], position) => {
      tx.insert(tables.seatRows).values({ eventId: ev.id, letter: String(letter), start: Number(start), carpet: 'none', position }).run()
    })
    const contact = (discordId: string, nick: string, color: string) => tx.insert(tables.contacts)
      .values({ discordId, discordName: nick.toLowerCase(), nick, color, createdAt: now }).returning({ id: tables.contacts.id }).get().id
    const rot = contact(DEMO_IDS.kontakt, 'Rot', '#e4572e')
    const blau = contact('990000000000000010', 'Blau', '#2e86ab')
    const person = (discordId: string, nick: string, contactId: number, approval: 'frei' | 'wartet' = 'frei') => tx.insert(tables.persons)
      .values({ discordId, discordName: nick.toLowerCase(), nick, contactId, approval, createdAt: now, updatedAt: now })
      .returning({ id: tables.persons.id }).get().id
    const reg = (personId: number, status: 'offen' | 'zugesagt' | 'abgesagt', seat: string | null = null) => tx.insert(tables.registrations)
      .values({ eventId: ev.id, personId, seat, status, statusAt: now, createdAt: now, updatedAt: now }).run()

    reg(person(DEMO_IDS.teilnehmer, 'Demo-Teilnehmer', rot), 'zugesagt', 'A-81')
    NICKS.forEach((nick, i) => {
      const id = person(`9900000000000001${String(i).padStart(2, '0')}`, nick, i % 2 ? blau : rot)
      if (i < 8) reg(id, 'zugesagt', `A-${83 + i}`)
      else if (i < 11) reg(id, 'zugesagt')
      else if (i < 14) reg(id, 'offen')
      else reg(id, 'abgesagt')
    })
    // eine offene Anfrage für die Freigabe-Liste
    person('990000000000000200', 'Unbekannt42', rot, 'wartet')
    writeLog(tx, ev.id, null, { action: 'demo', detail: 'Demo-Daten angelegt' })
  })
  return true
}

/** Demo-Person als Nutzer anlegen (wie beim Discord-Login) */
export function demoUser(persona: DemoPersona) {
  const now = new Date()
  const user = { discordId: DEMO_IDS[persona], username: DEMO_PERSONAS[persona].name.toLowerCase(), displayName: DEMO_PERSONAS[persona].name }
  useDb().insert(tables.users).values({ ...user, createdAt: now, lastLoginAt: now })
    .onConflictDoUpdate({ target: tables.users.discordId, set: { lastLoginAt: now } }).run()
  return user
}
