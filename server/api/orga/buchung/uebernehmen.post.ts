import { coveredSeats } from '#shared/utils/seating'
import { z } from 'zod'

const bodySchema = z.object({ registrationId: z.number().int().positive() })

/** Weicht der gebuchte Platz vom Plan ab: den Sitzplan an die echte Buchung anpassen (Orga, auch nach den Fristen) */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const { registrationId } = await readValidatedBody(event, bodySchema.parse)
  const ev = requireCurrentEvent()
  const reg = findRegistration(useDb(), ev.id, registrationId)
  if (!reg || reg.booking !== 'gebucht' || !reg.bookedSeat) throw createError({ statusCode: 409, statusMessage: 'Für diese Person ist kein gebuchter Platz gemeldet.' })
  // sitzt dort jemand, der selbst schon gebucht hat, wäre ein Tausch falsch: das klärt die Orga von Hand
  const occupant = loadRegistrations(useDb(), ev.id).find(r => r.id !== reg.id && r.status === 'zugesagt' && r.booking === 'gebucht'
    && coveredSeats(r, loadRows(useDb(), ev.id)).includes(reg.bookedSeat!))
  if (occupant) throw createError({ statusCode: 409, statusMessage: `Auf ${reg.bookedSeat} sitzt ${occupant.nick} und hat dort selbst gebucht. Bitte von Hand klären.` })
  const moved = moveRegistration(leader, registrationId, reg.bookedSeat)
  return { moved: moved.map(m => ({ registrationId: m.registrationId, seat: m.toSeat })) }
})
