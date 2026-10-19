/** Seiten unter /orga: nur für den Projektleiter (die API prüft das zusätzlich auf dem Server) */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()
  if (!loggedIn.value) return navigateTo(`/auth/discord?redirect=${encodeURIComponent(to.fullPath)}`, { external: true })
  if (!user.value?.isLeader) return abortNavigation(createError({ statusCode: 403, statusMessage: 'Nur für den Projektleiter' }))
})
