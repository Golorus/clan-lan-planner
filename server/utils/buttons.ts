/**
 * Discord-Buttons für die Direktnachrichten (Message Components). Knöpfe mit custom_id kommen über
 * /api/discord/interactions zurück und gehen nur, wenn NUXT_DISCORD_PUBLIC_KEY gesetzt ist; sonst gibt es
 * nur den Link zur Seite. custom_id: st:zu|ab:<teilnahme>, bk:<teilnahme>, of:ja|nein:<angebot>, rem:aus:<teilnahme>,
 * fg:ja|nein:<person> (Freigabe neuer Leute), test:knopf|formular (Test-Nachricht aus /orga).
 */

const STYLE = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 } as const

interface Button { type: 2, style: number, label: string, custom_id?: string, url?: string }
const row = (...components: Button[]) => ({ type: 1, components })
const action = (label: string, customId: string, style: number): Button => ({ type: 2, style, label, custom_id: customId })
const link = (label: string, url: string): Button => ({ type: 2, style: STYLE.link, label, url })

export function interactionsEnabled() {
  return !!String(useRuntimeConfig().discord.publicKey || '').trim()
}

/** Link zur Seite (Platzwahl) */
export function seatLinkButtons() {
  return [row(link('Zum Sitzplan', appUrl()))]
}

/** Erinnerung an Offene: zusagen, absagen, keine Erinnerungen mehr */
export function statusButtons(registrationId: number) {
  if (!interactionsEnabled()) return seatLinkButtons()
  return [
    row(action('Bin dabei', `st:zu:${registrationId}`, STYLE.success), action('Bin nicht dabei', `st:ab:${registrationId}`, STYLE.danger)),
    row(link('Zum Sitzplan', appUrl()), action('Keine Erinnerungen mehr', `rem:aus:${registrationId}`, STYLE.secondary)),
  ]
}

/** Buchung: zum Buchungstool und „Ich habe gebucht“ */
export function bookingButtons(registrationId: number, bookingUrl: string) {
  const buttons: Button[] = []
  if (/^https?:\/\//.test(bookingUrl)) buttons.push(link('Zum Buchungstool', bookingUrl))
  if (interactionsEnabled()) buttons.push(action('Ich habe gebucht', `bk:${registrationId}`, STYLE.success))
  else buttons.push(link('Auf der Seite melden', appUrl()))
  return [row(...buttons)]
}

/** Platzangebot an die Warteliste */
export function offerButtons(offerId: number) {
  if (!interactionsEnabled()) return [row(link('Auf der Seite annehmen', appUrl()))]
  return [row(action('Platz annehmen', `of:ja:${offerId}`, STYLE.success), action('Ablehnen', `of:nein:${offerId}`, STYLE.danger))]
}

/** Erinnerung an die Platzwahl */
export function seatReminderButtons(registrationId: number) {
  if (!interactionsEnabled()) return seatLinkButtons()
  return [row(link('Platz wählen', appUrl()), action('Keine Erinnerungen mehr', `rem:aus:${registrationId}`, STYLE.secondary))]
}

/** Freigabe-Anfrage an die Kontaktperson; ohne Interactions entscheidet die Orga im Planner */
export function approvalButtons(personId: number) {
  if (!interactionsEnabled()) return [row(link('Zum Planner', appUrl()))]
  return [row(action('Annehmen', `fg:ja:${personId}`, STYLE.success), action('Ablehnen', `fg:nein:${personId}`, STYLE.danger))]
}

/** Test-Nachricht aus /orga: prüft, ob Discord den Planner erreicht (Knopf) und ob Formulare gehen (wie „Ich habe gebucht“) */
export function testButtons() {
  if (!interactionsEnabled()) return []
  return [row(action('Knopf testen', 'test:knopf', STYLE.success), action('Formular testen', 'test:formular', STYLE.primary))]
}

export type ButtonAction =
  | { kind: 'status', registrationId: number, status: 'zugesagt' | 'abgesagt' }
  | { kind: 'booked', registrationId: number }
  | { kind: 'offer', offerId: number, accept: boolean }
  | { kind: 'reminders-off', registrationId: number }
  | { kind: 'approval', personId: number, accept: boolean }
  | { kind: 'test', what: 'knopf' | 'formular' }

/** custom_id eines Knopfs lesen; null bei Unbekanntem */
export function parseCustomId(id: string): ButtonAction | null {
  let m = /^st:(zu|ab):(\d{1,12})$/.exec(id)
  if (m) return { kind: 'status', registrationId: Number(m[2]), status: m[1] === 'zu' ? 'zugesagt' : 'abgesagt' }
  m = /^bk:(\d{1,12})$/.exec(id)
  if (m) return { kind: 'booked', registrationId: Number(m[1]) }
  m = /^of:(ja|nein):(\d{1,12})$/.exec(id)
  if (m) return { kind: 'offer', offerId: Number(m[2]), accept: m[1] === 'ja' }
  m = /^rem:aus:(\d{1,12})$/.exec(id)
  if (m) return { kind: 'reminders-off', registrationId: Number(m[1]) }
  m = /^fg:(ja|nein):(\d{1,12})$/.exec(id)
  if (m) return { kind: 'approval', personId: Number(m[2]), accept: m[1] === 'ja' }
  m = /^test:(knopf|formular)$/.exec(id)
  if (m) return { kind: 'test', what: m[1] as 'knopf' | 'formular' }
  return null
}
