import { createPublicKey, verify } from 'node:crypto'

/**
 * Prüft die Signatur, mit der Discord jede Anfrage an /api/discord/interactions unterschreibt (Ed25519 über
 * Zeitstempel + Rohtext, Public Key der Anwendung). Reiner Code mit node:crypto, ohne Nuxt (vitest).
 * Zusätzlich muss der Zeitstempel frisch sein, damit niemand alte Anfragen wiederholen kann.
 */

/** DER-Vorspann eines Ed25519-Public-Keys (SubjectPublicKeyInfo), davor kommen die 32 Byte von Discord */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const MAX_AGE_S = 5 * 60

export function verifyDiscordSignature(publicKeyHex: string, signatureHex: string | undefined, timestamp: string | undefined,
  rawBody: string, nowMs = Date.now()) {
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex) || !signatureHex || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_AGE_S) return false
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki' })
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, 'hex'))
  }
  catch {
    return false
  }
}
