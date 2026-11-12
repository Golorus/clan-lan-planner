/**
 * Modul „Game Planner“: gemeinsame Spielrunden vor Ort in Discord (/spielen, /spiele, Karten mit „Bin dabei“)
 * und /orga › Spiele (Spielkanal, Spieleliste). Die Tabellen liegen in der Migrationskette des Planners
 * (server/database/schema.ts: games, game_modes, game_rounds, game_round_players).
 * Abschalten mit NUXT_PUBLIC_GAME_PLANNER=false.
 */
export default defineNuxtConfig({
  runtimeConfig: {
    /**
     * Spiele, die beim Start angelegt werden, falls es sie noch nicht gibt (Name ohne Groß-/Kleinschreibung).
     * Ein einbindendes Projekt ergänzt die Liste in seiner nuxt.config (Listen werden aneinandergehängt, gleiche Namen
     * zählen einmal); einmal Angelegtes ändert die Orga mit /spiele ändern.
     */
    gamesSeed: [
      { name: 'Counter-Strike 2', modes: [{ name: 'Premier (5er-Stack)', max: 5 }, { name: 'Wingman (2er-Stack)', max: 2 }, { name: '5 gegen 5 intern', max: 10, min: 6 }] },
      { name: 'Dota 2', modes: [{ name: '5-Stack', max: 5 }, { name: '5 gegen 5 intern', max: 10, min: 10 }] },
    ] as { name: string, modes: { name: string, max: number, min?: number }[] }[],
    public: {
      /** Game Planner an/aus (Befehle, Knöpfe, /orga/spiele) */
      gamePlanner: true,
    },
  },
})
