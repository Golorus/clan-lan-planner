import { check, login, expectStatus, ID } from './lib.mjs'

/** Geschlossene Bedarfsabfrage, Personen und Teilnehmer in /orga */
export default async function (ctx) {
  const { A, B, BLAU, ROT, anna, ben, ev, leader, rot } = ctx
  console.log('Bedarfsabfrage vorzeitig geschlossen')
  await expectStatus(leader.patch(`/api/orga/events/${ev.data.id}`, { registrationOpen: false }), 200, 'Bedarfsabfrage schließen')
  await expectStatus(anna.post('/api/sitzplan/platz', { registrationId: A, seat: 'A-99' }), 200, 'Anna setzt sich um (geschlossen: Platzwahl läuft bis zum Buchungsstart)')
  await expectStatus(rot.post('/api/sitzplan/platz', { registrationId: A, seat: 'A-98' }), 200, 'Rot setzt Anna um (geschlossen: Platzwahl läuft weiter)')
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: A, seat: 'A-100' }), 200, 'Leitung setzt Anna um (geschlossen)')
  const dana = await login(ID.dana, 'Dana')
  const danaLate = await expectStatus(dana.post('/api/sitzplan/registrierung', { nick: 'Dana', contactId: ROT }), 409, 'Dana sagt zu (geschlossen)')
  check(danaLate.data?.data?.code === 'waitlist', 'Dana bekommt den Hinweis auf die Warteliste')
  await expectStatus(ben.del('/api/sitzplan/registrierung'), 200, 'Ben sagt ab (geht auch nach dem Schließen)')
  const benAgain = await expectStatus(ben.del('/api/sitzplan/registrierung'), 200, 'Ben sagt nochmal ab')
  check(benAgain.data.changed === false, 'zweite Absage ändert nichts')
  let persons = (await leader.get('/api/orga/personen')).data.people
  check(persons.some(p => p.discordId === ID.ben && p.status === 'abgesagt'), 'Ben bleibt als Person, mit Status abgesagt')
  check(!(await leader.get('/api/sitzplan')).data.people.some(p => p.id === B), 'Bens Platz ist frei')

  console.log('Orga: Personen und Teilnehmer')
  const list = await expectStatus(leader.get('/api/orga/teilnehmer'), 200, 'Teilnehmerliste')
  check(list.data.people.some(p => p.discordId === ID.anna && p.discordName === 'anna'), 'Orga sieht Discord-ID und -Namen')
  const eli = await expectStatus(leader.post('/api/orga/personen', { discordId: ID.eli, discordName: 'eli', nick: 'Eli', contactId: BLAU, addToEvent: true }), 200, 'Leitung legt Eli an und nimmt sie ins Event (geschlossen)')
  check(!!eli.data.registrationId, 'Eli steht im Event (offen)')
  const fritz = await expectStatus(leader.post('/api/orga/personen', { discordId: ID.fritz, discordName: 'fritz', nick: 'Fritz', contactId: null }), 200, 'Leitung legt Fritz ohne Teilnahme an')
  await expectStatus(leader.post('/api/orga/personen', { discordId: ID.fritz, discordName: 'fritz', nick: 'Fritz2', contactId: null }), 409, 'Fritz doppelt anlegen')
  await expectStatus(leader.post('/api/orga/personen', { discordId: ID.gina, discordName: 'gina', nick: 'eli', contactId: null }), 409, 'Nick schon vergeben (Person)')
  await expectStatus(leader.post('/api/orga/teilnehmer', { personId: fritz.data.id }), 200, 'Leitung nimmt Fritz ins Event')
  await expectStatus(leader.post('/api/orga/teilnehmer', { personId: fritz.data.id }), 409, 'Fritz steht schon im Event')
  await expectStatus(anna.post('/api/orga/personen', { discordId: ID.gina, discordName: 'gina', nick: 'Gina', contactId: null }), 403, 'Teilnehmer legt Person an')
  await expectStatus(rot.post('/api/orga/teilnehmer', { personId: fritz.data.id }), 403, 'Kontaktperson fügt Teilnehmer hinzu')
  const fritzReg = (await leader.get('/api/orga/personen')).data.people.find(p => p.id === fritz.data.id).registrationId
  await expectStatus(leader.del(`/api/orga/teilnehmer/${fritzReg}`), 200, 'Fritz aus dem Event nehmen')
  persons = (await leader.get('/api/orga/personen')).data.people
  check(persons.some(p => p.id === fritz.data.id && p.registrationId === null), 'Fritz bleibt als Person bestehen')
  await expectStatus(leader.del(`/api/orga/personen/${fritz.data.id}`), 200, 'Fritz ganz löschen')
  await expectStatus(leader.patch(`/api/orga/teilnehmer/${A}`, { nick: 'Ben' }), 409, 'Umbenennen auf Nick einer anderen Person')
  const log = await expectStatus(leader.get('/api/orga/protokoll'), 200, 'Protokoll')
  check(log.data.some(l => l.action === 'getauscht' && l.actorName === 'Rot'), 'Protokoll: Rot hat getauscht')
  check(log.data.some(l => l.action === 'gesetzt' && l.nick === 'Anna K.' && l.toSeat === 'A-100'), 'Protokoll: Anna auf A-100')
  const csv = await expectStatus(leader.get('/api/orga/export?format=csv'), 200, 'CSV-Export')
  check(csv.text.includes(`Anna K.;anna;${ID.anna};Rot;zugesagt;;A-100;einfach;offen;`), 'CSV enthält Anna mit Status')
  const json = await expectStatus(leader.get('/api/orga/export?format=json'), 200, 'JSON-Export')
  check(json.data.format === 'lan-planner-sitzplan' && json.data.attendees.length === 2, `JSON-Export mit den 2 Zugesagten (${json.data.attendees?.length})`)
  const imp = await expectStatus(leader.post('/api/orga/sitzplan-import', { Year: 2023, Attendees: [
    { FirstName: 'Otto', NickName: 'Orig1', NumberOfSeats: 1, SeatIdentifier: 'A-110', Confirmed: true },
    { NickName: 'Orig2', NumberOfSeats: 2, SeatIdentifier: 'A-112' },
    { NickName: 'Orig3', NumberOfSeats: 1, SeatIdentifier: 'A-100' },
    { NickName: 'Anna K.', NumberOfSeats: 1, SeatIdentifier: '' },
  ], SeatingRows: [{ Letter: 'J', StartingSeat: 81 }] }), 200, 'Import aus dem Original-Seat-Planner')
  check(imp.data.people === 3 && imp.data.newPersons === 3 && imp.data.seated === 2 && imp.data.unseated === 1 && imp.data.rows === 1 && imp.data.skipped.some(s => s.startsWith('Anna K.')), `Import: ${JSON.stringify(imp.data)}`)
  check((await leader.get('/api/sitzplan')).data.people.find(p => p.nick === 'Orig2')?.seat === 'A-111', 'Import: Doppelplatz aus dem Original (A-112) liegt links am Tisch (A-111)')
  Object.assign(ctx, { dana, persons })
}
