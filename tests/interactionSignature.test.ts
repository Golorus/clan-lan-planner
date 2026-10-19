import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyDiscordSignature } from '../server/utils/interactionSignature'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
// so wie Discord ihn anzeigt: die 32 Byte des Schlüssels als Hex
const PUBLIC_HEX = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
const NOW = Date.parse('2026-11-20T12:00:00Z')
const TS = String(NOW / 1000)
const BODY = '{"type":1}'
const signed = (ts: string, body: string) => sign(null, Buffer.from(ts + body), privateKey).toString('hex')

describe('verifyDiscordSignature', () => {
  it('nimmt eine gültige Signatur an', () => {
    expect(verifyDiscordSignature(PUBLIC_HEX, signed(TS, BODY), TS, BODY, NOW)).toBe(true)
  })
  it('lehnt einen veränderten Text ab', () => {
    expect(verifyDiscordSignature(PUBLIC_HEX, signed(TS, BODY), TS, '{"type":2}', NOW)).toBe(false)
  })
  it('lehnt einen anderen Schlüssel ab', () => {
    const other = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
    expect(verifyDiscordSignature(other, signed(TS, BODY), TS, BODY, NOW)).toBe(false)
  })
  it('lehnt alte oder fehlende Zeitstempel ab', () => {
    const old = String(NOW / 1000 - 600)
    expect(verifyDiscordSignature(PUBLIC_HEX, signed(old, BODY), old, BODY, NOW)).toBe(false)
    expect(verifyDiscordSignature(PUBLIC_HEX, signed(TS, BODY), undefined, BODY, NOW)).toBe(false)
  })
  it('lehnt Unsinn ab, ohne zu werfen', () => {
    expect(verifyDiscordSignature(PUBLIC_HEX, 'zz', TS, BODY, NOW)).toBe(false)
    expect(verifyDiscordSignature('', signed(TS, BODY), TS, BODY, NOW)).toBe(false)
    expect(verifyDiscordSignature(PUBLIC_HEX, undefined, TS, BODY, NOW)).toBe(false)
  })
})
