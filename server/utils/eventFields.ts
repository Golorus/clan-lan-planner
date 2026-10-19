import { z } from 'zod'
import { LOCAL_DATETIME } from '#shared/utils/eventTime'

const localDateTime = z.string().regex(LOCAL_DATETIME, 'Zeit im Format JJJJ-MM-TTTHH:mm')

/** Angaben eines Events; Ort max. 100 und Beschreibung max. 1000 Zeichen wie bei Discord. Ohne Vorgabewerte: fürs Bearbeiten (.partial()) */
export const eventFieldsPatchSchema = z.object({
  name: z.string().max(100),
  startsAt: localDateTime,
  endsAt: localDateTime,
  location: z.string().max(100),
  description: z.string().max(1000),
}).partial()

/** fürs Anlegen: Ort und Beschreibung dürfen fehlen */
export const eventFieldsSchema = z.object({
  name: z.string().max(100),
  startsAt: localDateTime,
  endsAt: localDateTime,
  location: z.string().max(100).default(''),
  description: z.string().max(1000).default(''),
})

/** bereinigt und prüft (Name vorhanden, Ende nach Beginn); date = Starttag zum Sortieren */
export function eventFields(input: z.infer<typeof eventFieldsSchema>) {
  const name = cleanText(input.name)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Bitte einen Namen angeben.' })
  if (input.endsAt <= input.startsAt) throw createError({ statusCode: 400, statusMessage: 'Das Ende muss nach dem Beginn liegen.' })
  return {
    name,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    date: input.startsAt.slice(0, 10),
    location: cleanText(input.location),
    description: input.description.replace(/\r\n/g, '\n').trim(),
  }
}
