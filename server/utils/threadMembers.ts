/**
 * Wer gehört in den privaten Thread eines Events? Orga und Kontaktpersonen immer, dazu alle Zugesagten
 * (= wer die Event-Rolle hat). Reiner Code ohne Nuxt-Auto-Imports (vitest).
 *
 * Entfernt wird nur, wen der Planner kennt und der nicht (mehr) zugesagt hat (removable). Wen jemand in Discord
 * von Hand dazugeholt hat, lässt der Abgleich in Ruhe; den Bot selbst sowieso.
 */
export interface ThreadPlan { add: { discordId: string, nick: string }[], remove: string[] }

export function threadChanges(want: Map<string, string>, have: string[], botId: string | null, removable: Set<string>): ThreadPlan {
  const haveSet = new Set(have)
  return {
    add: [...want].filter(([id]) => !haveSet.has(id) && id !== botId).map(([discordId, nick]) => ({ discordId, nick })),
    remove: have.filter(id => id !== botId && !want.has(id) && removable.has(id)),
  }
}
