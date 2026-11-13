/**
 * Modul „Inventar“: was der Clan besitzt (Artikel, Kisten/Taschen) und Packen per QR-Code.
 *   /orga/inventar            Artikel und Kisten pflegen, Packstand, QR-Etiketten, gedruckte Packliste
 *   /packen, /packen/k/<id>, /packen/a/<id>   für alle, die in den Planner dürfen: scannen, abzählen
 * Gespeichert wird in der Tabelle docs des Planners (inventar/bestand, inventar/packen), keine eigene Migration.
 * Andere Module melden ihre Artikelarten über app.config.ts an (inventarQuellen, shared/inventar.ts) und lesen
 * den Bestand über /api/inventar/bestand?modul=<name>. Abschalten mit NUXT_PUBLIC_INVENTAR=false.
 */
export default defineNuxtConfig({
  runtimeConfig: {
    /**
     * Artikel, die beim ersten Start angelegt werden, solange es noch kein Inventar gibt.
     * Ein einbindendes Projekt setzt die Liste in seiner nuxt.config; danach pflegt die Orga in /orga/inventar.
     */
    inventarSeed: [] as { name: string, count: number, note?: string, source?: string, key?: string }[],
    public: {
      /** Inventar an/aus (Seiten, APIs, Links) */
      inventar: true,
    },
  },
})
