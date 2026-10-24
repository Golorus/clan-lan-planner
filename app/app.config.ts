import type { ModuleLink } from '#shared/utils/moduleLinks'
import type { ModuleEmbed } from '#shared/utils/moduleFrames'

// Module (layers/*) ergänzen hier ihre Links; Listen aus mehreren app.config.ts werden aneinandergehängt
export default defineAppConfig({
  moduleLinks: {
    header: [] as ModuleLink[],
    orga: [] as ModuleLink[],
  },
  /** Seiten von Modulen, die andere Seiten einbinden, je Bereich: <ModuleEmbeds area="…" /> (shared/utils/moduleFrames.ts) */
  moduleEmbeds: {} as Record<string, ModuleEmbed[]>,
})
