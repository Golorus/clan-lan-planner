import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'

/** Versandübersicht des aktuellen Events: Rundnachrichten mit Zählern, automatische Nachrichten, Vorlagen, Einstellungen */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const db = useDb()
  const D = tables.messageDeliveries
  const ev = currentEvent(db)
  const templates = db.select().from(tables.messageTemplates).orderBy(asc(tables.messageTemplates.name)).all()
  if (!ev) return { batches: [], auto: [], templates, settings: getMessageSettings() }

  const counts = db.select({ batchId: D.batchId, status: D.status, n: sql<number>`count(*)` }).from(D)
    .where(eq(D.eventId, ev.id)).groupBy(D.batchId, D.status).all()
  const batches = db.select().from(tables.messageBatches).where(eq(tables.messageBatches.eventId, ev.id))
    .orderBy(desc(tables.messageBatches.id)).limit(50).all().map((b) => {
      const c = { wartet: 0, gesendet: 0, fehler: 0, entfallen: 0 }
      for (const row of counts) if (row.batchId === b.id) c[row.status] = row.n
      return { ...b, counts: c }
    })
  const auto = db.select().from(D).where(and(eq(D.eventId, ev.id), isNull(D.batchId)))
    .orderBy(desc(D.id)).limit(100).all()
    .map(d => ({ id: d.id, kind: d.kind, nick: d.nick, status: d.status, error: d.error, text: d.text, sendAfter: d.sendAfter, sentAt: d.sentAt }))
  return { batches, auto, templates, settings: getMessageSettings() }
})
