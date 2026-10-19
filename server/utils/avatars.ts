import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'

/**
 * Discord-Avatare liegen bei uns und werden von uns ausgeliefert (/avatar/<personen-id>), nicht vom Discord-CDN:
 * schneller, keine Rate-Limits, geht auch bei schwachem Internet vor Ort. Geholt wird bei jedem Login, als PNG 128 px.
 * Gespeichert ist je Person nur der Hash (für die Adresse), das Bild unter <uploadDir>/avatars/<discord-id>.png.
 */

const DISCORD_ID = /^\d{5,25}$/
const AVATAR_HASH = /^(a_)?[0-9a-f]{32}$/
const MAX_BYTES = 512 * 1024

function avatarDir() {
  return join(resolve(useRuntimeConfig().uploadDir), 'avatars')
}

function avatarFile(discordId: string) {
  if (!DISCORD_ID.test(discordId)) throw new Error('Ungültige Discord-ID')
  return join(avatarDir(), `${discordId}.png`)
}

/**
 * Adresse für die Oberfläche: über die Personen-ID, damit keine Discord-ID im Sitzplan steht;
 * ?v= wechselt mit dem Bild, damit der Browser-Cache nicht stört
 */
export function avatarUrl(personId: number | null | undefined, hash: string | null) {
  return personId && hash ? `/avatar/${personId}?v=${hash.slice(-8)}` : null
}

/** Avatar von Discord holen und ablegen (oder entfernen, wenn es keinen gibt); Fehler sind nicht schlimm */
export async function refreshAvatar(discordId: string, hash: string | null | undefined) {
  const now = new Date()
  try {
    if (!hash || !AVATAR_HASH.test(hash)) {
      await removeAvatar(discordId)
      return null
    }
    const res = await fetch(`https://cdn.discordapp.com/avatars/${discordId}/${hash}.png?size=128`)
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/png')) throw new Error(`CDN ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Bild zu groß')
    await mkdir(avatarDir(), { recursive: true })
    await writeFile(avatarFile(discordId), bytes)
    const db = useDb()
    db.update(tables.users).set({ avatar: hash }).where(eq(tables.users.discordId, discordId)).run()
    db.update(tables.persons).set({ avatar: hash, updatedAt: now }).where(eq(tables.persons.discordId, discordId)).run()
    return hash
  }
  catch (e) {
    console.error('[avatar] nicht geholt:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function readAvatar(discordId: string) {
  if (!DISCORD_ID.test(discordId)) return null
  try {
    return await readFile(avatarFile(discordId))
  }
  catch {
    return null
  }
}

/** Bild und gespeicherten Hash entfernen (z. B. „Meine Daten löschen“) */
export async function removeAvatar(discordId: string) {
  if (!DISCORD_ID.test(discordId)) return
  await rm(avatarFile(discordId), { force: true })
  const db = useDb()
  db.update(tables.users).set({ avatar: null }).where(eq(tables.users.discordId, discordId)).run()
  db.update(tables.persons).set({ avatar: null }).where(eq(tables.persons.discordId, discordId)).run()
}
