import { z } from 'zod'

const auto = z.object({ enabled: z.boolean(), body: z.string().trim().min(1).max(1900) })
const kinds = ['registrierung', 'umsetzung', 'erinnerung_offen', 'erinnerung_platz', 'erinnerung_buchung', 'buchung', 'absage_kontakt', 'angebot', 'nachgerueckt_kontakt', 'bereich'] as const

/** Automatische Nachrichten ein-/ausschalten und Text ändern (nur die mitgeschickten Arten) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const settings = await readValidatedBody(event, z.object(Object.fromEntries(kinds.map(k => [k, auto.optional()]))).parse) as Partial<MessageSettings>
  saveMessageSettings(settings)
  return getMessageSettings()
})
