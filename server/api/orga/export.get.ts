import { z } from 'zod'

/**
 * Export des aktuellen Events als JSON (die Zugesagten, lässt sich wieder importieren) oder CSV (alle mit Status, für Excel).
 * Der Buchungscode steht nie im Export.
 */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { format } = await getValidatedQuery(event, z.object({ format: z.enum(['json', 'csv']).default('json') }).parse)
  const db = useDb()
  const ev = requireCurrentEvent(db)
  const contacts = new Map(db.select().from(tables.contacts).all().map(c => [c.id, c]))
  const regs = loadRegistrations(db, ev.id)
  const base = `sitzplan-${ev.date}-${ev.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase()}`

  if (format === 'csv') {
    // Excel (deutsch): Semikolon, BOM; Zellen, die mit = + - @ beginnen, werden entschärft
    const cell = (v: unknown) => {
      let s = v == null ? '' : String(v)
      if (/^[=+\-@\t\r]/.test(s)) s = '\'' + s
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [['Nick', 'Discord-Name', 'Discord-ID', 'Kontaktperson', 'Status', 'Warteliste', 'Platz', 'Breite', 'Buchung', 'Gebuchter Platz']]
    for (const r of regs) {
      lines.push([r.nick, r.discordName ?? '', r.discordId ?? '', r.contactId ? contacts.get(r.contactId)?.nick ?? '' : '', r.status, r.waitlistAt ? 'ja' : '',
        r.seat ?? '', r.double ? 'doppelt' : 'einfach', r.status === 'zugesagt' ? r.booking : '', r.bookedSeat ?? ''])
    }
    setHeaders(event, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}.csv"` })
    return '﻿' + lines.map(l => l.map(cell).join(';')).join('\r\n') + '\r\n'
  }

  setHeaders(event, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}.json"` })
  return {
    format: 'lan-planner-sitzplan',
    version: 1,
    exportedAt: new Date().toISOString(),
    event: { name: ev.name, startsAt: ev.startsAt, endsAt: ev.endsAt, location: ev.location },
    rows: loadRows(db, ev.id).map(r => ({ letter: r.letter, start: r.start, carpet: r.carpet })),
    contacts: [...contacts.values()].map(c => ({ nick: c.nick, color: c.color })),
    attendees: regs.filter(r => r.status === 'zugesagt').map(r => ({
      nick: r.nick,
      discordId: r.discordId,
      discordName: r.discordName,
      contact: r.contactId ? contacts.get(r.contactId)?.nick ?? null : null,
      seat: r.seat,
      double: r.double,
    })),
  }
})
