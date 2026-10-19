import { demandPhase } from '#shared/utils/registration'

type Person = ReturnType<typeof loadRegistrations>[number]

function counts(list: Person[]) {
  const zu = list.filter(r => r.status === 'zugesagt')
  return {
    zugesagt: zu.length,
    abgesagt: list.filter(r => r.status === 'abgesagt').length,
    offen: list.filter(r => r.status === 'offen').length,
    ohnePlatz: zu.filter(r => !r.seat).length,
    warteliste: list.filter(r => r.waitlistAt && r.status !== 'zugesagt').length,
    gebucht: zu.filter(r => r.booking === 'gebucht').length,
    nichtGebucht: zu.filter(r => r.booking !== 'gebucht').length,
    abweichend: zu.filter(r => r.booking === 'gebucht' && r.bookedSeat && r.bookedSeat !== r.seat).length,
  }
}

/**
 * Übersicht zugesagt / abgesagt / offen / ohne Platz und Buchung: für die Orga über alle, gesamt und je Kontaktperson;
 * für Kontaktpersonen über ihre eigenen Leute. Ohne Discord-IDs und ohne Buchungscode.
 */
export default defineEventHandler(async (event) => {
  const actor = await requireTeamActor(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const db = useDb()
  const ev = currentEvent(db)
  if (!ev) return { event: null, isLeader: actor.isLeader, total: null, perContact: [], people: [] }
  const all = loadRegistrations(db, ev.id)
  const mine = actor.isLeader ? all : all.filter(r => r.contactId === actor.contactId)
  const contacts = db.select().from(tables.contacts).all()
    .filter(c => actor.isLeader || c.id === actor.contactId)
    .sort((a, b) => a.nick.localeCompare(b.nick, 'de'))
  return {
    event: { name: ev.name, phase: demandPhase(eventRules(ev), new Date()), demandUntil: ev.demandUntil, bookingReleased: !!ev.bookingReleasedAt, bookingUntil: ev.bookingUntil },
    isLeader: actor.isLeader,
    total: counts(mine),
    perContact: [
      ...contacts.map(c => ({ contactId: c.id, nick: c.nick, color: c.color, counts: counts(mine.filter(r => r.contactId === c.id)) })),
      ...(actor.isLeader ? [{ contactId: null, nick: 'ohne Kontaktperson', color: '#8a8f87', counts: counts(mine.filter(r => !r.contactId)) }] : []),
    ].filter(c => Object.values(c.counts).some(n => n > 0)),
    people: mine.map(r => ({
      id: r.id, nick: r.nick, status: r.status, contactId: r.contactId, seat: r.seat, double: r.double,
      waitlist: !!r.waitlistAt && r.status !== 'zugesagt',
      booking: r.status === 'zugesagt' ? r.booking : null, bookedSeat: r.bookedSeat,
      differs: r.status === 'zugesagt' && r.booking === 'gebucht' && !!r.bookedSeat && r.bookedSeat !== r.seat,
      remindersOff: r.remindersOff, reachable: !!r.discordId,
    })),
  }
})
