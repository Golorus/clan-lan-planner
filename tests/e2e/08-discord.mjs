import { check, expectStatus, ID, TEST_PUBLIC_KEY, interaction } from './lib.mjs'

/** Discord: Knöpfe, Rollen, Einstellungen in /orga, Nachrichtenarten an/aus */
export default async function (ctx) {
  const { B2, C2, G2, anna, ev2, gina, leader, regOf, rot } = ctx
  console.log('Discord-Knöpfe')
  await expectStatus(interaction({ type: 1 }, false).then(r => ({ ...r, text: '' })), 401, 'Interaction ohne Signatur')
  const ping = await interaction({ type: 1 })
  if (ping.status === 401) {
    console.log(`  (übersprungen: dev-Server mit NUXT_DISCORD_PUBLIC_KEY=${TEST_PUBLIC_KEY} starten, um die Knöpfe zu prüfen)`)
  }
  else {
    check(ping.status === 200 && ping.data?.type === 1, 'PING → PONG')
    const press = await interaction({ type: 3, user: { id: ID.cem }, data: { custom_id: `st:ab:${B2}` }, message: { content: 'x' } })
    check(press.data?.data?.flags === 64, 'Cem drückt Bens Knopf: abgelehnt (nur für ihn sichtbar)')
    const own = await interaction({ type: 3, user: { id: ID.ben }, data: { custom_id: `st:ab:${B2}` }, message: { content: 'Erinnerung' } })
    check(own.data?.type === 7 && /abgesagt|abgemeldet/.test(own.data?.data?.content), 'Ben drückt „Bin nicht dabei“: Nachricht wird aktualisiert')
    const modal = await interaction({ type: 3, user: { id: ID.gina }, data: { custom_id: `bk:${G2}` }, message: { content: 'x' } })
    check(modal.data?.type === 9, '„Ich habe gebucht“ öffnet das Formular')
    const sent = await interaction({ type: 5, user: { id: ID.gina }, data: { custom_id: `bkm:${G2}`, components: [{ components: [{ custom_id: 'seat', value: 'B-5' }] }] }, message: { content: 'x' } })
    check(sent.data?.type === 7 && /gebucht/.test(sent.data?.data?.content), 'Formular abgeschickt: gebucht')
    const ginaSeat = (await gina.get('/api/sitzplan')).data.me.seat
    check(!!ginaSeat && modal.data?.data?.components?.[0]?.components?.[0]?.value === ginaSeat, `Formular ist mit dem geplanten Platz vorausgefüllt (${ginaSeat})`)
    const tk = await interaction({ type: 3, user: { id: ID.rot }, data: { custom_id: 'test:knopf' }, message: { content: 'Test' } })
    check(tk.data?.type === 7 && /Knopf funktioniert/.test(tk.data?.data?.content), 'Test-Nachricht: „Knopf testen“ antwortet')
    const tf = await interaction({ type: 3, user: { id: ID.rot }, data: { custom_id: 'test:formular' }, message: { content: 'Test' } })
    check(tf.data?.type === 9 && tf.data?.data?.custom_id === 'tsm', 'Test-Nachricht: „Formular testen“ öffnet ein Formular')
    const ts = await interaction({ type: 5, user: { id: ID.rot }, data: { custom_id: 'tsm', components: [{ components: [{ custom_id: 'seat', value: 'A-1' }] }] }, message: { content: 'Test' } })
    check(ts.data?.type === 7 && /Formular funktioniert/.test(ts.data?.data?.content), 'Test-Formular abgeschickt, nichts eingetragen')
    const unk = await interaction({ type: 2, user: { id: ID.rot }, data: { name: 'gibtsnicht' } })
    check(unk.data?.type === 4 && unk.data?.data?.flags === 64 && /kenne ich nicht/.test(unk.data?.data?.content), 'Unbekannter Slash-Befehl: Hinweis nur für den Aufrufer')
  }

  console.log('Rollen')
  const roles = await expectStatus(leader.get('/api/orga/discord/rollen'), 200, 'Rollen-Einstellungen lesen')
  check(roles.data.botConfigured === false && roles.data.roles.length === 0, 'ohne Bot: keine Rollen, kein Fehler')
  await expectStatus(leader.put('/api/orga/discord/einstellungen', { eventRoleId: '444444444444444444' }), roles.data.orgaRoleId === '444444444444444444' ? 400 : 200, 'Event-Rolle setzen (nie die Orga-Rolle)')
  await expectStatus(leader.put('/api/orga/discord/einstellungen', { eventRoleId: null }), 200, 'Event-Rolle wieder aus der .env')
  await expectStatus(leader.post('/api/orga/discord/rolle-abgleichen'), 500, 'Rolle abgleichen ohne Bot: verständlicher Fehler')
  await expectStatus(rot.post('/api/orga/discord/rolle-abgleichen'), 403, 'Kontaktperson gleicht Rolle ab')
  const kan = await expectStatus(leader.get('/api/orga/discord/kanaele'), 200, 'Kanäle für die Ankündigung')
  check(kan.data.botConfigured === false && kan.data.body.includes('{event}'), 'ohne Bot: keine Kanäle, Standardtext da')
  const ann = await leader.post(`/api/orga/events/${ev2.data.id}/ankuendigen`, { channelId: '123456789012345678', body: '@everyone {event}' })
  check(ann.status === 500 && /Bot ist nicht eingerichtet/.test(ann.data.statusMessage), `Ankündigen ohne Bot: verständlicher Fehler (${ann.status})`)
  await expectStatus(rot.post(`/api/orga/events/${ev2.data.id}/ankuendigen`, { channelId: '123456789012345678', body: 'x' }), 403, 'Kontaktperson kündigt an')
  const av = await leader.post('/api/orga/avatare')
  check(av.status === 500 && /Bot ist nicht eingerichtet/.test(av.data.statusMessage), `Avatare holen ohne Bot: verständlicher Fehler (${av.status})`)
  await expectStatus(rot.post('/api/orga/avatare'), 403, 'Kontaktperson holt Avatare')

  const bef = await expectStatus(leader.get('/api/orga/discord/befehle'), 200, 'Slash-Befehle der Module lesen')
  check(Array.isArray(bef.data.commands), 'Liste der Slash-Befehle')
  await expectStatus(leader.post('/api/orga/discord/befehle'), 500, 'Befehle anmelden ohne Bot: verständlicher Fehler')
  await expectStatus(rot.get('/api/orga/discord/befehle'), 403, 'Kontaktperson liest die Slash-Befehle')
  await expectStatus(rot.post('/api/orga/discord/befehle'), 403, 'Kontaktperson meldet Befehle an')

  console.log('Umfang der Einrichtung')
  let ampel = (await leader.get('/api/orga/einrichtung')).data
  check(ampel.scopeSource === 'config' && ampel.checks.find(c => c.key === 'bot')?.level === 'warn', 'ohne Umfang: kein Bot ist gelb')
  await expectStatus(rot.put('/api/orga/einrichtung/umfang', { keys: ['bot'] }), 403, 'Kontaktperson setzt den Umfang')
  await expectStatus(leader.put('/api/orga/einrichtung/umfang', { keys: ['Bot!'] }), 400, 'Umfang mit kaputtem Schlüssel')
  await expectStatus(leader.put('/api/orga/einrichtung/umfang', { keys: ['bot', 'public-key'] }), 200, 'Orga hakt Bot und Knöpfe an')
  ampel = (await leader.get('/api/orga/einrichtung')).data
  check(ampel.scopeSource === 'orga' && ampel.checks.find(c => c.key === 'bot')?.level === 'error' && ampel.checks.find(c => c.key === 'bot')?.inScope, 'im Umfang: kein Bot ist rot')
  await expectStatus(leader.put('/api/orga/einrichtung/umfang', { keys: null }), 200, 'Umfang zurück zum Standard')
  ampel = (await leader.get('/api/orga/einrichtung')).data
  check(ampel.scopeSource === 'config' && ampel.checks.find(c => c.key === 'bot')?.level === 'warn', 'Standard: wieder gelb')

  console.log('Discord-Einstellungen in /orga')
  for (const [who, s] of [['Teilnehmer', anna], ['Kontaktperson', rot]]) {
    await expectStatus(s.get('/api/orga/discord/rollen'), 403, `${who} liest die Rollen-Einstellungen`)
    await expectStatus(s.put('/api/orga/discord/einstellungen', { eventRoleId: '555555555555555555' }), 403, `${who} setzt die Event-Rolle`)
    await expectStatus(s.get('/api/orga/discord/kanaele'), 403, `${who} liest den Ankündigungskanal`)
    await expectStatus(s.put('/api/orga/nachrichten/einstellungen', { umsetzung: { enabled: false, body: 'x' } }), 403, `${who} ändert automatische Nachrichten`)
    await expectStatus(s.get('/api/orga/einrichtung'), 403, `${who} sieht die Einrichtung`)
  }
  await expectStatus(leader.put('/api/orga/discord/einstellungen', { eventRoleId: '123' }), 400, 'Event-Rolle mit kaputter ID')
  await expectStatus(leader.put('/api/orga/discord/einstellungen', { eventRoleId: '555555555555555555' }), 200, 'Event-Rolle in /orga setzen')
  let rl = (await leader.get('/api/orga/discord/rollen')).data
  check(rl.eventRoleId === '555555555555555555' && rl.source === 'orga' && !rl.clash, 'Event-Rolle gilt, Quelle: /orga')
  let einr = (await expectStatus(leader.get('/api/orga/einrichtung'), 200, 'Einrichtung prüfen')).data.checks
  const lv = key => einr.find(c => c.key === key)?.level
  check(einr.find(c => c.key === 'event-role')?.text.includes('in /orga gesetzt'), 'Einrichtung: Event-Rolle aus /orga erkannt')
  check(lv('bot') === 'warn', 'Einrichtung: ohne Bot eine Warnung, kein Fehler')
  check(lv('public-key') === 'ok', 'Einrichtung: Public Key gesetzt, Knöpfe aktiv')
  check(lv('orga-role') === (rl.orgaRoleId ? 'ok' : 'warn'), `Einrichtung: Orga-Rolle ${rl.orgaRoleId ? 'eingetragen' : 'fehlt (Warnung)'}`)
  if (rl.orgaRoleId) {
    await expectStatus(leader.put('/api/orga/discord/einstellungen', { eventRoleId: rl.orgaRoleId }), 400, 'Event-Rolle = Orga-Rolle wird abgelehnt')
    check((await leader.get('/api/orga/discord/rollen')).data.eventRoleId === '555555555555555555', 'abgelehnt: die vorige Event-Rolle gilt weiter')
  }
  await expectStatus(leader.put('/api/orga/discord/einstellungen', { eventRoleId: null }), 200, 'Event-Rolle wieder aus der .env')
  rl = (await leader.get('/api/orga/discord/rollen')).data
  check(rl.source !== 'orga', 'zurückgesetzt: nicht mehr aus /orga')
  einr = (await leader.get('/api/orga/einrichtung')).data.checks
  check(!einr.some(c => c.text.includes('555555555555555555')), 'Einrichtung nennt keine Rollen-IDs')

  console.log('Automatische Nachrichten an/aus')
  const ms0 = (await leader.get('/api/orga/nachrichten')).data.settings.umsetzung
  await expectStatus(leader.put('/api/orga/nachrichten/einstellungen', { umsetzung: { enabled: true, body: '' } }), 400, 'leerer Text wird abgelehnt')
  await expectStatus(leader.put('/api/orga/nachrichten/einstellungen', { umsetzung: { enabled: false, body: ms0.body } }), 200, 'Umsetzungs-Nachricht ausschalten')
  const cemSeat = (await regOf(ID.cem)).seat
  const umsCount = async () => (await leader.get('/api/orga/nachrichten')).data.auto.filter(a => a.kind === 'umsetzung' && a.nick === 'Cem').length
  const umsBefore = await umsCount()
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: C2, seat: 'B-30' }), 200, 'Orga setzt Cem um (Nachricht aus)')
  check(await umsCount() === umsBefore, 'ausgeschaltet: keine Umsetzungs-Nachricht eingereiht')
  await expectStatus(leader.put('/api/orga/nachrichten/einstellungen', { umsetzung: { enabled: true, body: 'Hallo {nick}, neu: {platz}' } }), 200, 'wieder einschalten, eigener Text')
  check((await leader.get('/api/orga/nachrichten')).data.settings.umsetzung.body === 'Hallo {nick}, neu: {platz}', 'eigener Text gespeichert')
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: C2, seat: 'B-31' }), 200, 'Orga setzt Cem noch einmal um')
  check(await umsCount() === umsBefore + 1, 'eingeschaltet: Umsetzungs-Nachricht eingereiht')
  await expectStatus(leader.put('/api/orga/nachrichten/einstellungen', { umsetzung: ms0 }), 200, 'Umsetzungs-Nachricht wie vorher')
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: C2, seat: cemSeat }), 200, `Cem zurück auf ${cemSeat ?? 'keinen Platz'}`)
}
