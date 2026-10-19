import { check, login, expectStatus, ID } from './lib.mjs'

/** Folge-Event, Zusage/Absage, Frist der Bedarfsabfrage */
export default async function (ctx) {
  let { ROT, anna, ben, cem, ev, leader, persons, plan, rot, stamp } = ctx
  console.log('Neues Event')
  const ev2 = await expectStatus(leader.post('/api/orga/events', { name: `Test-LAN ${stamp} II`, startsAt: '2027-11-19T18:00', endsAt: '2027-11-21T14:00', copyRowsFrom: ev.data.id, makeCurrent: true }), 200, 'Folge-Event mit Reihen')
  plan = (await leader.get('/api/sitzplan')).data
  check(plan.people.length === 0 && plan.rows.map(r => r.letter).join() === 'A,B,J', `neues Event: leer, Reihen ${plan.rows.map(r => r.letter).join()}`)
  const evs = (await leader.get('/api/orga/events')).data
  check(evs.find(e => e.id === ev.data.id)?.registrations >= 5, 'Zusagen des vorigen Events bleiben erhalten')
  check(evs.find(e => e.id === ev.data.id)?.location === 'Halle Süd', 'Ort gespeichert')
  await expectStatus(leader.post('/api/orga/events/aufraeumen'), 404, 'kein Aufräumen-Endpunkt mehr')
  persons = (await leader.get('/api/orga/personen')).data.people
  check(persons.some(p => p.discordId === ID.anna) && persons.every(p => p.discordId ? p.status === 'offen' : p.registrationId === null), 'Personen bleiben und stehen im neuen Event als offen (ohne Discord nicht)')
  await expectStatus(leader.patch(`/api/orga/events/${ev2.data.id}`, { endsAt: '2027-11-19T12:00' }), 400, 'Ende vor Beginn')
  await expectStatus(leader.post('/api/orga/events', { name: 'Kaputt', startsAt: '2027-01-02T10:00', endsAt: '2027-01-01T10:00', copyRowsFrom: null, makeCurrent: false }), 400, 'neues Event mit Ende vor Beginn')
  await expectStatus(leader.patch(`/api/orga/events/${ev2.data.id}`, { location: 'Stadthalle', description: 'Bitte Verlängerungskabel mitbringen.' }), 200, 'Ort und Beschreibung ändern')
  await expectStatus(anna.post(`/api/orga/events/${ev2.data.id}/discord`), 403, 'Teilnehmer erzeugt Discord-Event')
  const dc = await leader.post(`/api/orga/events/${ev2.data.id}/discord`)
  check(dc.status === 500 && /Bot ist nicht eingerichtet/.test(dc.data.statusMessage), `Discord-Event ohne Bot: verständlicher Fehler (${dc.status})`)
  await expectStatus(leader.post('/api/orga/teilnehmer', { personId: persons.find(p => p.discordId === ID.ben).id }), 409, 'Ben steht schon als offen im neuen Event')
  await expectStatus(leader.patch(`/api/orga/events/${ev2.data.id}`, { registrationOpen: true }), 200, 'Registrierung im neuen Event öffnen')
  check((await leader.get('/api/sitzplan')).data.event.location === 'Stadthalle', 'Ort übersteht späteres Ändern der Registrierung')
  const annaMe = (await anna.get('/api/sitzplan')).data.me
  check(annaMe.status === 'offen' && annaMe.person?.nick === 'Anna K.' && annaMe.person?.contactId === ROT, 'Anna: offen, mit gespeicherten Angaben zum Vorausfüllen')
  check((await anna.get('/api/sitzplan')).data.event.startsAt === '2027-11-19T18:00', 'Beginn des Events')
  await expectStatus(anna.post('/api/sitzplan/registrierung', { nick: 'Anna' }), 400, 'ohne Kontaktperson geht es nicht')
  await expectStatus(anna.post('/api/sitzplan/registrierung', { nick: 'Anna', contactId: ROT }), 200, 'Anna sagt wieder zu')
  check((await leader.get('/api/orga/personen')).data.people.filter(p => p.discordId === ID.anna).length === 1, 'Anna ist weiterhin eine Person (nicht doppelt)')

  console.log('Status und Absage')
  const tn2 = async () => (await leader.get('/api/orga/teilnehmer')).data.people
  const regOf = async id => (await tn2()).find(p => p.discordId === id)
  const B2 = (await regOf(ID.ben)).id, C2 = (await regOf(ID.cem)).id
  await expectStatus(ben.post('/api/sitzplan/status', { status: 'zugesagt' }), 200, 'Ben: Bin dabei')
  await expectStatus(cem.post('/api/sitzplan/status', { status: 'zugesagt' }), 200, 'Cem: Bin dabei')
  await expectStatus(ben.post('/api/sitzplan/platz', { registrationId: B2, seat: 'A-81' }), 200, 'Ben wählt A-81')
  await expectStatus(rot.post('/api/sitzplan/status', { registrationId: B2, status: 'zugesagt' }), 200, 'Kontaktperson: Ben ist schon zugesagt (ändert nichts)')
  await expectStatus(rot.post('/api/sitzplan/status', { registrationId: C2, status: 'abgesagt' }), 403, 'Rot sagt für Cem (Blau) ab')
  await expectStatus(ben.post('/api/sitzplan/status', { status: 'abgesagt' }), 200, 'Ben: Bin nicht dabei')
  check(!(await leader.get('/api/sitzplan')).data.people.some(p => p.id === B2), 'Absage gibt Bens Platz sofort frei')
  check((await leader.get('/api/orga/nachrichten')).data.auto.some(a => a.kind === 'absage_kontakt' && a.nick === 'Rot'), 'Rot bekommt eine Nachricht zu Bens Absage')
  await expectStatus(rot.post('/api/sitzplan/status', { registrationId: B2, status: 'zugesagt' }), 403, 'Kontaktperson sagt nicht für andere zu')
  await expectStatus(ben.post('/api/sitzplan/status', { status: 'offen' }), 403, 'zurück auf offen nur durch die Orga')
  await expectStatus(ben.post('/api/sitzplan/status', { status: 'zugesagt' }), 200, 'Ben sagt wieder zu')
  await expectStatus(ben.post('/api/sitzplan/platz', { registrationId: B2, seat: 'A-81' }), 200, 'Ben nimmt wieder A-81')
  await expectStatus(ben.post('/api/sitzplan/warteliste'), 409, 'Warteliste vor dem Ende der Bedarfsabfrage gibt es nicht')

  console.log('Frist der Bedarfsabfrage vorbei')
  await expectStatus(leader.patch(`/api/orga/events/${ev2.data.id}`, { demandUntil: '2020-01-01T10:00' }), 200, 'Frist in die Vergangenheit setzen')
  await expectStatus(ben.post('/api/sitzplan/platz', { registrationId: B2, seat: 'A-85' }), 200, 'Ben setzt sich nach der Frist noch um (Platzwahl bis zum Buchungsstart)')
  await expectStatus(rot.post('/api/sitzplan/platz', { registrationId: B2, seat: 'A-81' }), 200, 'Rot setzt Ben zurück auf A-81')
  const gina = await login(ID.gina, 'Gina')
  const late = await expectStatus(gina.post('/api/sitzplan/registrierung', { nick: 'Gina', contactId: ROT }), 409, 'Gina sagt nach der Frist zu')
  check(late.data?.data?.code === 'waitlist', 'Gina bekommt den Hinweis auf die Warteliste')
  await expectStatus(gina.post('/api/sitzplan/registrierung', { nick: 'Gina', contactId: ROT, waitlist: true }), 200, 'Gina setzt sich auf die Warteliste')
  check((await gina.get('/api/sitzplan')).data.me.waitlistPosition === 1, 'Gina ist Erste auf der Warteliste')
  check(!!(await gina.get('/api/sitzplan')).data.me.offer, 'ohne Höchstzahl und Bereich: Gina bekommt sofort ein Angebot, es sind Plätze frei')
  Object.assign(ctx, { ev2, tn2, regOf, B2, C2, gina })
}
