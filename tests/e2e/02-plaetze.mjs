import { check, login, expectStatus, ALL_IDS } from './lib.mjs'

/** Plätze wählen und setzen (Teilnehmer, Kontaktperson, Orga), Daten im Sitzplan, Doppelplätze */
export default async function (ctx) {
  const { A, B, C, anna, anon, ben, blau, leader, rot } = ctx
  console.log('Plätze: Teilnehmer')
  await expectStatus(anna.post('/api/sitzplan/platz', { registrationId: A, seat: 'A-81' }), 200, 'Anna setzt sich auf A-81')
  await expectStatus(ben.post('/api/sitzplan/platz', { registrationId: B, seat: 'A-83' }), 200, 'Ben setzt sich auf A-83')
  await expectStatus(anna.post('/api/sitzplan/platz', { registrationId: B, seat: 'A-90' }), 403, 'Anna setzt Ben um')
  await expectStatus(anna.post('/api/sitzplan/platz', { registrationId: A, seat: 'A-83' }), 409, 'Anna nimmt Bens Platz')
  await expectStatus(anna.post('/api/sitzplan/platz', { registrationId: A, seat: 'A-121' }), 400, 'Platz außerhalb der Reihe')
  await expectStatus(anna.post('/api/sitzplan/platz', { registrationId: A, seat: 'A-82' }), 200, 'Anna wechselt auf A-82')

  console.log('Plätze: Kontaktpersonen')
  await expectStatus(rot.post('/api/sitzplan/platz', { registrationId: A, seat: 'A-83' }), 200, 'Rot tauscht Anna und Ben')
  let plan = (await leader.get('/api/sitzplan')).data
  check(plan.people.find(p => p.id === A)?.seat === 'A-83' && plan.people.find(p => p.id === B)?.seat === 'A-82', 'Tausch ist gespeichert')
  await expectStatus(rot.post('/api/sitzplan/platz', { registrationId: C, seat: 'B-10' }), 403, 'Rot setzt Cem (Blau) um')
  await expectStatus(blau.post('/api/sitzplan/platz', { registrationId: C, seat: 'A-81' }), 200, 'Blau setzt Cem auf A-81')
  await expectStatus(rot.post('/api/sitzplan/platz', { registrationId: B, seat: 'A-81' }), 403, 'Rot tauscht Ben mit Cem (Blau)')
  await expectStatus(blau.post('/api/sitzplan/platz', { registrationId: C, seat: 'A-82' }), 403, 'Blau tauscht Cem mit Ben (Rot)')

  console.log('Orga-Rechte nur im Orga-Bereich')
  const leaderStart = await login(null, 'Leitung', false)
  check((await leaderStart.get('/api/sitzplan')).data.me.isLeader === false, 'Startseite: die Orga handelt ohne Orga-Rechte')
  await expectStatus(leaderStart.post('/api/sitzplan/platz', { registrationId: A, seat: 'A-99' }), 403, 'Orga setzt von der Startseite aus Fremde nicht um')
  check((await leader.get('/api/sitzplan')).data.me.isLeader === true, 'von /orga aus mit Orga-Rechten')
  await expectStatus(anna.get('/api/orga/teilnehmer'), 403, 'Teilnehmer bleibt draußen, Kennzeichnung hin oder her')

  console.log('Daten im Sitzplan')
  const publicText = (await anna.get('/api/sitzplan')).text
  check(!ALL_IDS.test(publicText), 'keine Discord-IDs im Sitzplan (auch nicht in Avatar-Adressen)')
  check(!/discord/i.test(publicText), 'keine Discord-Namen/-Felder im Sitzplan')
  const page = await anon.get('/')
  check(page.status === 200 && !ALL_IDS.test(page.text), 'Startseite ohne Discord-IDs')

  console.log('Doppelt breit (Projektleiter)')
  await expectStatus(leader.patch(`/api/orga/teilnehmer/${C}`, { double: true }), 409, 'Cem auf A-81 doppelt, aber Ben sitzt auf A-82')
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: C, seat: 'B-2' }), 200, 'Leitung setzt Cem auf B-2')
  await expectStatus(leader.patch(`/api/orga/teilnehmer/${C}`, { double: true }), 409, 'Cem auf B-2 (rechts am Tisch) doppelt')
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: C, seat: 'B-1' }), 200, 'Leitung setzt Cem auf B-1')
  await expectStatus(leader.patch(`/api/orga/teilnehmer/${C}`, { double: true }), 200, 'Cem auf B-1 doppelt')
  await expectStatus(anna.post('/api/sitzplan/platz', { registrationId: A, seat: 'B-2' }), 409, 'Anna auf rechte Hälfte von Cems Tisch')
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: C, seat: 'A-86' }), 409, 'doppelt nur links')
  Object.assign(ctx, { plan })
}
