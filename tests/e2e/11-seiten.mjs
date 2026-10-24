import { BASE, check, expectStatus } from './lib.mjs'

/** Jede Orga-Seite wird für die Orga ausgeliefert (mit Navigation und Überschrift), für andere nicht */
const PAGES = [
  ['/orga', 'Übersicht', 'Übersicht'],
  ['/orga/teilnehmer', 'Teilnehmer', 'Event'],
  ['/orga/sitzplan', 'Sitzplan', 'Event'],
  ['/orga/warteliste', 'Warteliste', 'Event'],
  ['/orga/buchung', 'Buchung', 'Event'],
  ['/orga/nachrichten', 'Nachrichten', 'Kommunikation'],
  ['/orga/discord', 'Discord', 'Kommunikation'],
  ['/orga/events', 'Events', 'Verwaltung'],
  ['/orga/kontakte', 'Kontaktpersonen', 'Verwaltung'],
  ['/orga/protokoll', 'Protokoll', 'Verwaltung'],
  ['/orga/daten', 'Import/Export', 'Verwaltung'],
]

export default async function (ctx) {
  const { leader, rot } = ctx
  console.log('Orga-Seiten')
  for (const [path, title, group] of PAGES) {
    const page = await expectStatus(leader.get(path), 200, `${path} lädt`)
    const h1 = /<h1[^>]*>([^<]*)<\/h1>/.exec(page.text)?.[1]?.trim()
    const activeGroup = /<nav class="orga-nav"[\s\S]*?<a[^>]*class="[^"]*\bactive\b[^"]*"[^>]*>([^<]*)<\/a>/.exec(page.text)?.[1]?.trim()
    check(h1 === title && activeGroup === group, `${path}: Überschrift „${h1}“, Gruppe „${activeGroup}“`)
  }
  // Checkliste der Übersicht: Bereich blocken und fixieren, abgehakt genau dann, wenn der Bereich fixiert ist
  const overview = (await leader.get('/orga')).text
  const areaFixed = !!(await leader.get('/api/sitzplan')).data.area?.fixed
  const areaItem = /<li([^>]*)>\s*Nach der Bedarfsabfrage:[\s\S]*?Bereich blocken lassen/.exec(overview)
  check(!!areaItem && /class="done"/.test(areaItem[1]) === areaFixed, `Checkliste: „Bereich blocken“ steht drin, ${areaFixed ? 'abgehakt (fixiert)' : 'offen (nicht fixiert)'}`)
  // alte Adressen führen auf die Seiten, in denen sie aufgegangen sind
  for (const [old, title] of [['/orga/personen', 'Teilnehmer'], ['/orga/zusagen', 'Buchung']]) {
    const page = await leader.get(old)
    const h1 = /<h1[^>]*>([^<]*)<\/h1>/.exec(page.text)?.[1]?.trim()
    check(page.status === 200 && h1 === title, `${old} leitet weiter auf „${title}“ (${page.status}, „${h1}“)`)
  }
  // die Teilnehmer-Liste zeigt alle Personen, auch die nicht im Event
  const tn = await leader.get('/orga/teilnehmer')
  for (const label of ['offen', 'eingeladen', 'zugesagt', 'platziert', 'gebucht', 'Warteliste', 'abgesagt', 'nicht im Event', 'Erreicht']) {
    check(tn.text.includes(label), `Teilnehmer-Liste kennt „${label}“`)
  }
  // Seiten des Planners dürfen nie in einen Rahmen (nur Pfade, die Module in runtimeConfig.csp.frameSelf nennen)
  const framed = await fetch(BASE + '/orga')
  check(framed.headers.get('x-frame-options') === 'DENY', `/orga: X-Frame-Options ${framed.headers.get('x-frame-options')}`)
  for (const path of ['/orga', '/orga/teilnehmer', '/orga/discord']) {
    await expectStatus(rot.get(path), 403, `Kontaktperson öffnet ${path}`)
  }
}
