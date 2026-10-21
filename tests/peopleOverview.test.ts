import { describe, expect, it } from 'vitest'
import type { Reach, Stage } from '../shared/utils/participantStage'
import { peopleOverview, type OverviewPerson } from '../shared/utils/peopleOverview'

const ok: Reach = { state: 'ok', label: 'Info angekommen', kind: 'registrierung', at: null, error: null }
const fail: Reach = { state: 'fehler', label: 'Buchung: Fehler', kind: 'buchung', at: null, error: 'x' }
const p = (nick: string, stage: Stage, extra: Partial<OverviewPerson> = {}): OverviewPerson =>
  ({ nick, stage, reach: ok, seat: stage === 'platziert' || stage === 'gebucht' ? 'A-1' : null, approvalPending: false, ...extra })
const opts = { title: 'Deine Leute', eventName: 'LAN 2026', bookingReleased: true }

const people = [
  p('Anna', 'gebucht'), p('Ben', 'platziert', { reach: fail }), p('Cem', 'zugesagt'), p('Dora', 'eingeladen'),
  p('Emil', 'offen'), p('Fred', 'warteliste'), p('Gina', 'abgesagt'), p('Hans', 'nicht'), p('Ida', 'nicht', { approvalPending: true }),
]

describe('/leute: Stand der Leute als Text', () => {
  it('zeigt standardmäßig, was noch fehlt', () => {
    const t = peopleOverview(people, { ...opts, filter: 'offen' })
    expect(t).toContain('**Deine Leute · LAN 2026**')
    expect(t).toContain('gebucht 1 · platziert 1 · zugesagt 1 · eingeladen 1 · offen 1 · Warteliste 1 · abgesagt 1 · Freigabe offen 1')
    expect(t).toContain('**Warten auf Freigabe (1)**\nIda')
    expect(t).toContain('**Noch nicht zugesagt (2)**\n• Dora (eingeladen)\n• Emil (offen)')
    expect(t).toContain('**Zugesagt, noch nicht gebucht (2)**\n• Ben (Platz A-1 · ⚠️ Buchung: Fehler)\n• Cem (zugesagt)')
    expect(t).toContain('**Warteliste (1)**\nFred')
    expect(t).not.toContain('Anna')
    expect(t).not.toContain('Gina')
    expect(t).not.toContain('Hans')
  })

  it('filtert auf noch nicht gebucht und nennt fehlende Freigabe der Buchung', () => {
    const t = peopleOverview(people, { ...opts, bookingReleased: false, filter: 'nicht_gebucht' })
    expect(t).toContain('**Zugesagt (Buchung noch nicht freigegeben) (2)**')
    expect(t).not.toContain('Dora')
  })

  it('zeigt nur nicht Erreichte', () => {
    const t = peopleOverview(people, { ...opts, filter: 'unerreicht' })
    expect(t).toContain('Ben')
    expect(t).not.toContain('Cem')
  })

  it('alle: auch Gebuchte, Abgesagte und Leute außerhalb des Events, mit Link', () => {
    const t = peopleOverview(people, { ...opts, filter: 'alle', link: 'https://x/orga/teilnehmer' })
    expect(t).toContain('**Gebucht (1)**\nAnna')
    expect(t).toContain('**Abgesagt (1)**\nGina')
    expect(t).toContain('**Nicht im Event (1)**\nHans')
    expect(t.endsWith('Ganze Liste: <https://x/orga/teilnehmer>')).toBe(true)
  })

  it('meldet, wenn nichts mehr fehlt', () => {
    expect(peopleOverview([p('Anna', 'gebucht')], { ...opts, filter: 'offen' })).toContain('✅ Alle sind durch')
    expect(peopleOverview([], { ...opts, filter: 'offen' })).toContain('noch keine Leute')
  })

  it('bleibt bei vielen Leuten unter 2000 Zeichen und zählt den Rest', () => {
    const many = Array.from({ length: 200 }, (_, i) => p(`Spieler-mit-langem-Namen-${i}`, i % 2 ? 'eingeladen' : 'zugesagt'))
    const t = peopleOverview(many, { ...opts, filter: 'offen', link: 'https://x/orga/teilnehmer' })
    expect(t.length).toBeLessThanOrEqual(2000)
    expect(t).toMatch(/\*\*Noch nicht zugesagt \(100\)\*\*[\s\S]*… und \d+ weitere/)
    expect(t).toMatch(/\*\*Zugesagt, noch nicht gebucht \(100\)\*\*[\s\S]*… und \d+ weitere/)
    expect(t).toContain('Ganze Liste')
  })
})
