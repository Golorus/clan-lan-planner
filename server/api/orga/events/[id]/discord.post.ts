import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { berlinToUtcIso } from '#shared/utils/eventTime'

/**
 * Aus einem Event ein Discord-Event (Scheduled Event) machen bzw. es aktualisieren:
 * Name, Zeitraum, Ort und Beschreibung, dazu der Link zu Sitzplan und Registrierung.
 */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)
  if (!discordConfigured()) throw createError({ statusCode: 500, statusMessage: 'Der Discord-Bot ist nicht eingerichtet (NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_GUILD_ID).' })
  const db = useDb()
  const E = tables.events
  const ev = db.select().from(E).where(eq(E.id, id)).get()
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Dieses Event gibt es nicht.' })
  if (!ev.location) throw createError({ statusCode: 400, statusMessage: 'Bitte zuerst einen Ort eintragen – Discord verlangt ihn bei Events außerhalb von Discord.' })

  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  const description = [ev.description, `Sitzplan & Registrierung: ${origin}/`].filter(Boolean).join('\n\n')
  let discordEventId: string
  try {
    discordEventId = await upsertScheduledEvent(ev.discordEventId, {
      name: ev.name,
      description,
      location: ev.location,
      start: berlinToUtcIso(ev.startsAt),
      end: berlinToUtcIso(ev.endsAt),
    })
  }
  catch (e) {
    throw createError({ statusCode: 502, statusMessage: e instanceof Error ? e.message : String(e) })
  }
  db.update(E).set({ discordEventId }).where(eq(E.id, id)).run()
  return { created: discordEventId !== ev.discordEventId, url: discordEventUrl(discordEventId) }
})
