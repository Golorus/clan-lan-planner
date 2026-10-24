/**
 * Reiter der Orga in Gruppen (OrgaNav.vue). Seiten der Module kommen über moduleLinks (shared/utils/moduleLinks.ts).
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

/** die Seite eines Moduls, auf der man gerade ist (dann ist keine Gruppe aktiv) */
export function activeModuleLink<T extends { to: string }>(path: string, links: readonly T[]) {
  const p = path.replace(/\/$/, '') || '/'
  return links.find(l => l.to === p)
}
