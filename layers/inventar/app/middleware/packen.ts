/** /packen…: wie /anleitung für alle, die in den Planner dürfen; sonst Anmeldung bzw. Startseite */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!useUserSession().loggedIn.value) return navigateTo('/auth/discord?redirect=' + encodeURIComponent(to.fullPath), { external: true })
  const { access } = await useRequestFetch()<{ access: string }>('/api/freigabe')
  if (access !== 'ok') return navigateTo('/')
})
