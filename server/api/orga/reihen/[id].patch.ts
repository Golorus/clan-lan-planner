import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { CARPETS, parseSeat, ROW_LETTER, SEATS_PER_ROW, seatLabel } from '#shared/utils/seating'

const bodySchema = z.object({
  letter: z.string().trim().toUpperCase().regex(ROW_LETTER, 'Reihe: ein oder zwei Buchstaben A–Z').optional(),
  start: z.number().int().min(1).max(9960).optional(),
  carpet: z.enum(CARPETS).optional(),
  /** -1 = nach oben, 1 = nach unten */
  move: z.union([z.literal(-1), z.literal(1)]).optional(),
})

/**
 * Reihe ändern. Ändern sich Buchstabe oder Startnummer, wandern die Leute mit
 * (A-83 in Reihe A ab 81 wird B-3 in Reihe B ab 1), damit niemand seinen Tisch verliert.
 */
export default defineEventHandler(async (event) => {
  const leader = await requireLeader(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const S = tables.seatRows
  const R = tables.registrations
  useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    const rows = loadRows(tx, ev.id)
    const row = rows.find(r => r.id === id)
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Diese Reihe gibt es nicht.' })
    const letter = body.letter ?? row.letter
    const start = body.start ?? row.start
    if (letter !== row.letter && rows.some(r => r.letter === letter)) throw createError({ statusCode: 409, statusMessage: `Reihe ${letter} gibt es schon.` })

    if (letter !== row.letter || start !== row.start) {
      const regs = loadRegistrations(tx, ev.id)
      const seated = regs.filter(r => r.seat && parseSeat(r.seat)?.letter === row.letter)
      // Plätze mit dem neuen Buchstaben ohne passende Reihe (z. B. nach dem Löschen einer Reihe) gibt es nicht mehr
      const orphans = letter !== row.letter ? regs.filter(r => r.seat && parseSeat(r.seat)?.letter === letter) : []
      // erst alle frei machen, dann neu setzen (eindeutiger Index auf event + seat)
      for (const r of [...seated, ...orphans]) tx.update(R).set({ seat: null }).where(eq(R.id, r.id)).run()
      for (const r of seated) {
        const n = parseSeat(r.seat!)!.number
        const inRow = n >= row.start && n < row.start + SEATS_PER_ROW
        tx.update(R).set({ seat: inRow ? seatLabel(letter, n - row.start + start) : null }).where(eq(R.id, r.id)).run()
      }
      writeLog(tx, ev.id, { discordId: leader.discordId, name: leader.displayName || leader.username }, {
        action: 'Reihe geändert', detail: `${row.letter} ab ${row.start} → ${letter} ab ${start}, ${seated.length} Person(en) mitgewandert`,
      })
    }
    tx.update(S).set({ letter, start, carpet: body.carpet ?? row.carpet }).where(eq(S.id, row.id)).run()

    if (body.move) {
      const i = rows.indexOf(row)
      const j = i + body.move
      if (j >= 0 && j < rows.length) {
        const order = [...rows]
        order.splice(i, 1)
        order.splice(j, 0, row)
        order.forEach((r, position) => tx.update(S).set({ position }).where(eq(S.id, r.id)).run())
      }
    }
  })
  return { ok: true }
})
