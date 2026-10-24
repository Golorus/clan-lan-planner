/**
 * Seiten von Modulen im Planner einrahmen (ModuleFrame.vue, ModuleEmbeds.vue). Nur Pfade, die ein Modul in
 * runtimeConfig.csp.frameSelf nennt, dürfen in einen Rahmen, und nur auf derselben Seite; alle anderen nie.
 */

/** Seite eines Moduls, die es in einen Bereich des Planners hängt (app.config.ts: moduleEmbeds.<bereich>) */
export interface ModuleEmbed {
  /** Seite des Moduls (muss in runtimeConfig.csp.frameSelf stehen) */
  src: string
  /** Überschrift zum Aufklappen und Titel des Rahmens */
  title: string
  /** ein Satz darunter, was es dort gibt */
  hint?: string
  /** Schalter in runtimeConfig.public; nur bei false fehlt es (wie bei moduleLinks) */
  flag?: string
  /** gleich aufgeklappt und geladen, statt erst beim Aufklappen */
  open?: boolean
}

/** darf path eingerahmt werden? Einträge mit „/“ am Ende gelten für alles darunter, sonst nur genau der Pfad */
export function framableBy(path: string, frameSelf: readonly string[] | undefined) {
  const p = path.split('?')[0]!
  return (frameSelf ?? []).some(f => f.endsWith('/') ? p.startsWith(f) : p === f)
}

export function visibleEmbeds(embeds: readonly ModuleEmbed[] | undefined, pub: Record<string, unknown>) {
  return (embeds ?? []).filter(e => !e.flag || pub[e.flag] !== false)
}
