/**
 * Jede Minute (nitro.scheduledTasks in nuxt.config.ts): abgelaufene Platzangebote weitergeben und fällige
 * Erinnerungen einreihen. Was schon verschickt wurde, verhindert der Dedupe-Schlüssel, auch nach einem Neustart.
 */
export default defineTask({
  meta: { name: 'registrierung:takt', description: 'Erinnerungen und Warteliste' },
  run() {
    try {
      return { result: registrationTick() as Record<string, unknown> }
    }
    catch (e) {
      console.error('[takt]', e)
      return { result: { error: e instanceof Error ? e.message : String(e) } as Record<string, unknown> }
    }
  },
})
