// Hilfen für den End-to-End-Test (tests/e2e/index.mjs): angemeldete Personen, Prüfungen, signierte Discord-Knöpfe.
import { createPrivateKey, createPublicKey, sign } from 'node:crypto'
export const BASE = process.env.BASE || 'http://localhost:3000'
/** Name des Session-Cookies; ein einbindendes Repo kann ihn ändern (runtimeConfig.session.name) */
export const SESSION_COOKIE = process.env.E2E_SESSION_COOKIE || 'lan-planner-session'

export const problems = []
export const check = (ok, what) => { console.log((ok ? '  ok   ' : '  FEHLER ') + what); if (!ok) problems.push(what) }

/** Eine angemeldete Person mit eigenem Session-Cookie */
export async function login(as, name, orga = !as) {
  const res = await fetch(`${BASE}/auth/dev-login${as ? `?as=${as}&name=${encodeURIComponent(name)}` : ''}`, { redirect: 'manual' })
  const cookie = (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).find(c => c.startsWith(SESSION_COOKIE + '='))
  if (!cookie) throw new Error('dev-login hat kein Cookie gesetzt – läuft „npm run dev“?')
  // die Orga handelt wie von einer /orga-Seite aus (Orga-Rechte gelten nur dort, shared/utils/orgaContext.ts)
  return client(cookie, name, orga)
}

export function client(cookie, name, orga = false) {
  async function call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(orga ? { 'x-lan-planner-orga': '1' } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let data = text
    try { data = JSON.parse(text) } catch { /* CSV o. ä. */ }
    return { status: res.status, data, text }
  }
  return {
    name,
    get: p => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b),
    put: (p, b) => call('PUT', p, b),
    del: p => call('DELETE', p),
  }
}

export async function expectStatus(promise, status, what) {
  const res = await promise
  check(res.status === status, `${what} → ${res.status}${res.status !== status ? ` (erwartet ${status}: ${res.data?.statusMessage ?? res.text.slice(0, 120)})` : ''}`)
  return res
}

// realistische Discord-IDs (17–20 Ziffern)
export const ID = { rot: '410000000000002001', blau: '410000000000002002', anna: '410000000000003001', ben: '410000000000003002', cem: '410000000000003003', dana: '410000000000003004', eli: '410000000000003005', fritz: '410000000000003006', gina: '410000000000003007' }
export const ALL_IDS = new RegExp(Object.values(ID).join('|'))

// fester Test-Schlüssel für signierte Discord-Interactions (nur für diesen Test, nirgends sonst verwenden)
export const TEST_KEY = createPrivateKey({ key: Buffer.from('302e020100300506032b657004220420' + '11'.repeat(32), 'hex'), format: 'der', type: 'pkcs8' })
export const TEST_PUBLIC_KEY = createPublicKey(TEST_KEY).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
export async function interaction(body, signed = true) {
  const raw = JSON.stringify(body)
  const ts = String(Math.floor(Date.now() / 1000))
  const headers = { 'content-type': 'application/json', 'x-signature-timestamp': ts }
  if (signed) headers['x-signature-ed25519'] = sign(null, Buffer.from(ts + raw), TEST_KEY).toString('hex')
  const res = await fetch(BASE + '/api/discord/interactions', { method: 'POST', headers, body: raw })
  return { status: res.status, data: await res.json().catch(() => null) }
}
