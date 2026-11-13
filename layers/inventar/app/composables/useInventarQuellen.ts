import { visibleQuellen, type InventarQuelle } from '../../shared/inventar'

/** Artikelarten der eingeschalteten Module (app.config.ts: inventarQuellen) */
export function useInventarQuellen() {
  const { inventarQuellen } = useAppConfig() as { inventarQuellen?: InventarQuelle[] }
  return visibleQuellen(inventarQuellen, useRuntimeConfig().public as Record<string, unknown>)
}
