import type { ModuleLink } from '#shared/utils/moduleLinks'
import type { InventarQuelle } from '../shared/inventar'

export default defineAppConfig({
  moduleLinks: {
    header: [{ to: '/packen', label: 'Packen', title: 'Material packen: QR-Code scannen, abzählen', flag: 'inventar' }] as ModuleLink[],
    orga: [{ to: '/orga/inventar', label: 'Inventar', title: 'Inventar: Artikel, Kisten, Packen per QR-Code', flag: 'inventar' }] as ModuleLink[],
  },
  /**
   * Artikelarten anderer Module: ein Modul hängt hier seine Arten an (Listen werden aneinandergehängt), die Orga
   * ordnet Artikel im Inventar einer Art zu, und das Modul liest den Bestand über /api/inventar/bestand?modul=<name>.
   */
  inventarQuellen: [] as InventarQuelle[],
})
