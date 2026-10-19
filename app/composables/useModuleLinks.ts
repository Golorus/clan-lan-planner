import { visibleLinks } from '#shared/utils/moduleLinks'

/** Links der eingeschalteten Module für Kopfleiste und Orga-Reiter (shared/utils/moduleLinks.ts) */
export function useModuleLinks() {
  const { moduleLinks } = useAppConfig()
  const pub = useRuntimeConfig().public as Record<string, unknown>
  return {
    header: visibleLinks(moduleLinks.header, pub),
    orga: visibleLinks(moduleLinks.orga, pub),
  }
}
