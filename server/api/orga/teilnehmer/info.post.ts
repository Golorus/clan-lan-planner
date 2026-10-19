import { z } from 'zod'

const bodySchema = z.union([
  /** an eine Teilnahme (auch erneut) */
  z.object({ registrationId: z.number().int().positive() }),
  /** an alle Zugesagten, die sie noch nicht bekommen haben (oder bei denen sie fehlgeschlagen ist) */
  z.object({ all: z.literal(true) }),
])

/**
 * Info-Nachricht (Text der automatischen Nachricht bei Registrierung) per Knopf verschicken –
 * auch wenn der automatische Versand ausgeschaltet ist.
 */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const ev = requireCurrentEvent(db)
  const regs = loadRegistrations(db, ev.id).filter(r => r.status === 'zugesagt')

  if ('registrationId' in body) {
    const reg = regs.find(r => r.id === body.registrationId)
    if (!reg) throw createError({ statusCode: 404, statusMessage: 'Diesen Teilnehmer gibt es nicht oder er hat nicht zugesagt.' })
    if (!reg.discordId) throw createError({ statusCode: 400, statusMessage: `${reg.nick} hat keine Discord-ID (aus dem Import).` })
    queueAutoMessage('registrierung', reg.id, true)
    return { queued: 1 }
  }

  const info = infoMessageStatus(ev.id)
  let queued = 0
  for (const reg of regs) {
    const status = info.get(reg.id)?.status
    if (!reg.discordId || status === 'gesendet' || status === 'wartet') continue
    if (queueAutoMessage('registrierung', reg.id, true)) queued++
  }
  return { queued }
})
