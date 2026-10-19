import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { LOCAL_DATETIME } from '#shared/utils/eventTime'
import { deadlineMs, parseDays, waitlistActive } from '#shared/utils/registration'

const deadline = z.union([z.literal(''), z.string().regex(LOCAL_DATETIME, 'Zeit im Format JJJJ-MM-TTTHH:mm')])

const bodySchema = eventFieldsPatchSchema.extend({
  /** Bedarfsabfrage öffnen bzw. vorzeitig schließen */
  registrationOpen: z.boolean().optional(),
  /** nur true: dieses Event wird das aktuelle */
  isCurrent: z.literal(true).optional(),
  demandUntil: deadline.optional(),
  bookingFrom: deadline.optional(),
  bookingUntil: deadline.optional(),
  bookingCode: z.string().max(100).optional(),
  bookingUrl: z.union([z.literal(''), z.string().url().max(500).refine(u => /^https?:\/\//.test(u), 'Bitte eine http(s)-Adresse.')]).optional(),
  remindDays: z.union([z.string().max(100), z.array(z.number())]).optional(),
  bookingRemindDays: z.union([z.string().max(100), z.array(z.number())]).optional(),
  offerHours: z.number().int().min(1).max(24 * 14).optional(),
  waitlistAuto: z.boolean().optional(),
  maxParticipants: z.number().int().min(1).max(10000).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  const E = tables.events
  let offered = 0
  const becameCurrent = useDb().transaction((tx) => {
    const ev = tx.select().from(E).where(eq(E.id, id)).get()
    if (!ev) throw createError({ statusCode: 404, statusMessage: 'Dieses Event gibt es nicht.' })
    const set: Partial<typeof E.$inferInsert> = {}
    const touched = ['name', 'startsAt', 'endsAt', 'location', 'description'].some(k => body[k as keyof typeof body] !== undefined)
    if (touched) {
      Object.assign(set, eventFields({
        name: body.name ?? ev.name,
        startsAt: body.startsAt ?? ev.startsAt,
        endsAt: body.endsAt ?? ev.endsAt,
        location: body.location ?? ev.location,
        description: body.description ?? ev.description,
      }))
    }
    if (body.registrationOpen !== undefined && body.registrationOpen !== ev.registrationOpen) {
      set.registrationOpen = body.registrationOpen
      // geschlossen = Bedarfsabfrage vorbei (ab jetzt Warteliste); wieder geöffnet = läuft weiter
      set.demandClosedAt = body.registrationOpen ? null : new Date()
    }
    for (const k of ['demandUntil', 'bookingFrom', 'bookingUntil', 'bookingUrl', 'offerHours', 'waitlistAuto', 'maxParticipants'] as const) {
      if (body[k] !== undefined) Object.assign(set, { [k]: body[k] })
    }
    if (body.bookingCode !== undefined) set.bookingCode = body.bookingCode.trim()
    if (body.remindDays !== undefined) set.remindDays = JSON.stringify(parseDays(body.remindDays))
    if (body.bookingRemindDays !== undefined) set.bookingRemindDays = JSON.stringify(parseDays(body.bookingRemindDays))
    const demand = set.demandUntil ?? ev.demandUntil, from = set.bookingFrom ?? ev.bookingFrom, until = set.bookingUntil ?? ev.bookingUntil
    const bad = (msg: string) => createError({ statusCode: 400, statusMessage: msg })
    if (demand && from && from <= demand) throw bad('Der Buchungsstart muss nach dem Ende der Bedarfsabfrage liegen (dazwischen ist die Platzwahl).')
    if (from && until && until <= from) throw bad('„Buchen bis“ muss nach dem Buchungsstart liegen.')
    if (from && !ev.bookingReleasedAt) {
      // zum Buchungsstart verschickt der Bot automatisch Code und Link: ohne beides gingen leere Nachrichten raus
      if (!(set.bookingCode ?? ev.bookingCode) || !(set.bookingUrl ?? ev.bookingUrl)) throw bad('Für den automatischen Buchungsstart bitte Buchungscode und Link eintragen.')
      // ein versehentlich vergangenes Datum würde beim nächsten Takt sofort alle Codes verschicken
      if (from !== ev.bookingFrom && (deadlineMs(from) ?? Infinity) <= Date.now()) {
        throw bad('Der Buchungsstart liegt in der Vergangenheit. Zum sofortigen Freigeben bitte „Buchung freigeben“ in /orga/buchung nutzen.')
      }
    }

    let current = false
    if (body.isCurrent && !ev.isCurrent) {
      tx.update(E).set({ isCurrent: false }).run()
      set.isCurrent = true
      current = true
    }
    if (Object.keys(set).length) tx.update(E).set(set).where(eq(E.id, id)).run()
    // Kennt der Planner jemanden schon, steht er im neuen aktuellen Event als „offen“
    if (current) inviteKnownPersons(tx, { ...ev, ...set } as EventRow, leader)
    // geänderte Fristen, Höchstzahl oder „automatisch nachrücken“ können Plätze für die Warteliste frei machen
    const after = { ...ev, ...set } as EventRow
    if (after.isCurrent && waitlistActive(eventRules(after), new Date(), countConfirmed(tx, id))) offered = offerFreeCapacity(tx, after)
    return current
  })
  if (offered) kickMessageWorker()
  // die Event-Rolle gilt jetzt für die Zugesagten des neuen Events
  if (becameCurrent) void syncEventRole(leader).catch(e => console.error('[rolle] Abgleich fehlgeschlagen:', e))
  return { ok: true }
})
