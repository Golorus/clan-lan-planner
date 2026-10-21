import { type Reach, type Stage, unreached } from './participantStage'

/**
 * Text für /leute in Discord: wie weit die Leute einer Kontaktperson (oder alle) im aktuellen Event sind.
 * Gruppiert nach dem, was noch zu tun ist; Discord nimmt höchstens 2000 Zeichen, lange Gruppen werden gekürzt.
 * Reiner Code ohne Datenbank, damit er sich testen lässt.
 */

export interface OverviewPerson {
  nick: string
  stage: Stage
  reach: Reach
  seat: string | null
  /** wartet auf Freigabe durch Kontaktperson oder Orga */
  approvalPending: boolean
}

/** offen = alles, was noch fehlt (Standard); alle = auch Gebuchte, Abgesagte und Leute außerhalb des Events */
export type OverviewFilter = 'offen' | 'nicht_zugesagt' | 'nicht_gebucht' | 'unerreicht' | 'alle'

export const OVERVIEW_FILTERS: { value: OverviewFilter, label: string }[] = [
  { value: 'offen', label: 'was noch fehlt' },
  { value: 'nicht_zugesagt', label: 'noch nicht zugesagt' },
  { value: 'nicht_gebucht', label: 'zugesagt, noch nicht gebucht' },
  { value: 'unerreicht', label: 'Nachricht nicht angekommen' },
  { value: 'alle', label: 'alle' },
]

export interface OverviewOptions {
  /** „Deine Leute“, „Leute von Anna“, „Alle“ … */
  title: string
  eventName: string
  filter: OverviewFilter
  bookingReleased: boolean
  /** Link zur ganzen Liste (nur für die Orga) */
  link?: string | null
}

interface Group { key: string, title: string, people: OverviewPerson[], detail: boolean }

const LIMIT = 2000

function line(p: OverviewPerson) {
  const where = p.stage === 'platziert' ? `Platz ${p.seat}` : p.stage === 'gebucht' && p.seat ? `Platz ${p.seat}` : p.stage
  const warn = unreached(p.reach) ? ` · ⚠️ ${p.reach.label}` : p.reach.state === 'offen' ? ` · ${p.reach.label}` : ''
  return `• ${p.nick} (${where}${warn})`
}

export function peopleOverview(people: OverviewPerson[], o: OverviewOptions): string {
  const of = (...s: Stage[]) => people.filter(p => !p.approvalPending && s.includes(p.stage))
  const count = (s: Stage) => people.filter(p => !p.approvalPending && p.stage === s).length
  const head = `**${o.title} · ${o.eventName}**`
  const inEvent = people.filter(p => p.stage !== 'nicht' || p.approvalPending)
  const summary = [
    ['gebucht', count('gebucht')], ['platziert', count('platziert')], ['zugesagt', count('zugesagt')],
    ['eingeladen', count('eingeladen')], ['offen', count('offen')], ['Warteliste', count('warteliste')],
    ['abgesagt', count('abgesagt')], ['Freigabe offen', people.filter(p => p.approvalPending).length],
  ].filter(([, n]) => n).map(([l, n]) => `${l} ${n}`).join(' · ')
  if (!people.length) return `${head}\nHier sind noch keine Leute eingetragen.`

  const notBookedTitle = o.bookingReleased ? 'Zugesagt, noch nicht gebucht' : 'Zugesagt (Buchung noch nicht freigegeben)'
  const all: Group[] = [
    { key: 'freigabe', title: 'Warten auf Freigabe', people: people.filter(p => p.approvalPending), detail: false },
    { key: 'nicht_zugesagt', title: 'Noch nicht zugesagt', people: of('offen', 'eingeladen'), detail: true },
    { key: 'nicht_gebucht', title: notBookedTitle, people: of('zugesagt', 'platziert'), detail: true },
    { key: 'warteliste', title: 'Warteliste', people: of('warteliste'), detail: false },
    { key: 'gebucht', title: 'Gebucht', people: of('gebucht'), detail: false },
    { key: 'abgesagt', title: 'Abgesagt', people: of('abgesagt'), detail: false },
    { key: 'nicht', title: 'Nicht im Event', people: of('nicht'), detail: false },
  ]
  const wanted: Record<OverviewFilter, string[]> = {
    offen: ['freigabe', 'nicht_zugesagt', 'nicht_gebucht', 'warteliste'],
    nicht_zugesagt: ['nicht_zugesagt'],
    nicht_gebucht: ['nicht_gebucht'],
    unerreicht: ['nicht_zugesagt', 'nicht_gebucht', 'warteliste'],
    alle: all.map(g => g.key),
  }
  const groups = all
    .filter(g => wanted[o.filter].includes(g.key))
    .map(g => o.filter === 'unerreicht' ? { ...g, people: g.people.filter(p => unreached(p.reach)), detail: true } : g)
    .filter(g => g.people.length)

  const top = [head, summary || `${inEvent.length} im Event`].join('\n')
  const tail = o.link ? `\nGanze Liste: <${o.link}>` : ''
  if (!groups.length) {
    const none: Record<OverviewFilter, string> = {
      offen: '✅ Alle sind durch, es fehlt nichts mehr.',
      nicht_zugesagt: '✅ Alle haben sich entschieden.',
      nicht_gebucht: '✅ Alle Zugesagten haben gebucht.',
      unerreicht: '✅ Alle Nachrichten sind angekommen.',
      alle: '',
    }
    return `${top}\n\n${none[o.filter]}${tail}`.slice(0, LIMIT)
  }

  // Platz gerecht verteilen: jede Gruppe bekommt ihren Anteil am Rest (was sie nicht braucht, bleibt den folgenden), Überzählige werden gezählt
  let budget = LIMIT - top.length - tail.length - 2
  const parts: string[] = []
  groups.forEach((g, gi) => {
    const avail = Math.floor(budget / (groups.length - gi))
    const items = g.detail ? g.people.map(line) : [g.people.map(p => p.nick).join(', ')]
    let block = `\n**${g.title} (${g.people.length})**`
    for (let i = 0; i < items.length; i++) {
      const next = '\n' + items[i]
      if (g.detail && block.length + next.length > avail - 25) {
        block += `\n… und ${items.length - i} weitere`
        break
      }
      block += next
    }
    if (block.length > avail) block = block.slice(0, Math.max(0, avail - 1)) + '…'
    parts.push(block)
    budget -= block.length
  })
  return `${top}\n${parts.join('\n')}${tail}`.slice(0, LIMIT)
}
