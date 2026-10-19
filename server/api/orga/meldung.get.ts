import { z } from 'zod'
import { formatEventRange } from '#shared/utils/eventTime'
import { coveredSeats, parseSeat } from '#shared/utils/seating'

/**
 * Zusammenfassung für die Meldung an den Veranstalter: Zahl der Zusagen und die belegten Platz-IDs
 * (doppelt breite Plätze mit beiden Plätzen), als Text zum Kopieren oder als CSV. Ohne Namen, ohne Buchungscode.
 */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { format } = await getValidatedQuery(event, z.object({ format: z.enum(['json', 'csv']).default('json') }).parse)
  const db = useDb()
  const ev = requireCurrentEvent(db)
  const rows = loadRows(db, ev.id)
  const confirmed = loadRegistrations(db, ev.id).filter(r => r.status === 'zugesagt')
  const seats = confirmed.flatMap(r => coveredSeats(r, rows)).sort((a, b) => {
    const pa = parseSeat(a)!, pb = parseSeat(b)!
    return pa.letter.localeCompare(pb.letter) || pa.number - pb.number
  })
  const withoutSeat = confirmed.filter(r => !r.seat).length
  const area = areaSeats(ev)
  const text = [
    `${ev.name} (${formatEventRange(ev.startsAt, ev.endsAt)})`,
    `Zusagen: ${confirmed.length}`,
    `Belegte Plätze (${seats.length}): ${seats.join(', ') || '–'}`,
    withoutSeat ? `Ohne festen Platz: ${withoutSeat}` : '',
    area.length ? `Gemeldeter Bereich (${area.length} Plätze${ev.areaFixedAt ? ', fixiert' : ', Entwurf'}): ${area.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  if (format === 'csv') {
    setHeaders(event, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="meldung-${ev.date}.csv"` })
    return '﻿' + ['Platz', ...seats].join('\r\n') + '\r\n'
  }
  return { confirmed: confirmed.length, seats, withoutSeat, area, areaFixed: !!ev.areaFixedAt, text }
})
