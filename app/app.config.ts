import type { ModuleLink } from '#shared/utils/moduleLinks'

// Module (layers/*) ergänzen hier ihre Links; Listen aus mehreren app.config.ts werden aneinandergehängt
export default defineAppConfig({
  moduleLinks: {
    header: [] as ModuleLink[],
    orga: [] as ModuleLink[],
  },
})
