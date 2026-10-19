// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  modules: ['nuxt-auth-utils'],

  app: {
    head: {
      htmlAttrs: { lang: 'de' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      // Farben für alle Seiten, auch die Module (layers/)
      link: [{ rel: 'stylesheet', href: '/theme.css' }],
    },
  },

  // Alles hier lässt sich zur Laufzeit per Umgebungsvariable setzen (NUXT_…), siehe .env.example
  runtimeConfig: {
    /** Discord-User-ID des Projektleiters: kommt immer in /orga (Notzugang neben der Orga-Rolle) */
    leaderDiscordId: '',
    /** Adresse der App für {link} in Nachrichten; leer = https://<DOMAIN>/ aus der .env */
    appUrl: '',
    /** SQLite-Datei und Upload-Ordner (im Container: Volumes) */
    dbPath: './data/db/planner.sqlite',
    uploadDir: './data/uploads',
    migrationsDir: './server/database/migrations',
    /** zusätzliche Skript-Quellen für die CSP (server/middleware/security-headers.ts), von Modulen ergänzt */
    csp: { scriptSrc: [] as string[] },
    discord: {
      botToken: '',
      guildId: '',
      /** Discord-Rolle, deren Mitglieder in /orga dürfen (zusätzlich zu leaderDiscordId) */
      orgaRoleId: '',
      /** Clan-Rolle: wer sie hat, darf ohne Freigabe mitmachen; leer = jedes Mitglied des Servers (server/utils/freigabe.ts) */
      memberRoleId: '',
      /** Event-Rolle: der Bot gibt sie den Zugesagten des aktuellen Events (in /orga änderbar); nie die Orga-Rolle */
      eventRoleId: '',
      /** Public Key der Discord-Anwendung, prüft die Signatur von /api/discord/interactions */
      publicKey: '',
    },
    public: {
      /** QA-Umgebung: Demo-Daten, Anmelden als Demo-Person, Hinweis „Testdaten“ (NUXT_PUBLIC_DEMO=true, deploy/qa/) */
      demo: false,
      /** Name der App (Kopfzeile, Seitentitel, Test-DM): NUXT_PUBLIC_APP_NAME; leer = „Clan LAN Planner“ */
      appName: '',
      /** wie die Event-Rolle in Texten heißt: NUXT_PUBLIC_EVENT_ROLE_NAME; leer = „Event-Rolle“ */
      eventRoleName: '',
      /** Impressum (/impressum): NUXT_PUBLIC_IMPRESSUM_NAME, _STREET, _CITY, _EMAIL, _NOTE */
      impressum: { name: '', street: '', city: '', email: '', note: '' },
    },
    session: {
      name: 'lan-planner-session',
      password: '',
      maxAge: 60 * 60 * 24 * 30, // 30 Tage
    },
    oauth: {
      discord: {
        clientId: '',
        clientSecret: '',
        redirectURL: '',
      },
    },
  },

  // alte Orga-Seiten: Personen und Zusagen sind in „Teilnehmer“ bzw. „Buchung“ aufgegangen
  routeRules: {
    '/orga/personen': { redirect: '/orga/teilnehmer' },
    '/orga/zusagen': { redirect: '/orga/buchung' },
  },

  nitro: {
    // Erinnerungen und Warteliste: server/tasks/registrierung/takt.ts jede Minute
    experimental: { tasks: true },
    scheduledTasks: { '* * * * *': ['registrierung:takt'] },
  },
})
