/**
 * Orga-Rechte gelten nur im Orga-Bereich. Auf der Startseite und unter /kontakt handelt die Orga wie alle anderen:
 * als Kontaktperson für ihre eigenen Leute, sonst nur für sich selbst. Seiten unter /orga kennzeichnen ihre Anfragen
 * mit ORGA_HEADER. Das schützt vor versehentlichen Orga-Aktionen, nicht vor der Orga selbst: sie hat die Rechte ja.
 */

/** Kopfzeile, mit der Seiten unter /orga ihre Anfragen an gemeinsame Endpunkte (/api/sitzplan, /api/team) kennzeichnen */
export const ORGA_HEADER = 'x-lan-planner-orga'

/** Gehört die Seite zum Orga-Bereich? */
export function isOrgaPage(path: string) {
  return path === '/orga' || path.startsWith('/orga/')
}

/** Handelt jemand mit der Orga-Rolle bei dieser Anfrage mit Orga-Rechten? /api/orga/… immer, sonst nur mit Kennzeichnung */
export function actsAsOrga(isOrga: boolean, apiPath: string, header: string | null | undefined) {
  if (!isOrga) return false
  return apiPath === '/api/orga' || apiPath.startsWith('/api/orga/') || header === '1'
}

/** Header für eine Anfrage von dieser Seite aus */
export function orgaHeaders(pagePath: string): Record<string, string> {
  return isOrgaPage(pagePath) ? { [ORGA_HEADER]: '1' } : {}
}
