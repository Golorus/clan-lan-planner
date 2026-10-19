import { eq } from 'drizzle-orm'
import { z } from 'zod'

/** Projektleiter nimmt einen Teilnehmer aus dem aktuellen Event (die Person bleibt); wie eine Absage für Warteliste und Rolle */
export default defineEventHandler(async (event) => {
  const leader = await requireLeader(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const actor = { discordId: leader.discordId, name: leader.displayName || leader.username }
  const fx = newEffects(0)
  useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    fx.eventId = ev.id
    const reg = findRegistration(tx, ev.id, id)
    if (!reg) throw createError({ statusCode: 404, statusMessage: 'Diesen Teilnehmer gibt es nicht.' })
    releaseBeforeDelete(tx, [reg.id], actor, fx)
    tx.delete(tables.registrations).where(eq(tables.registrations.id, reg.id)).run()
    writeLog(tx, ev.id, actor, { action: 'entfernt', registration: reg, fromSeat: reg.seat })
  })
  finish(fx)
  return { ok: true }
})
