import { describe, expect, it } from 'vitest'
import { checkConfig, type ConfigInput } from '../server/utils/configCheck'

const OK: ConfigInput = {
  appUrl: 'https://planner.example.de/',
  sessionPassword: 'x'.repeat(48),
  leaderDiscordId: '410000000000000001',
  oauth: { clientId: '410000000000000009', clientSecret: 'geheim-geheim', redirectURL: 'https://planner.example.de/auth/discord' },
  botToken: `${'A'.repeat(24)}.${'B'.repeat(6)}.${'C'.repeat(38)}`,
  guildId: '410000000000000100',
  orgaRoleId: '444444444444444444',
  eventRoleIdEnv: '555555555555555555',
  eventRoleIdOrga: null,
  publicKey: 'ab'.repeat(32),
}
const level = (input: ConfigInput, key: string) => checkConfig(input).find(c => c.key === key)?.level
const text = (input: ConfigInput, key: string) => checkConfig(input).find(c => c.key === key)?.text ?? ''

describe('checkConfig', () => {
  it('vollständige Einrichtung: alles grün', () => {
    expect(checkConfig(OK).filter(c => c.level !== 'ok')).toEqual([])
  })

  it('nennt nie geheime Werte', () => {
    const all = JSON.stringify(checkConfig(OK))
    expect(all).not.toContain(OK.botToken)
    expect(all).not.toContain(OK.oauth.clientSecret)
    expect(all).not.toContain(OK.sessionPassword)
  })

  it('Sitzungs-Passwort zu kurz', () => {
    expect(level({ ...OK, sessionPassword: 'kurz' }, 'session')).toBe('error')
  })

  it('ohne DOMAIN: Links auf localhost sind auf dem Server ein Fehler, lokal nicht', () => {
    expect(level({ ...OK, appUrl: 'http://localhost:3000/' }, 'app-url')).toBe('error')
    expect(level({ ...OK, appUrl: 'http://localhost:3000/', dev: true }, 'app-url')).toBe('ok')
  })

  it('Redirect-URL passt nicht zur Domain', () => {
    expect(level({ ...OK, oauth: { ...OK.oauth, redirectURL: 'https://anders.example.de/auth/discord' } }, 'oauth-redirect')).toBe('warn')
    expect(level({ ...OK, oauth: { ...OK.oauth, redirectURL: 'https://planner.example.de/auth/discord/' } }, 'oauth-redirect')).toBe('ok')
  })

  it('Bot: ganz ohne ist eine Warnung, halb eingerichtet ein Fehler', () => {
    expect(level({ ...OK, botToken: '', guildId: '' }, 'bot')).toBe('warn')
    expect(level({ ...OK, guildId: '' }, 'bot')).toBe('error')
    expect(text({ ...OK, guildId: '' }, 'bot')).toContain('NUXT_DISCORD_GUILD_ID')
    expect(level({ ...OK, botToken: 'kein-token' }, 'bot')).toBe('error')
  })

  it('Orga- und Event-Rolle gleich: Fehler, keine einzelnen Rollen-Meldungen', () => {
    const same = { ...OK, eventRoleIdEnv: OK.orgaRoleId }
    expect(level(same, 'roles')).toBe('error')
    expect(level(same, 'orga-role')).toBeUndefined()
    // auch, wenn die gleiche ID in /orga gesetzt wurde
    expect(level({ ...OK, eventRoleIdOrga: OK.orgaRoleId }, 'roles')).toBe('error')
  })

  it('Event-Rolle aus /orga gilt vor der aus der .env', () => {
    expect(text({ ...OK, eventRoleIdOrga: '666666666666666666' }, 'event-role')).toContain('in /orga gesetzt')
    expect(text(OK, 'event-role')).toContain('aus der .env')
  })

  it('fehlende Rollen sind Warnungen, kaputte IDs Fehler', () => {
    expect(level({ ...OK, orgaRoleId: '' }, 'orga-role')).toBe('warn')
    expect(level({ ...OK, eventRoleIdEnv: '' }, 'event-role')).toBe('warn')
    expect(level({ ...OK, orgaRoleId: '123' }, 'orga-role')).toBe('error')
  })

  it('Public Key: leer = nur Links, falsches Format = Fehler', () => {
    expect(level({ ...OK, publicKey: '' }, 'public-key')).toBe('warn')
    expect(level({ ...OK, publicKey: 'xyz' }, 'public-key')).toBe('error')
  })

  it('ohne Notzugang: Warnung', () => {
    expect(level({ ...OK, leaderDiscordId: '' }, 'leader')).toBe('warn')
  })
})
