/**
 * Links, die Module (layers/*) in die Kopfleiste und die Orga-Reiter hängen, über app.config.ts:
 * moduleLinks.header / moduleLinks.orga. So muss der Planner selbst kein Modul kennen.
 */
export interface ModuleLink {
  to: string
  label: string
  title?: string
  /** Schalter in runtimeConfig.public; nur bei false fehlt der Link (leer in der .env = an) */
  flag?: string
}

export function visibleLinks(links: readonly ModuleLink[] | undefined, pub: Record<string, unknown>) {
  return (links ?? []).filter(l => !l.flag || pub[l.flag] !== false)
}
