/** Ist das Inventar abgeschaltet (NUXT_PUBLIC_INVENTAR=false), gibt es seine Seiten und APIs nicht. */
const PATHS = ['/packen', '/orga/inventar', '/api/packen', '/api/inventar', '/api/orga/inventar']

export default defineEventHandler((event) => {
  if (useRuntimeConfig(event).public.inventar !== false) return
  const path = event.path.split('?')[0]!
  if (PATHS.some(p => path === p || path.startsWith(p + '/'))) {
    throw createError({ statusCode: 404, statusMessage: 'Nicht gefunden' })
  }
})
