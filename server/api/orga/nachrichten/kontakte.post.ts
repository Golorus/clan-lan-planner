import { z } from 'zod'
import { openCount, peopleOverview } from '#shared/utils/peopleOverview'

const bodySchema = z.object({
  /** nur ansehen, wer was bekäme; nichts verschicken */
  dryRun: z.boolean().default(false),
  /** optionaler Satz der Orga über der Liste */
  note: z.string().trim().max(300).default(''),
})

/** wer innerhalb dieser Zeit schon eine Übersicht bekommen hat, wird übersprungen */
const QUIET_MS = 12 * 60 * 60_000

/**
 * Knopf in /orga › Nachrichten: jede Kontaktperson bekommt per DM ihre Leute, bei denen noch etwas fehlt
 * (wie /leute, Standard „was noch fehlt“). Wer nichts Offenes hat, bekommt nichts.
 */
export default defineEventHandler(async (event) => {
  const leader = await requireLeader(event)
  const { dryRun, note } = await readValidatedBody(event, bodySchema.parse)
  if (!dryRun && !discordConfigured() && !botOptional()) {
    throw createError({ statusCode: 500, statusMessage: 'Der Discord-Bot ist nicht eingerichtet (NUXT_DISCORD_BOT_TOKEN, NUXT_DISCORD_GUILD_ID).' })
  }
  const db = useDb()
  const ev = requireCurrentEvent(db)
  const bookingReleased = !!ev.bookingReleasedAt
  const people = loadEventPeople(ev.id, bookingReleased)
  const recent = recentContactOverviews(ev.id, new Date(Date.now() - QUIET_MS))
  const link = `${appUrl()}kontakt`

  const items: { discordId: string, nick: string, open: number, text: string }[] = []
  const skipped: { nick: string, reason: string }[] = []
  const contacts = db.select().from(tables.contacts).all().sort((a, b) => a.nick.localeCompare(b.nick, 'de'))
  for (const c of contacts) {
    const own = people.filter(p => p.contactId === c.id)
    const open = openCount(own)
    if (!open) {
      skipped.push({ nick: c.nick, reason: 'nichts offen' })
      continue
    }
    if (recent.has(c.discordId)) {
      skipped.push({ nick: c.nick, reason: 'hat in den letzten 12 Stunden schon eine bekommen' })
      continue
    }
    const intro = [`Hallo ${c.nick}, hier ist der Stand deiner Leute von der Orga. Magst du bei den Offenen kurz nachhaken?`, note].filter(Boolean).join('\n')
    const text = peopleOverview(own, { title: 'Deine Leute', eventName: ev.name, filter: 'offen', bookingReleased, link, intro })
    items.push({ discordId: c.discordId, nick: c.nick, open, text })
  }

  if (dryRun) return { recipients: items.map(i => ({ nick: i.nick, open: i.open })), skipped, preview: items[0]?.text ?? '' }
  if (!items.length) throw createError({ statusCode: 400, statusMessage: 'Keine Kontaktperson hat gerade offene Leute (oder alle haben heute schon eine Übersicht bekommen).' })
  const id = queueContactOverviews(ev.id, leader.displayName || leader.username, items)
  return { id, recipients: items.length, skipped }
})
