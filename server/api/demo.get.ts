/** Demo-Personen für die Anmeldeseite der QA-Umgebung; außerhalb des Demo-Betriebs leer */
export default defineEventHandler(() => {
  if (!demoMode()) return { personas: [] }
  return { personas: Object.entries(DEMO_PERSONAS).map(([key, p]) => ({ key, ...p })) }
})
