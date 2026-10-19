import { check, expectStatus } from './lib.mjs'

/** Gemeldeter Bereich fixieren/lösen, gebuchte Plätze */
export default async function (ctx) {
  const { C2, G2, anna, blau, gina, leader, rot } = ctx
  console.log('Gemeldeter Bereich')
  await expectStatus(leader.post('/api/sitzplan/gebucht', { registrationId: G2, booked: false }), 200, 'Ginas Buchung zurücksetzen (für den Bereichs-Test)')
  await expectStatus(rot.put('/api/orga/bereich', { seats: ['A-81'] }), 403, 'Kontaktperson markiert den Bereich')
  const mark = await expectStatus(leader.put('/api/orga/bereich', { seats: ['A-81', 'A-82', 'A-83', 'A-84', 'Z-1'] }), 200, 'Leitung markiert A-81 … A-84')
  check(mark.data.seats === 4, 'Plätze, die es nicht gibt, fallen weg')
  check((await anna.get('/api/sitzplan')).data.area === null, 'Entwurf sehen Teilnehmer noch nicht')
  const fixed = await expectStatus(leader.post('/api/orga/bereich/fixieren'), 200, 'Bereich fixieren')
  check(fixed.data.removed.includes('Gina'), `wer außerhalb sitzt, verliert seinen Platz (${fixed.data.removed.join(', ')})`)
  check((await leader.get('/api/orga/nachrichten')).data.auto.some(a => a.kind === 'bereich' && a.nick === 'Gina'), 'Gina bekommt dazu eine Nachricht')
  const areaPlan = (await gina.get('/api/sitzplan')).data
  check(areaPlan.area?.fixed && areaPlan.area.seats.length === 4 && areaPlan.event.areaFixed, 'Teilnehmer sehen den fixierten Bereich')
  check(areaPlan.me.seat === null, 'Gina hat keinen Platz mehr')
  await expectStatus(gina.post('/api/sitzplan/platz', { registrationId: G2, seat: 'A-90' }), 403, 'Gina setzt sich außerhalb des Bereichs')
  await expectStatus(gina.post('/api/sitzplan/platz', { registrationId: G2, seat: 'A-81' }), 200, 'Gina setzt sich in den Bereich')
  await expectStatus(gina.post('/api/sitzplan/platz', { registrationId: G2, seat: 'A-82' }), 403, 'wer sitzt, setzt sich nicht mehr selbst um')
  await expectStatus(blau.post('/api/sitzplan/platz', { registrationId: C2, seat: 'A-83' }), 200, 'Kontaktperson setzt Cem (ohne Platz) in den Bereich')
  await expectStatus(blau.post('/api/sitzplan/platz', { registrationId: C2, seat: 'A-84' }), 200, 'Kontaktperson setzt Cem im Bereich um')
  await expectStatus(blau.post('/api/sitzplan/platz', { registrationId: C2, seat: 'A-95' }), 403, 'Kontaktperson setzt Cem aus dem Bereich hinaus')
  await expectStatus(rot.post('/api/sitzplan/platz', { registrationId: C2, seat: 'A-83' }), 403, 'Rot setzt Cem (Blau) um')
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: C2, seat: 'B-10' }), 200, 'die Orga darf auch außerhalb setzen')
  await expectStatus(leader.put('/api/orga/bereich', { seats: ['A-81'] }), 409, 'fixierten Bereich ändern')
  check((await leader.get('/api/orga/meldung')).data.text.includes('Gemeldeter Bereich (4 Plätze, fixiert)'), 'Meldung nennt den Bereich')
  await expectStatus(leader.post('/api/orga/bereich/loesen'), 200, 'Fixierung lösen')
  check((await gina.get('/api/sitzplan')).data.area === null, 'gelöst: Teilnehmer sehen keinen Bereich mehr')

  console.log('Gebucht = personalisiertes Ticket')
  await expectStatus(leader.post('/api/sitzplan/gebucht', { registrationId: C2, booked: true }), 200, 'Cem hat gebucht')
  await expectStatus(leader.put('/api/orga/bereich', { seats: ['A-81', 'A-82', 'A-83', 'A-84'] }), 200, 'Bereich ohne B-10 markieren')
  const fixedB = await expectStatus(leader.post('/api/orga/bereich/fixieren'), 200, 'Bereich fixieren (Cem sitzt außerhalb, hat gebucht)')
  check(fixedB.data.bookedOutside.includes('Cem') && !fixedB.data.removed.includes('Cem'), 'wer gebucht hat, behält beim Fixieren seinen Platz')
  await expectStatus(blau.post('/api/sitzplan/platz', { registrationId: C2, seat: 'A-84' }), 403, 'Kontaktperson setzt Cem (gebucht) um')
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: C2, seat: 'A-84' }), 200, 'die Orga setzt Cem (gebucht) um')
  await expectStatus(leader.post('/api/orga/bereich/loesen'), 200, 'Fixierung wieder lösen')
}
