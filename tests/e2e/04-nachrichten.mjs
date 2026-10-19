import { check, expectStatus, ID } from './lib.mjs'

/** Rundnachrichten, Info-Nachricht per Knopf, Rate-Limit */
export default async function (ctx) {
  const { A, ROT, dana, leader, rot } = ctx
  console.log('Nachrichten')
  const msg = await expectStatus(leader.post('/api/orga/nachrichten', { target: { type: 'contact', contactId: ROT }, body: 'Hallo {nick}, Platz {platz}' }), 200, 'Nachricht an die Leute von Rot')
  check(msg.data.recipients === 1, 'Empfänger: nur Anna (Ben hat zurückgezogen)')
  // die Warteschlange schickt etwa eine Nachricht pro Sekunde, davor stehen ggf. automatische
  let batch
  for (let i = 0; i < 30; i++) {
    batch = await leader.get(`/api/orga/nachrichten/${msg.data.id}`)
    if (batch.data[0]?.status !== 'wartet') break
    await new Promise(r => setTimeout(r, 1000))
  }
  check(batch.data.length === 1 && ['gesendet', 'fehler'].includes(batch.data[0].status), `Zustellung bearbeitet: ${batch.data[0]?.status} ${batch.data[0]?.error ?? ''}`)
  const orig = (await leader.get('/api/orga/teilnehmer')).data.people.find(p => p.nick === 'Orig1')
  const noDiscord = await leader.post('/api/orga/nachrichten', { target: { type: 'person', registrationId: orig.id }, body: 'x' })
  check((await leader.get(`/api/orga/nachrichten/${noDiscord.data.id}`)).data[0]?.error?.includes('Keine Discord-ID'), 'ohne Discord-ID als Fehler gelistet')

  console.log('Info-Nachricht per Knopf')
  const settingsBefore = (await leader.get('/api/orga/nachrichten')).data.settings
  await expectStatus(rot.post('/api/orga/teilnehmer/info', { all: true }), 403, 'Kontaktperson schickt Info-Nachricht')
  const off = { ...settingsBefore, registrierung: { ...settingsBefore.registrierung, enabled: false } }
  await expectStatus(leader.put('/api/orga/nachrichten/einstellungen', off), 200, 'automatische Info-Nachricht ausschalten')
  const tnInfo = (await leader.get('/api/orga/teilnehmer')).data
  check(tnInfo.infoAuto === false, 'Teilnehmerliste zeigt: Info-Nachricht nicht automatisch')
  const annaReg = tnInfo.people.find(p => p.discordId === ID.anna)
  await expectStatus(leader.post('/api/orga/teilnehmer/info', { registrationId: annaReg.id }), 200, 'Info-Nachricht an Anna per Knopf (Automatik aus)')
  await expectStatus(leader.post('/api/orga/teilnehmer/info', { registrationId: orig.id }), 400, 'Info-Nachricht an jemanden ohne Discord')
  const allInfo = await expectStatus(leader.post('/api/orga/teilnehmer/info', { all: true }), 200, 'Info-Nachricht an alle ohne Info')
  check(typeof allInfo.data.queued === 'number', `an alle ohne Info: ${allInfo.data.queued} in der Warteschlange`)
  const annaNow = (await leader.get('/api/orga/teilnehmer')).data.people.find(p => p.id === annaReg.id)
  check(annaNow?.info?.status !== undefined, 'Teilnehmerliste zeigt den Stand der Info-Nachricht')
  check(annaNow?.messages?.registrierung?.status === annaNow?.info?.status, 'dieselbe Info-Nachricht steht unter messages (für „Erreicht“)')
  // ohne Bot kommt nichts an: niemand gilt als „eingeladen“ (angeschrieben), die Nachricht von Hand steht trotzdem da
  const tnAll = (await leader.get('/api/orga/teilnehmer')).data.people
  check(tnAll.every(p => p.contacted === false), 'ohne angekommene Nachricht: contacted ist überall false (Stand „offen“)')
  check(tnAll.some(p => p.messages.manuell), 'Nachrichten von Hand stehen unter messages.manuell')
  await expectStatus(rot.post('/api/orga/teilnehmer/info-erledigt', { all: true }), 403, 'Kontaktperson hakt Info ab')
  const doneAll = await expectStatus(leader.post('/api/orga/teilnehmer/info-erledigt', { all: true }), 200, 'Info für alle ohne Info als erledigt abhaken')
  const afterDone = (await leader.get('/api/orga/teilnehmer')).data.people.filter(p => p.status === 'zugesagt' && p.discordId)
  check(afterDone.every(p => p.info && p.info.status !== 'fehler'), `danach hat niemand mehr „ohne Info“ (${doneAll.data.done} abgehakt)`)
  await expectStatus(leader.put('/api/orga/nachrichten/einstellungen', settingsBefore), 200, 'automatische Info-Nachricht wieder einschalten')

  console.log('Rate-Limit')
  let limited = false
  for (let i = 0; i < 40 && !limited; i++) limited = (await dana.post('/api/sitzplan/platz', { registrationId: A, seat: 'A-90' })).status === 429
  check(limited, 'zu viele Anfragen → 429')
}
