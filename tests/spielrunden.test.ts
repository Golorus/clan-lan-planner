import { describe, expect, it } from 'vitest'
import { utcToBerlinLocal } from '../shared/utils/eventTime'
import {
  gameChoiceLabel, parseRoundButton, parseRoundTime, remindAtFor, roundButtons, roundCardText, sortGames, type RoundView,
} from '../shared/utils/spielrunden'

// Fr 20.11.2026, 19:00 in Berlin (Winterzeit, UTC+1)
const NOW = new Date('2026-11-20T18:00:00Z')
const at = (input: string) => {
  const r = parseRoundTime(input, NOW)
  if ('error' in r) throw new Error(r.error)
  return utcToBerlinLocal(r.at)
}

describe('Uhrzeit für /spielen', () => {
  it('versteht jetzt, relative Angaben und Uhrzeiten', () => {
    expect(at('')).toBe('2026-11-20T19:00')
    expect(at('jetzt')).toBe('2026-11-20T19:00')
    expect(at('in 30 min')).toBe('2026-11-20T19:30')
    expect(at('in 45')).toBe('2026-11-20T19:45')
    expect(at('+15')).toBe('2026-11-20T19:15')
    expect(at('in 1,5 h')).toBe('2026-11-20T20:30')
    expect(at('20:30')).toBe('2026-11-20T20:30')
    expect(at('20.30')).toBe('2026-11-20T20:30')
    expect(at('21 Uhr')).toBe('2026-11-20T21:00')
  })

  it('eine vergangene Uhrzeit gilt für morgen, eben vergangene noch für heute', () => {
    expect(at('01:30')).toBe('2026-11-21T01:30')
    expect(at('18:58')).toBe('2026-11-20T18:58')
  })

  it('lehnt Unsinn und zu weit Entferntes ab', () => {
    expect('error' in parseRoundTime('25:00', NOW)).toBe(true)
    expect('error' in parseRoundTime('morgen irgendwann', NOW)).toBe(true)
    expect('error' in parseRoundTime('in 30 h', NOW)).toBe(true)
  })

  it('erinnert 15 Minuten vorher, bei baldigem Start gar nicht', () => {
    expect(remindAtFor(new Date('2026-11-20T19:00:00Z'), NOW)?.toISOString()).toBe('2026-11-20T18:45:00.000Z')
    expect(remindAtFor(new Date('2026-11-20T18:10:00Z'), NOW)).toBeNull()
    expect(remindAtFor(NOW, NOW)).toBeNull()
  })
})

const round = (over: Partial<RoundView> = {}): RoundView => ({
  id: 7, game: 'Counter-Strike 2', mode: 'Wingman (2er-Stack)', number: 1, startsAt: new Date('2026-11-20T19:30:00Z'),
  maxPlayers: 2, minPlayers: null, note: null, createdBy: '111', status: 'offen', players: ['111'], ...over,
})

describe('Karte im Kanal', () => {
  it('zeigt Spiel, Modus, Zeit, Plätze und wer dabei ist', () => {
    const t = roundCardText(round(), NOW)
    expect(t).toContain('**Counter-Strike 2 · Wingman (2er-Stack)**')
    expect(t).toContain('<t:1795203000:t>')
    expect(t).toContain('1/2')
    expect(t).toContain('Dabei: <@111>')
  })

  it('voll: Hinweis auf die nächste Runde, Knopf dafür', () => {
    const full = round({ players: ['111', '222'] })
    expect(roundCardText(full, NOW)).toMatch(/Voll\. Wer noch will/)
    expect(roundCardText({ ...full, nextUrl: 'https://discord.com/channels/1/2/3' }, NOW)).toContain('nächsten Runde: https://discord.com/channels/1/2/3')
    expect(roundButtons(full)[0]!.components[0]!.label).toBe('Bin dabei (nächste Runde)')
  })

  it('zeigt fehlende Mitspieler, Runde 2 und Abgesagtes', () => {
    expect(roundCardText(round({ maxPlayers: 10, minPlayers: 6 }), NOW)).toContain('Es fehlen noch 5.')
    expect(roundCardText(round({ number: 2, prevUrl: 'u' }), NOW)).toMatch(/Runde 2[\s\S]*Runde davor: u/)
    expect(roundCardText(round({ status: 'abgesagt' }), NOW)).toContain('~~')
    expect(roundButtons(round({ status: 'abgesagt' }))).toEqual([])
    expect(roundButtons(round({ status: 'gestartet' }))).toEqual([])
  })

  it('liest die Knöpfe', () => {
    expect(roundButtons(round())[0]!.components.map(c => c.custom_id)).toEqual(['sr:dabei:7', 'sr:raus:7', 'sr:ab:7'])
    expect(parseRoundButton('sr:dabei:7')).toEqual({ action: 'dabei', roundId: 7 })
    expect(parseRoundButton('sr:weg:7')).toBeNull()
    expect(parseRoundButton('st:zu:7')).toBeNull()
  })
})

describe('Spiele in der Auswahl', () => {
  it('zuerst, was diesmal oder letztes Mal lief, dann zuletzt gespielt, dann ABC', () => {
    const list = sortGames([
      { name: 'Zork', playedNow: 0, playedLast: 0, lastPlayedAt: null },
      { name: 'Age of Empires II', playedNow: 0, playedLast: 0, lastPlayedAt: null },
      { name: 'Dota 2', playedNow: 1, playedLast: 3, lastPlayedAt: 5 },
      { name: 'Rocket League', playedNow: 0, playedLast: 0, lastPlayedAt: 9 },
      { name: 'Counter-Strike 2', playedNow: 0, playedLast: 2, lastPlayedAt: 4 },
    ])
    expect(list.map(g => g.name)).toEqual(['Dota 2', 'Counter-Strike 2', 'Rocket League', 'Age of Empires II', 'Zork'])
    expect(gameChoiceLabel(list[0]!)).toBe('Dota 2 · diesmal 1×, letztes Mal 3×')
    expect(gameChoiceLabel(list[3]!)).toBe('Age of Empires II')
  })
})
