// npm run test:e2e – startet einen Dev-Server mit eigener Test-Datenbank und ohne echten Discord-Bot,
// lässt tests/e2e/index.mjs dagegen laufen und beendet ihn wieder. Eine .env im Projekt wird dabei
// nicht benutzt, soweit es um Discord geht: Token, Server, Secret und Rollen werden hier überschrieben.
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createPrivateKey, createPublicKey } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, rmSync, createWriteStream } from 'node:fs'

const PORT = process.env.E2E_PORT || '3130'
const BASE = `http://localhost:${PORT}`
/** eigene Datei für den Lauf; danach als Testdaten zum Ansehen nach VIEW_DB kopiert (lokales npm run dev liest dort) */
const DB = './test-out/e2e.sqlite'
const VIEW_DB = './test-out/sitzplan.sqlite'
const LOG = './test-out/e2e-dev.log'
const sqliteFiles = db => [db, `${db}-wal`, `${db}-shm`]

mkdirSync('./test-out', { recursive: true })
for (const f of sqliteFiles(DB)) rmSync(f, { force: true })

/** Testdaten zum Ansehen bereitstellen; geht nicht, solange ein lokaler Dev-Server die Datei offen hat */
async function publishTestData() {
  for (let i = 0; i < 6; i++) {
    try {
      for (const f of sqliteFiles(VIEW_DB)) rmSync(f, { force: true })
      sqliteFiles(DB).forEach((f, j) => existsSync(f) && copyFileSync(f, sqliteFiles(VIEW_DB)[j]))
      console.log(`Testdaten zum Ansehen: ${VIEW_DB}`)
      return
    }
    catch {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  console.log(`Hinweis: ${VIEW_DB} ist belegt (läuft „npm run dev“?). Die neuen Testdaten liegen in ${DB}; Dev-Server beenden und den Test noch einmal laufen lassen, um sie zu übernehmen.`)
}

// derselbe feste Test-Schlüssel wie in lib.mjs (dort signiert er die Discord-Knöpfe)
const testKey = createPrivateKey({ key: Buffer.from('302e020100300506032b657004220420' + '11'.repeat(32), 'hex'), format: 'der', type: 'pkcs8' })
const publicKey = createPublicKey(testKey).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')

const env = {
  ...process.env,
  NUXT_DB_PATH: DB,
  NUXT_IGNORE_LOCK: '1',
  // Discord: nie der echte Bot; Rollen und Notzugang ausgedacht
  NUXT_DISCORD_BOT_TOKEN: '',
  NUXT_DISCORD_GUILD_ID: '',
  NUXT_OAUTH_DISCORD_CLIENT_SECRET: '',
  NUXT_DISCORD_PUBLIC_KEY: publicKey,
  NUXT_LEADER_DISCORD_ID: '410000000000000001',
  NUXT_DISCORD_ORGA_ROLE_ID: '444444444444444444',
  NUXT_DISCORD_EVENT_ROLE_ID: '',
  // die Ampel-Tests erwarten die Stufen des Planners, nicht den Umfang des einbindenden Projekts
  NUXT_SETUP_SCOPE: '',
}

const log = createWriteStream(LOG)
const server = spawn('npx', ['nuxt', 'dev', '--port', PORT], { env, shell: process.platform === 'win32', detached: process.platform !== 'win32' })
server.stdout.pipe(log)
server.stderr.pipe(log)

function stop() {
  if (server.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else process.kill(-server.pid, 'SIGTERM')
}
process.on('SIGINT', () => {
  stop()
  process.exit(130)
})

let code = 1
try {
  const until = Date.now() + 180_000
  for (;;) {
    if (server.exitCode !== null) throw new Error(`Dev-Server beendet (siehe ${LOG})`)
    if (Date.now() > until) throw new Error(`Dev-Server nicht erreichbar nach 3 Minuten (siehe ${LOG})`)
    const ok = await fetch(`${BASE}/lizenzen`).then(r => r.ok, () => false)
    if (ok) break
    await new Promise(r => setTimeout(r, 1000))
  }
  const test = spawn(process.execPath, [fileURLToPath(new URL('./index.mjs', import.meta.url))], { env: { ...process.env, BASE }, stdio: 'inherit' })
  code = await new Promise(r => test.on('exit', c => r(c ?? 1)))
}
catch (e) {
  console.error(e instanceof Error ? e.message : e)
}
finally {
  stop()
}
await publishTestData()
process.exit(code)
