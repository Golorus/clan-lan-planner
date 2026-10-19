import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

/** Person mit allen Teilnahmen löschen; im Protokoll bleibt „(gelöscht)“ */
export default defineEventHandler(async (event) => {
  const leader = await requireLeader(event)
  const actor = { discordId: leader.discordId, name: leader.displayName || leader.username }
  const fx = newEffects(currentEvent()?.id ?? 0)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const R = tables.registrations
  useDb().transaction((tx) => {
    const person = tx.select().from(tables.persons).where(eq(tables.persons.id, id)).get()
    if (!person) throw createError({ statusCode: 404, statusMessage: 'Diese Person gibt es nicht.' })
    const regs = tx.select({ id: R.id }).from(R).where(eq(R.personId, id)).all().map(r => r.id)
    releaseBeforeDelete(tx, regs, actor, fx)
    if (regs.length) {
      tx.update(tables.seatLog).set({ nick: '(gelöscht)' }).where(inArray(tables.seatLog.registrationId, regs)).run()
      tx.delete(tables.messageDeliveries).where(inArray(tables.messageDeliveries.registrationId, regs)).run()
    }
    tx.delete(tables.persons).where(eq(tables.persons.id, id)).run()
  })
  finish(fx)
  return { ok: true }
})
