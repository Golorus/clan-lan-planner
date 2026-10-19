import type { Status } from './registration'

/**
 * Texte der Nachrichten: Platzhalter einsetzen, Buchungscode schwärzen und entscheiden, ob eine Nachricht beim
 * Versand noch nötig ist. Reiner Code ohne Datenbank, damit er in Server und Browser gleich gilt und sich testen lässt.
 */

/**
 * Platzhalter in Nachrichten; {link} ist die Adresse der App, {frist} das Ende der Bedarfsabfrage,
 * {platz_bis} der Buchungsstart (Ende der Platzwahl).
 * {code} (Buchungscode) gibt es nur in den Buchungsnachrichten an Zugesagte; gespeichert wird er nie.
 */
export const MESSAGE_PLACEHOLDERS = ['nick', 'platz', 'event', 'datum', 'kontakt', 'link', 'frist', 'platz_bis', 'countdown',
  'buchungslink', 'buchen_bis', 'angebot_bis', 'code'] as const
export type MessagePlaceholder = typeof MESSAGE_PLACEHOLDERS[number]
export type MessageVars = Partial<Record<MessagePlaceholder, string>>
/** in Rundnachrichten aus /orga: ohne Buchungscode und ohne Angebotsfrist */
export const MANUAL_PLACEHOLDERS = MESSAGE_PLACEHOLDERS.filter(p => p !== 'code' && p !== 'angebot_bis')
/** steht im gespeicherten Nachrichtentext statt des Buchungscodes */
export const CODE_MASK = '••••'

const PLACEHOLDER = new RegExp(`\\{(${MESSAGE_PLACEHOLDERS.join('|')})\\}`, 'g')

/** Setzt die bekannten Platzhalter ein; fehlende und unbekannte bleiben stehen */
export function renderMessage(body: string, vars: MessageVars) {
  return body.replace(PLACEHOLDER, (all, k: MessagePlaceholder) => vars[k] ?? all)
}

/**
 * Umsetzungs-Nachricht beim Versand noch nötig? Sie entfällt, wenn die Person keinen Platz mehr hat oder wieder dort
 * sitzt, wo sie vor der ersten Änderung saß. Gibt den Grund zurück oder null.
 */
export function moveMessageObsolete(status: Status, seat: string | null, prevSeat: string | null) {
  if (status !== 'zugesagt' || !seat) return 'Hat keinen Platz mehr.'
  if (seat === prevSeat) return 'Sitzt wieder auf dem Platz von vorher.'
  return null
}
