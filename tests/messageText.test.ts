import { describe, expect, it } from 'vitest'
import { CODE_MASK, MANUAL_PLACEHOLDERS, moveMessageObsolete, renderMessage } from '../shared/utils/messageText'

describe('Platzhalter', () => {
  it('setzt Platzhalter ein und lässt Unbekanntes stehen', () => {
    expect(renderMessage('Hallo {nick}, dein Platz ist {platz}: {link} {unbekannt}', { nick: 'Anna', platz: 'A-12', event: 'X', datum: '1.1.', kontakt: 'Rot', link: 'https://planner.example.de/' }))
      .toBe('Hallo Anna, dein Platz ist A-12: https://planner.example.de/ {unbekannt}')
  })
  it('Rundnachrichten kennen weder Buchungscode noch Angebotsfrist', () => {
    expect(MANUAL_PLACEHOLDERS).not.toContain('code')
    expect(MANUAL_PLACEHOLDERS).not.toContain('angebot_bis')
    expect(renderMessage('Code: {code}', { code: CODE_MASK })).toBe('Code: ••••')
  })
})

describe('moveMessageObsolete', () => {
  it('umgesetzt und dort geblieben: Nachricht geht raus', () => {
    expect(moveMessageObsolete('zugesagt', 'A-82', 'A-81')).toBeNull()
  })
  it('wieder auf dem Platz von vorher: entfällt', () => {
    expect(moveMessageObsolete('zugesagt', 'A-81', 'A-81')).toBe('Sitzt wieder auf dem Platz von vorher.')
  })
  it('vorher ohne Platz, jetzt einer: geht raus', () => {
    expect(moveMessageObsolete('zugesagt', 'A-81', null)).toBeNull()
  })
  it('kein Platz mehr oder abgesagt: entfällt', () => {
    expect(moveMessageObsolete('zugesagt', null, 'A-81')).toBe('Hat keinen Platz mehr.')
    expect(moveMessageObsolete('abgesagt', 'A-82', 'A-81')).toBe('Hat keinen Platz mehr.')
  })
})
