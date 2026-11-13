/** Inventar und Packen: Orga pflegt, Teilnehmer zählen, andere Module lesen den Bestand ihrer Artikelarten */
export default async function (ctx) {
  const { anon, leader, anna } = ctx
  const { BASE, check, expectStatus } = ctx.lib
  console.log('Inventar und Packen')

  // Rechte
  await expectStatus(anon.get('/api/packen'), 401, 'anonym: Packstand')
  await expectStatus(anon.get('/api/inventar/bestand?modul=x'), 401, 'anonym: Bestand eines Moduls')
  await expectStatus(anna.get('/api/orga/inventar'), 403, 'Teilnehmerin: Inventar pflegen')
  await expectStatus(anna.put('/api/orga/inventar', { rev: 0, containers: [], articles: [] }), 403, 'Teilnehmerin: Inventar speichern')
  await expectStatus(anna.post('/api/orga/inventar/runde', { round: 'rueck' }), 403, 'Teilnehmerin: Runde starten')
  const anonPage = await fetch(BASE + '/packen/k/k1', { redirect: 'manual' })
  check(anonPage.status === 302 && anonPage.headers.get('location') === '/auth/discord?redirect=' + encodeURIComponent('/packen/k/k1'), `anonym: QR-Code führt zur Anmeldung und danach zurück (${anonPage.status})`)

  // Orga pflegt den Bestand
  const empty = await expectStatus(leader.get('/api/orga/inventar'), 200, 'Orga: Inventar lesen')
  const saved = await expectStatus(leader.put('/api/orga/inventar', {
    rev: empty.data.rev,
    containers: [{ id: 'k1', name: 'Euro-Box 1', kind: 'Kiste' }, { id: 'k2', name: 'Tasche Strom', kind: 'Tasche' }],
    articles: [
      { id: 'a1', name: 'Patchkabel 20 m', count: 10, container: 'k1', checked: true, source: 'test-modul', key: 'kabel' },
      { id: 'a2', name: 'Patchkabel 20 m (Tasche)', count: 2, container: 'k2', source: 'test-modul', key: 'kabel' },
      { id: 'a3', name: 'Projektor', count: 1, container: 'gibt-es-nicht' },
      { id: 'a4', name: 'Euro-Box', count: 0, note: '1 kaufen' },
    ],
  }), 200, 'Orga: Inventar speichern')
  check(saved.data.rev > empty.data.rev && saved.data.articles.length === 4 && saved.data.articles[2].container === '', 'gespeichert, unbekannte Kiste gelöst')
  const stale = await leader.put('/api/orga/inventar', { rev: empty.data.rev, containers: [], articles: [] })
  check(stale.status === 409, `veraltete Fassung überschreibt nichts (${stale.status})`)
  const counts = await expectStatus(anna.get('/api/inventar/bestand?modul=test-modul'), 200, 'Modul liest seinen Bestand')
  check(counts.data.counts.kabel === 12, `Bestand je Artikelart zusammengezählt (${counts.data.counts.kabel})`)

  // Teilnehmer packen
  await expectStatus(leader.post('/api/orga/inventar/runde', { round: 'hin' }), 200, 'Orga: Hinweg starten')
  const view = await expectStatus(anna.get('/api/packen'), 200, 'Teilnehmerin: Packstand')
  check(view.data.containers.length === 2 && view.data.articles.length === 3 && !view.data.articles.some(a => a.id === 'a4'), 'Packstand: Kisten und Artikel mit Anzahl (ohne die mit 0)')
  check(!('ops' in view.data) && !('checked' in view.data.articles[0]), 'Packstand: nur was zum Packen nötig ist')
  const op = (id, article, delta = 1, roundId = view.data.roundId) => ({ id, article, delta, roundId })
  const first = await expectStatus(anna.post('/api/packen/zaehlen', { ops: [op('e2e-op-1', 'a1'), op('e2e-op-2', 'a1'), op('e2e-op-3', 'a3')] }), 200, 'Teilnehmerin: zählen')
  check(first.data.applied === 3 && first.data.counts.a1 === 2 && first.data.counts.a3 === 1 && first.data.by.a1, 'gezählt, mit Namen')
  const again = await anna.post('/api/packen/zaehlen', { ops: [op('e2e-op-1', 'a1'), op('e2e-op-4', 'a1', -1), op('e2e-op-5', 'unbekannt')] })
  check(again.data.applied === 1 && again.data.counts.a1 === 1, 'nachgesendete Kennung zählt nicht doppelt, −1 geht, Unbekanntes nicht')
  await expectStatus(anna.post('/api/packen/zaehlen', { ops: [{ id: 'x', article: 'a1', delta: 5, roundId: 'r' }] }), 400, 'ungültige Zählung')
  const back = await expectStatus(leader.post('/api/orga/inventar/runde', { round: 'rueck' }), 200, 'Orga: Rückweg starten')
  check(back.data.round === 'rueck' && Object.keys(back.data.counts).length === 0 && back.data.roundId !== view.data.roundId, 'Rückweg: Zähler wieder bei null')
  const old = await anna.post('/api/packen/zaehlen', { ops: [op('e2e-op-6', 'a1')] })
  check(old.data.applied === 0, 'Klick aus der alten Runde zählt nicht')

  // Seiten
  for (const path of ['/packen', '/packen/k/k1', '/packen/a/a1']) await expectStatus(anna.get(path), 200, `Teilnehmerin: ${path}`)
  const box = await anna.get('/packen/k/k1')
  check(box.text.includes('Euro-Box 1') && box.text.includes('Patchkabel 20 m'), 'Kistenseite zeigt Inhalt')
  const art = await anna.get('/packen/a/a2')
  check(art.text.includes('Tasche Strom'), 'Artikelseite zeigt die Zielkiste')
  for (const path of ['/orga/inventar', '/orga/inventar/packen', '/orga/inventar/etiketten', '/orga/inventar/packliste']) {
    const page = await expectStatus(leader.get(path), 200, `Orga: ${path}`)
    check(/class="[^"]*active[^"]*"[^>]*>Inventar</.test(page.text) || path !== '/orga/inventar', `${path}: Orga-Reiter „Inventar“`)
  }
  const home = await anna.get('/')
  check(home.text.includes('href="/packen"'), 'Kopfleiste: Link „Packen“')
}
