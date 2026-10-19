import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { parseSeat } from '#shared/utils/seating'

/** Reihe löschen; wer dort saß, ist danach ohne Platz */
export default defineEventHandler(async (event) => {
  const leader = await requireLeader(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const actor = { discordId: leader.discordId, name: leader.displayName || leader.username }
  useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    const row = loadRows(tx, ev.id).find(r => r.id === id)
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Diese Reihe gibt es nicht.' })
    for (const r of loadRegistrations(tx, ev.id).filter(r => r.seat && parseSeat(r.seat)?.letter === row.letter)) {
      tx.update(tables.registrations).set({ seat: null, updatedAt: new Date() }).where(eq(tables.registrations.id, r.id)).run()
      writeLog(tx, ev.id, actor, { action: 'freigegeben', registration: r, fromSeat: r.seat, detail: `Reihe ${row.letter} gelöscht` })
    }
    tx.delete(tables.seatRows).where(eq(tables.seatRows.id, row.id)).run()
  })
  return { ok: true }
})
