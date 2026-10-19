import { desc, eq, sql } from 'drizzle-orm'
import { parseDays } from '#shared/utils/registration'

/** Alle Events mit Zahl der Reihen und Zusagen, Fristen und Einstellungen (Buchungscode nur hier in /orga) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const db = useDb()
  const S = tables.seatRows
  const R = tables.registrations
  const rows = new Map(db.select({ eventId: S.eventId, n: sql<number>`count(*)` }).from(S).groupBy(S.eventId).all().map(r => [r.eventId, r.n]))
  const regs = new Map(db.select({ eventId: R.eventId, n: sql<number>`count(*)` }).from(R).where(eq(R.status, 'zugesagt')).groupBy(R.eventId).all().map(r => [r.eventId, r.n]))
  return db.select().from(tables.events).orderBy(desc(tables.events.date), desc(tables.events.id)).all().map(e => ({
    id: e.id,
    name: e.name,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    location: e.location,
    description: e.description,
    discordEventUrl: e.discordEventId ? discordEventUrl(e.discordEventId) : null,
    announceUrl: e.announceChannelId && e.announceMessageId ? channelUrl(e.announceChannelId, e.announceMessageId) : null,
    threadUrl: e.discordThreadId ? channelUrl(e.discordThreadId) : null,
    registrationOpen: e.registrationOpen,
    demandClosedAt: e.demandClosedAt,
    demandUntil: e.demandUntil,
    bookingFrom: e.bookingFrom,
    bookingUntil: e.bookingUntil,
    bookingCode: e.bookingCode,
    bookingUrl: e.bookingUrl,
    bookingReleasedAt: e.bookingReleasedAt,
    remindDays: parseDays(JSON.parse(e.remindDays)),
    bookingRemindDays: parseDays(JSON.parse(e.bookingRemindDays)),
    offerHours: e.offerHours,
    waitlistAuto: e.waitlistAuto,
    maxParticipants: e.maxParticipants,
    isCurrent: e.isCurrent,
    rows: rows.get(e.id) ?? 0,
    registrations: regs.get(e.id) ?? 0,
  }))
})
