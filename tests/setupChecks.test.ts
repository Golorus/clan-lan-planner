import { describe, expect, it } from 'vitest'
import { applyScope, moduleSetupChecks, parseScope, registerSetupCheck } from '../server/utils/setupChecks'

describe('Prüfungen der Module', () => {
  it('sammelt die Prüfungen aller Module', async () => {
    registerSetupCheck('a', () => [{ key: 'a', level: 'ok', text: 'A ok' }])
    registerSetupCheck('b', async () => [{ key: 'b', level: 'warn', text: 'B fehlt' }])
    expect((await moduleSetupChecks()).map(c => c.key)).toEqual(['a', 'b'])
  })

  it('eine kaputte Prüfung wird zum Fehler in der Ampel', async () => {
    registerSetupCheck('kaputt', () => { throw new Error('weg') })
    const c = (await moduleSetupChecks()).find(x => x.key === 'kaputt-failed')
    expect(c?.level).toBe('error')
    expect(c?.text).toContain('weg')
  })

  it('Warnungen zu genutzten Teilen werden Fehler', () => {
    const checks = [
      { key: 'bot', level: 'warn' as const, text: 'kein Bot' },
      { key: 'event-role', level: 'warn' as const, text: 'keine Rolle' },
      { key: 'session', level: 'ok' as const, text: 'ok' },
    ]
    expect(applyScope(checks, ['bot', 'session']).map(c => c.level)).toEqual(['error', 'warn', 'ok'])
    expect(applyScope(checks, []).map(c => c.level)).toEqual(['warn', 'warn', 'ok'])
  })

  it('liest den Umfang als Liste oder aus der .env', () => {
    expect(parseScope(['bot', ' public-key '])).toEqual(['bot', 'public-key'])
    expect(parseScope('bot, event-role,')).toEqual(['bot', 'event-role'])
    expect(parseScope(undefined)).toEqual([])
  })
})
