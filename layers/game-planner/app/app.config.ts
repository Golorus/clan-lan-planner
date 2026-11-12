import type { ModuleLink } from '#shared/utils/moduleLinks'

export default defineAppConfig({
  moduleLinks: {
    orga: [{ to: '/orga/spiele', label: 'Spiele', title: 'Game Planner: Spielkanal und Spieleliste', flag: 'gamePlanner' }] as ModuleLink[],
  },
})
