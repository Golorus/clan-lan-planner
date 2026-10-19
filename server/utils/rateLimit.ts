import type { H3Event } from 'h3'

/** Einfaches Rate-Limit im Speicher (eine Instanz, kein Cluster); zählt Anfragen je Schlüssel im Zeitfenster */
const hits = new Map<string, number[]>()
let lastSweep = Date.now()

/** IP des Besuchers; hinter Traefik ist der letzte Eintrag in X-Forwarded-For der, den Traefik selbst gesetzt hat */
export function clientIp(event: H3Event) {
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  return forwarded?.split(',').at(-1)?.trim() || getRequestIP(event) || 'unbekannt'
}

export function rateLimit(event: H3Event, key: string, limit: number, windowMs: number) {
  const now = Date.now()
  if (now - lastSweep > 10 * 60_000) {
    for (const [k, list] of hits) if (!list.some(t => now - t < 60 * 60_000)) hits.delete(k)
    lastSweep = now
  }
  const list = (hits.get(key) ?? []).filter(t => now - t < windowMs)
  if (list.length >= limit) {
    setHeader(event, 'Retry-After', Math.ceil((windowMs - (now - list[0]!)) / 1000))
    throw createError({ statusCode: 429, statusMessage: 'Zu viele Anfragen – bitte einen Moment warten.' })
  }
  list.push(now)
  hits.set(key, list)
}

/** Für alles, was Teilnehmer selbst auslösen: je Person und je IP (großzügig, auf dem Event teilen sich alle eine IP) */
export function limitParticipant(event: H3Event, discordId: string) {
  rateLimit(event, `user:${discordId}`, 30, 60_000)
  rateLimit(event, `ip:${clientIp(event)}`, 300, 60_000)
}
