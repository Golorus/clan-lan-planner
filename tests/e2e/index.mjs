// End-to-End-Test über die echte API: Rechte und Abläufe für Teilnehmer, Kontaktperson, Projektleiter und anonym.
// Bequem mit „npm run test:e2e“ (startet und beendet einen passenden Dev-Server, tests/e2e/run.mjs).
// Gegen einen schon laufenden Dev-Server: „npm run test:e2e:server“ (BASE=http://localhost:3000). Der muss dann
// mit eigener Datenbank, ohne echten Bot und mit dem Test-Schlüssel laufen, siehe run.mjs.
//
// Die Themen bauen aufeinander auf (gleiche Events, Personen, Plätze) und laufen deshalb nur zusammen und in
// dieser Reihenfolge; ctx reicht die gemeinsamen Werte von einer Datei an die nächste weiter.
import { client, ID, login, problems } from './lib.mjs'
import t01 from './01-einrichten.mjs'
import t02 from './02-plaetze.mjs'
import t03 from './03-personen.mjs'
import t04 from './04-nachrichten.mjs'
import t05 from './05-event-und-status.mjs'
import t06 from './06-warteliste.mjs'
import t07 from './07-buchung.mjs'
import t08 from './08-discord.mjs'
import t09 from './09-bereich.mjs'
import t10 from './10-daten-loeschen.mjs'
import t11 from './11-seiten.mjs'
import t13 from './13-freigabe.mjs'

const anon = client(null, 'anonym')
const leader = await login(null, 'Leitung')
const rot = await login(ID.rot, 'Rot')
const blau = await login(ID.blau, 'Blau')
const anna = await login(ID.anna, 'Anna')
const ben = await login(ID.ben, 'Ben')
const cem = await login(ID.cem, 'Cem')

// Der Test vergibt und entfernt Rollen und verschickt Nachrichten: mit echtem Bot träfe das echte Mitglieder
const setup = await leader.get('/api/orga/discord/rollen')
if (setup.status === 403) {
  console.error('Abbruch: Die Anmeldung ohne ?as= ist kein Projektleiter. Bitte mit NUXT_LEADER_DISCORD_ID=<beliebige ID> starten.')
  process.exit(2)
}
if (setup.data?.botConfigured) {
  console.error('Abbruch: Der Dev-Server hat einen echten Discord-Bot (NUXT_DISCORD_BOT_TOKEN). Bitte ohne starten, z. B. NUXT_DISCORD_BOT_TOKEN= NUXT_DISCORD_GUILD_ID= npm run dev')
  process.exit(2)
}

const ctx = { anon, leader, rot, blau, anna, ben, cem }
for (const run of [t01, t02, t03, t04, t05, t06, t07, t08, t09, t10, t11, t13]) await run(ctx)

console.log(problems.length ? `\n${problems.length} Problem(e):\n` + problems.join('\n') : '\nAlles ok.')
process.exit(problems.length ? 1 : 0)
