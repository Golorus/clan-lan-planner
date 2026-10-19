import { eq } from 'drizzle-orm'

/**
 * Discord-Interactions: die Knöpfe in unseren Direktnachrichten („Bin dabei“, „Ich habe gebucht“, „Platz annehmen“ …).
 * In der Discord-Anwendung unter General Information › Interactions Endpoint URL eintragen (ANLEITUNG-VPS.md).
 * Jede Anfrage ist mit dem Public Key der Anwendung signiert (NUXT_DISCORD_PUBLIC_KEY); ohne gültige Signatur 401.
 * Wer gedrückt hat, sagt Discord (interaction.user.id); das muss die Person der Teilnahme bzw. des Angebots sein.
 */

const PONG = 1
const MESSAGE = 4
const UPDATE_MESSAGE = 7
const MODAL = 9
const EPHEMERAL = 64

interface Interaction {
  type: number
  data?: { custom_id?: string, components?: { components?: { custom_id?: string, value?: string }[] }[] }
  user?: { id: string }
  member?: { user?: { id: string } }
  message?: { content?: string }
}

const link = (label: string, url: string) => ({ type: 1, components: [{ type: 2, style: 5, label, url }] })

/** Nachricht ersetzen: Knöpfe weg, Ergebnis darunter */
function done(original: string | undefined, result: string, components: unknown[] = []) {
  const base = (original ?? '').replace(/\n\n(✅|❌|ℹ️) [\s\S]*$/, '')
  return { type: UPDATE_MESSAGE, data: { content: `${base}\n\n${result}`.slice(0, 2000), components } }
}

const reply = (text: string) => ({ type: MESSAGE, data: { content: text, flags: EPHEMERAL } })

/** Eingabefeld „Gebuchter Platz“ im Formular; leer vorausfüllen nimmt Discord womöglich nicht an, dann öffnet es sich nicht */
const seatInputRow = (seat: string | null) => ({ type: 1, components: [{
  type: 4, custom_id: 'seat', style: 1, label: 'Gebuchter Platz (z. B. A-81)', min_length: 0, max_length: 10, required: false, ...(seat ? { value: seat } : {}),
}] })

