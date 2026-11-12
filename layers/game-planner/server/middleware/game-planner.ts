/** Ist der Game Planner abgeschaltet (NUXT_PUBLIC_GAME_PLANNER=false), gibt es seine Seite und APIs nicht. */
export default defineEventHandler((event) => {
  if (useRuntimeConfig(event).public.gamePlanner !== false) return
  const path = event.path.split('?')[0]!
  if (path === '/orga/spiele' || path.startsWith('/api/orga/spiele')) {
    throw createError({ statusCode: 404, statusMessage: 'Nicht gefunden' })
  }
})
