/**
 * Nur in der QA-Umgebung (NUXT_PUBLIC_DEMO=true): als Demo-Person anmelden, ohne Discord.
 * /auth/demo?as=orga|kontakt|teilnehmer|neu; sonst 404.
 */
export default defineEventHandler(async (event) => {
  if (!demoMode()) throw createError({ statusCode: 404 })
  const as = getQuery(event).as
  if (typeof as !== 'string' || !(as in DEMO_IDS)) throw createError({ statusCode: 400, statusMessage: 'Unbekannte Demo-Person' })
  const user = demoUser(as as DemoPersona)
  await setUserSession(event, { user: { ...user, isLeader: await isLeader(user.discordId) }, loggedInAt: new Date().toISOString() })
  return sendRedirect(event, as === 'orga' ? '/orga' : '/')
})
