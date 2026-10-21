import { and, eq } from 'drizzle-orm'
import { reachOf, stageOf } from '#shared/utils/participantStage'
import { OVERVIEW_FILTERS, peopleOverview, type OverviewFilter, type OverviewPerson } from '#shared/utils/peopleOverview'
import type { CommandInteraction, DiscordCommand } from './discordCommands'

/**
 * /leute: Kontaktpersonen sehen, wie weit ihre Leute im aktuellen Event sind (zugesagt, Platz, gebucht, Freigabe),
 * die Orga sieht alle oder die Leute einer Kontaktperson. Antwort nur für den Aufrufer sichtbar.
 * Die Stände sind dieselben wie in /orga › Teilnehmer (shared/utils/participantStage.ts).
 */

const STRING = 3

/** Wer fragt: seine Kontaktperson-Zeile (falls eine) und ob er Orga ist */
async function caller(userId: string) {
  const contact = useDb().select().from(tables.contacts).where(eq(tables.contacts.discordId, userId)).get() ?? null
  return { contact, leader: await isLeader(userId) }
}

/** Alle Personen mit ihrem Stand im aktuellen Event, wie /orga › Teilnehmer; abgelehnte fallen weg */
function loadPeople(eventId: number, bookingReleased: boolean) {
  const db = useDb()
  const regs = new Map(loadRegistrations(db, eventId).map(r => [r.personId, r]))
  const messages = deliveryStatus(eventId, ['registrierung', 'erinnerung_offen', 'manuell', 'buchung', 'angebot'])
  const contacted = contactedRegistrations(eventId)
  const O = tables.waitlistOffers
  const offers = new Set(db.select({ id: O.registrationId }).from(O).where(and(eq(O.eventId, eventId), eq(O.status, 'offen'))).all().map(o => o.id))
  return db.select().from(tables.persons).all()
    .filter(p => p.approval !== 'abgelehnt')
    .map((p) => {
      const reg = regs.get(p.id)
      const stage = stageOf({ registered: !!reg, status: reg?.status, seat: reg?.seat, booking: reg?.booking, waitlist: !!reg?.waitlistAt, contacted: reg ? contacted.has(reg.id) : false })
      const person: OverviewPerson & { contactId: number | null } = {
        nick: p.nick,
        contactId: p.contactId,
        stage,
        reach: reachOf({ stage, discord: !!p.discordId, messages: (reg && messages.get(reg.id)) || {}, bookingReleased, offer: !!reg && offers.has(reg.id) }),
        seat: reg?.bookedSeat ?? reg?.seat ?? null,
        approvalPending: p.approval === 'wartet',
      }
      return person
    })
}

async function handle(it: CommandInteraction) {
  const { values, focused } = commandArgs(it.data)
  const who = await caller(it.userId)

  // Autovervollständigung für „kontakt“: nur die Orga darf andere Kontaktpersonen ansehen
  if (it.type === 4) {
    if (focused !== 'kontakt' || !who.leader) return commandChoices([])
    const needle = String(values.kontakt ?? '').toLocaleLowerCase('de')
    const contacts = useDb().select({ id: tables.contacts.id, nick: tables.contacts.nick }).from(tables.contacts).all()
      .filter(c => c.nick.toLocaleLowerCase('de').includes(needle))
      .sort((a, b) => a.nick.localeCompare(b.nick, 'de'))
    return commandChoices([{ name: 'alle', value: 'alle' }, { name: 'ohne Kontaktperson', value: 'ohne' }, ...contacts.map(c => ({ name: c.nick, value: String(c.id) }))])
  }

  if (!who.contact && !who.leader) return commandReply('Das können nur Kontaktpersonen und die Orga abrufen.')
  const ev = currentEvent()
  if (!ev) return commandReply('Gerade ist kein Event aktiv.')

  // Standard: Kontaktpersonen ihre eigenen Leute, die Orga alle
  const asked = values.kontakt === undefined ? null : String(values.kontakt)
  if (asked !== null && !who.leader) return commandReply('Die Leute anderer Kontaktpersonen sieht nur die Orga. Lass „kontakt“ einfach weg.')
  const scope = asked ?? (who.contact ? String(who.contact.id) : 'alle')
  let title = 'Alle'
  let contactId: number | null | undefined
  if (scope === 'ohne') {
    title = 'Ohne Kontaktperson'
    contactId = null
  }
  else if (scope !== 'alle') {
    const c = useDb().select().from(tables.contacts).where(eq(tables.contacts.id, Number(scope))).get()
    if (!c) return commandReply('Diese Kontaktperson kenne ich nicht. Wähl eine aus der Liste.')
    contactId = c.id
    title = c.discordId === it.userId ? 'Deine Leute' : `Leute von ${c.nick}`
  }

  const filter = (OVERVIEW_FILTERS.some(f => f.value === values.zeige) ? values.zeige : 'offen') as OverviewFilter
  const people = loadPeople(ev.id, !!ev.bookingReleasedAt).filter(p => contactId === undefined || p.contactId === contactId)
  const text = peopleOverview(people, {
    title,
    eventName: ev.name,
    filter,
    bookingReleased: !!ev.bookingReleasedAt,
    link: who.leader ? `${appUrl()}orga/teilnehmer` : null,
  })
  return { type: 4, data: { content: text, flags: 64, allowed_mentions: { parse: [] } } }
}

export const leuteCommand: DiscordCommand = {
  name: 'leute',
  description: 'Wie weit deine Leute im aktuellen Event sind (nur für dich sichtbar)',
  options: [
    { type: STRING, name: 'zeige', description: 'Was du sehen willst (Standard: was noch fehlt)', required: false, choices: OVERVIEW_FILTERS.map(f => ({ name: f.label, value: f.value })) },
    { type: STRING, name: 'kontakt', description: 'Nur Orga: Leute dieser Kontaktperson (Standard: deine bzw. alle)', required: false, autocomplete: true },
  ],
  handle,
}
