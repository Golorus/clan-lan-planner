import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.union([
  /** eine Teilnahme */
  z.object({ registrationId: z.number().int().positive() }),
  /** alle Zugesagten, die die Info-Nachricht noch nicht haben (oder bei denen sie fehlgeschlagen ist) */
  z.object({ all: z.literal(true) }),
])

const DONE = 'Von Hand als erledigt abgehakt.'

/**
 * Info-Nachricht als erledigt abhaken, ohne sie zu schicken (z. B. wenn die Leute schon anders informiert sind).
 * Wartende Info-Nachrichten fallen weg; die automatische bei Zusage kommt für diese Teilnahme nicht mehr.
 */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const ev = requireCurrentEvent(db)
  const info = infoMessageStatus(ev.id)
  const regs = loadRegistrations(db, ev.id).filter(r => r.status === 'zugesagt' && r.discordId)
  const targets = 'registrationId' in body
    ? regs.filter(r => r.id === body.registrationId)
    : regs.filter(r => !info.get(r.id) || info.get(r.id)!.status === 'fehler')
  if ('registrationId' in body && !targets.length) throw createError({ statusCode: 404, statusMessage: 'Diese Teilnahme gibt es nicht, sie hat nicht zugesagt oder keine Discord-ID.' })

  const D = tables.messageDeliveries
  const now = new Date()
  db.transaction((tx) => {
    const ids = targets.map(r => r.id)
    if (ids.length) {
      tx.update(D).set({ status: 'entfallen', error: DONE })
        .where(and(eq(D.kind, 'registrierung'), eq(D.status, 'wartet'), inArray(D.registrationId, ids))).run()
    }
    for (const r of targets) {
      // derselbe Schlüssel wie die automatische Info bei Zusage: die kommt dann nicht mehr
      tx.insert(D).values({
        eventId: ev.id, kind: 'registrierung', body: '', registrationId: r.id, discordId: r.discordId, nick: r.nick,
        status: 'entfallen', error: DONE, sendAfter: now, createdAt: now, dedupeKey: `zusage:${ev.id}:${r.id}`,
      }).onConflictDoNothing().run()
      // gab es den Schlüssel schon (z. B. fehlgeschlagen), zählt trotzdem ein neuer Eintrag als „erledigt“
      if (info.get(r.id)?.status === 'fehler') {
        tx.insert(D).values({
          eventId: ev.id, kind: 'registrierung', body: '', registrationId: r.id, discordId: r.discordId, nick: r.nick,
          status: 'entfallen', error: DONE, sendAfter: now, createdAt: now,
        }).run()
      }
    }
    if (targets.length) writeLog(tx, ev.id, leader, { action: 'info erledigt', detail: `${targets.length} von Hand abgehakt` })
  })
  return { done: targets.length }
})
