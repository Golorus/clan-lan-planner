import { expectStatus, ID } from './lib.mjs'

/** Event, Reihen und Kontaktpersonen anlegen; anonym; Registrierung; Rechte von Teilnehmern */
export default async function (ctx) {
  const { anna, anon, ben, cem, leader, rot } = ctx
  console.log('Einrichten (Projektleiter)')
  const stamp = Date.now().toString(36)
  const ev = await expectStatus(leader.post('/api/orga/events', { name: `Test-LAN ${stamp}`, startsAt: '2026-11-20T18:00', endsAt: '2026-11-22T14:00', location: 'Halle Süd', copyRowsFrom: null, makeCurrent: true }), 200, 'Event anlegen')
  await expectStatus(leader.patch(`/api/orga/events/${ev.data.id}`, { registrationOpen: true }), 200, 'Registrierung öffnen')
  await expectStatus(leader.post('/api/orga/reihen', { letter: 'A', start: 81, carpet: 'front' }), 200, 'Reihe A ab 81')
  await expectStatus(leader.post('/api/orga/reihen', { letter: 'B', start: 1, carpet: 'both' }), 200, 'Reihe B ab 1')
  await expectStatus(leader.post('/api/orga/reihen', { letter: 'A', start: 1, carpet: 'none' }), 409, 'Reihe A doppelt')
  const kontakte = (await leader.get('/api/orga/kontakte')).data
  const ensureContact = async (discordId, nick) => kontakte.find(k => k.discordId === discordId)?.id
    ?? (await expectStatus(leader.post('/api/orga/kontakte', { discordId, discordName: nick.toLowerCase(), nick }), 200, `Kontaktperson ${nick} ernennen`)).data.id
  const ROT = await ensureContact(ID.rot, 'Rot')
  const BLAU = await ensureContact(ID.blau, 'Blau')

  console.log('Anonym')
  await expectStatus(anon.post('/api/sitzplan/registrierung', { nick: 'Hacker', contactId: ROT }), 401, 'anonym registrieren')
  await expectStatus(anon.post('/api/sitzplan/platz', { registrationId: 1, seat: 'A-81' }), 401, 'anonym umsetzen')
  await expectStatus(anon.get('/api/orga/teilnehmer'), 401, 'anonym Teilnehmerliste')
  await expectStatus(anon.get('/api/sitzplan'), 401, 'anonym Sitzplan (nur nach Login)')

  console.log('Registrierung')
  const regA = await expectStatus(anna.post('/api/sitzplan/registrierung', { nick: 'Anna', contactId: ROT }), 200, 'Anna registriert sich (Rot)')
  const regB = await expectStatus(ben.post('/api/sitzplan/registrierung', { nick: 'Ben', contactId: ROT }), 200, 'Ben registriert sich (Rot)')
  const regC = await expectStatus(cem.post('/api/sitzplan/registrierung', { nick: 'Cem', contactId: BLAU }), 200, 'Cem registriert sich (Blau)')
  await expectStatus(cem.post('/api/sitzplan/registrierung', { nick: 'anna', contactId: BLAU }), 409, 'Nick schon vergeben')
  await expectStatus(anna.post('/api/sitzplan/registrierung', { nick: 'Anna', contactId: 999999 }), 400, 'unbekannte Kontaktperson')
  await expectStatus(anna.post('/api/sitzplan/registrierung', { nick: 'Anna K.', contactId: ROT }), 200, 'Anna ändert ihren Nick')
  const A = regA.data.id, B = regB.data.id, C = regC.data.id

  console.log('Teilnehmer: Rechte')
  for (const [path, method, body] of [
    ['/api/orga/teilnehmer', 'get'], ['/api/orga/kontakte', 'get'], ['/api/orga/events', 'get'], ['/api/orga/protokoll', 'get'],
    ['/api/orga/export?format=csv', 'get'], ['/api/orga/nachrichten', 'get'],
    ['/api/orga/kontakte', 'post', { discordId: ID.anna, discordName: 'anna', nick: 'Anna' }],
    ['/api/orga/events', 'post', { name: 'X', startsAt: '2026-01-01T10:00', endsAt: '2026-01-02T10:00', copyRowsFrom: null, makeCurrent: true }],
    ['/api/orga/nachrichten', 'post', { target: { type: 'all' }, body: 'Spam' }],
    ['/api/orga/sitzplan-import', 'post', []],
  ]) {
    await expectStatus(anna[method](path, body), 403, `Teilnehmer ${method.toUpperCase()} ${path}`)
  }
  await expectStatus(anna.patch(`/api/orga/teilnehmer/${A}`, { double: true }), 403, 'Teilnehmer macht sich doppelt breit')
  await expectStatus(rot.del(`/api/orga/teilnehmer/${A}`), 403, 'Kontaktperson löscht Teilnehmer')
  await expectStatus(rot.post('/api/orga/kontakte', { discordId: ID.ben, discordName: 'ben', nick: 'Ben' }), 403, 'Kontaktperson ernennt Kontaktperson')
  Object.assign(ctx, { stamp, ev, ROT, BLAU, A, B, C })
}