export default defineEventHandler(async (event) => {
  const publicKey = String(useRuntimeConfig().discord.publicKey || '').trim()
  const raw = await readRawBody(event, 'utf8') ?? ''
  const ok = publicKey && verifyDiscordSignature(publicKey, getHeader(event, 'x-signature-ed25519'), getHeader(event, 'x-signature-timestamp'), raw)
  if (!ok) throw createError({ statusCode: 401, statusMessage: 'Ungültige Signatur' })

  const it = JSON.parse(raw) as Interaction
  if (it.type === 1) return { type: PONG }
  const userId = it.user?.id ?? it.member?.user?.id
  if (!userId) return reply('Das hat nicht geklappt.')

  try {
    // Formular aus der Test-Nachricht abgeschickt
    if (it.type === 5 && it.data?.custom_id === 'tsm') {
      const value = it.data.components?.[0]?.components?.[0]?.value?.trim() || '(leer)'
      return done(it.message?.content, `✅ Das Formular funktioniert (eingegeben: ${value.slice(0, 20)}). Genauso läuft „Ich habe gebucht“.`)
    }
    // Formular „Ich habe gebucht“ abgeschickt
    if (it.type === 5) {
      const m = /^bkm:(\d{1,12})$/.exec(it.data?.custom_id ?? '')
      if (!m) return reply('Das kenne ich nicht.')
      const seat = it.data?.components?.[0]?.components?.[0]?.value?.trim() || null
      const r = setBookingByButton(userId, Number(m[1]), seat)
      return done(it.message?.content, `✅ Danke, ist notiert: gebucht${r.seat ? ` (Platz ${r.seat})` : ''}.${r.moved ? ' Im Sitzplan sitzt du jetzt dort.' : r.differs ? ' Der Platz ist im Sitzplan schon belegt, die Orga schaut drüber.' : ''}`)
    }
    if (it.type !== 3) return reply('Das kenne ich nicht.')

    const action = parseCustomId(it.data?.custom_id ?? '')
    if (!action) return reply('Dieser Knopf ist veraltet.')

    // Test-Nachricht aus /orga: ändert nichts
    if (action.kind === 'test') {
      if (action.what === 'knopf') return done(it.message?.content, '✅ Der Knopf funktioniert: Discord erreicht den Planner.', testButtons())
      return { type: MODAL, data: { custom_id: 'tsm', title: 'Formular testen', components: [seatInputRow('A-81')] } }
    }

    if (action.kind === 'status') {
      const r = setStatusByButton(userId, action.registrationId, action.status)
      if (action.status === 'zugesagt') {
        return done(it.message?.content, r.changed ? '✅ Super, du bist dabei! Such dir jetzt deinen Platz aus.' : 'ℹ️ Du hattest schon zugesagt.', [link('Platz wählen', appUrl())])
      }
      return done(it.message?.content, r.changed ? '❌ Schade! Du bist abgemeldet. Falls du es dir anders überlegst: einfach auf der Seite wieder zusagen.' : 'ℹ️ Du hattest schon abgesagt.', [link('Zum Sitzplan', appUrl())])
    }

    if (action.kind === 'booked') {
      const reg = findRegistrationById(useDb(), action.registrationId)
      if (!reg || reg.discordId !== userId) return reply('Dieser Knopf gehört zu jemand anderem.')
      return { type: MODAL, data: { custom_id: `bkm:${reg.id}`, title: 'Ich habe gebucht', components: [seatInputRow(reg.seat)] } }
    }

    if (action.kind === 'offer') {
      const reg = useDb().select({ nick: tables.persons.nick }).from(tables.persons).where(eq(tables.persons.discordId, userId)).get()
      const r = answerOffer(action.offerId, action.accept, { discordId: userId, isLeader: false, name: reg?.nick ?? userId })
      if (r.expired) return done(it.message?.content, 'ℹ️ Das Angebot ist leider schon abgelaufen.')
      if (r.accepted) return done(it.message?.content, r.seat ? `✅ Willkommen dabei! Dein Platz: ${r.seat}. Du kannst ihn einmal gegen einen anderen freien tauschen.` : '✅ Willkommen dabei! Such dir jetzt im Sitzplan einen freien Platz aus.', [link('Platz aussuchen', appUrl())])
      return done(it.message?.content, '❌ Alles klar, der Platz geht an den Nächsten auf der Warteliste.')
    }

    // Freigabe neuer Leute durch ihre Kontaktperson (oder die Orga)
    if (action.kind === 'approval') {
      const name = useDb().select({ nick: tables.contacts.nick }).from(tables.contacts).where(eq(tables.contacts.discordId, userId)).get()?.nick ?? userId
      const r = await decideApproval(action.personId, action.accept ? 'frei' : 'abgelehnt', { discordId: userId, name, asContact: true })
      if (!r.changed) return done(it.message?.content, `ℹ️ Darüber ist schon entschieden: ${r.nick} ist ${r.approval === 'frei' ? 'freigegeben' : r.approval === 'abgelehnt' ? 'abgelehnt' : 'offen'}.`)
      return done(it.message?.content, r.approval === 'frei' ? `✅ ${r.nick} ist freigegeben und kann jetzt mitmachen.` : `❌ ${r.nick} ist abgelehnt.`)
    }

    // Erinnerungen abbestellen
    const reg = findRegistrationById(useDb(), action.registrationId)
    if (!reg || reg.discordId !== userId) return reply('Dieser Knopf gehört zu jemand anderem.')
    setRemindersOff(reg.personId, true)
    return done(it.message?.content, 'ℹ️ Du bekommst keine Erinnerungen mehr. Wieder anstellen kannst du das auf der Seite unter „Meine Daten“.', [link('Zum Sitzplan', appUrl())])
  }
  catch (e) {
    const msg = e && typeof e === 'object' && 'statusMessage' in e ? String((e as { statusMessage: string }).statusMessage) : 'Das hat nicht geklappt.'
    if (!(e && typeof e === 'object' && 'statusCode' in e)) console.error('[interactions]', e)
    return reply(msg)
  }
})
