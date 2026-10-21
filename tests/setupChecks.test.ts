import { describe, expect, it } from 'vitest'
import { moduleSetupChecks, registerSetupCheck } from '../server/utils/setupChecks'

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
})
