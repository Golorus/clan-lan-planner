/**
 * Reiter der Orga in Gruppen. Eine Liste für OrgaNav.vue und für Module mit eigenen Server-Seiten
 * (layers/stand-planer/server/utils/planerPage.ts), damit alle dieselben Reiter zeigen.
 * Seiten der Module selbst kommen über moduleLinks (shared/utils/moduleLinks.ts).
 */
export interface OrgaPage { to: string, label: string }
export interface OrgaGroup { label: string, pages: OrgaPage[] }

export const ORGA_GROUPS: OrgaGroup[] = [
  { label: 'Übersicht', pages: [{ to: '/orga', label: 'Übersicht' }] },
  { label: 'Event', pages: [
    { to: '/orga/teilnehmer', label: 'Teilnehmer' },
    { to: '/orga/sitzplan', label: 'Sitzplan' },
    { to: '/orga/warteliste', label: 'Warteliste' },
    { to: '/orga/buchung', label: 'Buchung' },
  ] },
  { label: 'Kommunikation', pages: [
    { to: '/orga/nachrichten', label: 'Nachrichten' },
    { to: '/orga/discord', label: 'Discord' },
  ] },
  { label: 'Verwaltung', pages: [
    { to: '/orga/events', label: 'Events' },
    { to: '/orga/kontakte', label: 'Kontaktpersonen' },
    { to: '/orga/protokoll', label: 'Protokoll' },
    { to: '/orga/daten', label: 'Import/Export' },
  ] },
]

/** die Gruppe, zu der path gehört; sonst die erste */
export function activeOrgaGroup(path: string) {
  const p = path.replace(/\/$/, '') || '/'
  return ORGA_GROUPS.find(g => g.pages.some(page => page.to === p)) ?? ORGA_GROUPS[0]!
}
