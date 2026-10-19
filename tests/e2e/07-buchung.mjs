import { check, expectStatus } from './lib.mjs'

/** Buchung beim Veranstalter (Code bleibt geheim), Erinnerungen */
export default async function (ctx) {
  const { C2, G2, ROT, anna, ben, blau, cem, ev2, gina, leader, rot } = ctx
  console.log('Buchung')
  const CODE = 'GEHEIM-4711'
  await expectStatus(leader.patch(`/api/orga/events/${ev2.data.id}`, { bookingCode: CODE, bookingUrl: 'https://buchung.example.de/', bookingUntil: '2027-11-01T12:00' }), 200, 'Buchungscode, Link und Frist eintragen')
  const rel = await expectStatus(leader.post('/api/orga/buchung/freigeben'), 200, 'Buchung freigeben')
  check(rel.data.queued >= 2, `Buchungsnachricht an die Zugesagten (${rel.data.queued})`)
  const tnBook = (await leader.get('/api/orga/teilnehmer')).data
  check(tnBook.event.bookingReleased === true, 'Teilnehmerliste weiß: Buchung freigegeben')
  check(tnBook.people.filter(p => p.status === 'zugesagt' && p.discordId && p.booking !== 'gebucht').every(p => p.messages.buchung), 'jeder Zugesagte hat eine Buchungsnachricht unter messages (für „Erreicht“)')
  await expectStatus(cem.post('/api/sitzplan/platz', { registrationId: C2, seat: 'A-95' }), 403, 'nach dem Buchungsstart setzt sich niemand mehr selbst hin')
  await expectStatus(blau.post('/api/sitzplan/platz', { registrationId: C2, seat: 'A-95' }), 403, 'Kontaktperson setzt nach dem Buchungsstart nicht mehr um (ohne Bereich)')
  await expectStatus(gina.post('/api/sitzplan/platz', { registrationId: G2, seat: 'A-92' }), 403, 'auch Nachgerückte nicht')
  check((await gina.get('/api/sitzplan')).data.me.booking?.code === CODE, 'Gina (zugesagt) sieht den Code')
  check(!(await ben.get('/api/sitzplan')).text.includes(CODE), 'Ben (abgesagt) sieht den Code nicht')
  check(!(await rot.get('/api/sitzplan')).text.includes(CODE), 'Rot (nicht zugesagt) sieht den Code nicht')
  const seatOf = async id => (await leader.get('/api/sitzplan')).data.people.find(p => p.id === id)?.seat ?? null
  // anderer Platz gebucht und im Plan frei: das Ticket gilt, der Plan zieht nach
  const booked = await expectStatus(gina.post('/api/sitzplan/gebucht', { booked: true, seat: 'b 5' }), 200, 'Gina meldet: gebucht, aber B-5')
  check(booked.data.moved && !booked.data.differs && booked.data.seat === 'B-5', 'B-5 war frei: im Plan übernommen, keine Abweichung')
  check(await seatOf(G2) === 'B-5', 'Gina sitzt im Plan jetzt auf B-5')
  await expectStatus(gina.post('/api/sitzplan/gebucht', { booked: true, seat: 'Z-999' }), 400, 'gebuchter Platz, den es nicht gibt')
  await expectStatus(ben.post('/api/sitzplan/gebucht', { booked: true }), 409, 'Ben (abgesagt) meldet gebucht')
  // anderer Platz gebucht, der im Plan belegt ist: nicht umsetzen, als Abweichung markieren
  // jemand anderes sitzt auf A-100 (Anna; nicht Cem, dessen Umsetzungs-Nachrichten prüft 08-discord)
  const A2 = (await leader.get('/api/orga/teilnehmer')).data.people.find(p => p.nick === 'Anna').id
  const annaBefore = await seatOf(A2)
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: A2, seat: 'A-100' }), 200, 'Orga setzt Anna auf A-100')
  const holder = { id: A2, nick: 'Anna', seat: 'A-100' }
  const clash = await expectStatus(gina.post('/api/sitzplan/gebucht', { booked: true, seat: holder.seat }), 200, `Gina meldet: gebucht auf ${holder.seat} (dort sitzt ${holder.nick})`)
  check(clash.data.differs && !clash.data.moved && await seatOf(G2) === 'B-5', 'belegt: Gina bleibt auf B-5, Abweichung markiert')
  const team = await expectStatus(leader.get('/api/team/uebersicht'), 200, 'Übersicht für die Orga')
  check(team.data.total.abweichend === 1 && team.data.people.find(p => p.id === G2)?.differs, 'Übersicht zeigt die Abweichung')
  const teamRot = await expectStatus(rot.get('/api/team/uebersicht'), 200, 'Übersicht für Kontaktperson Rot')
  check(teamRot.data.people.every(p => p.contactId === ROT), 'Rot sieht nur ihre Leute')
  await expectStatus(anna.get('/api/team/uebersicht'), 403, 'Teilnehmer sieht keine Übersicht')
  // „Übernehmen“ tauscht nie mit jemandem, der dort selbst schon gebucht hat
  await expectStatus(leader.post('/api/sitzplan/gebucht', { registrationId: holder.id, booked: true }), 200, `${holder.nick} hat auf ${holder.seat} gebucht`)
  await expectStatus(leader.post('/api/orga/buchung/uebernehmen', { registrationId: G2 }), 409, 'Übernehmen gegen einen Gebuchten wird abgelehnt')
  await expectStatus(leader.post('/api/sitzplan/gebucht', { registrationId: holder.id, booked: false }), 200, `${holder.nick} doch nicht gebucht`)
  await expectStatus(leader.post('/api/orga/buchung/uebernehmen', { registrationId: G2 }), 200, 'jetzt übernimmt die Orga (Tausch)')
  check(await seatOf(G2) === holder.seat && await seatOf(holder.id) === 'B-5', `getauscht: Gina auf ${holder.seat}, ${holder.nick} auf B-5`)
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: G2, seat: 'B-5' }), 200, 'zurücktauschen')
  await expectStatus(rot.post('/api/sitzplan/gebucht', { registrationId: G2, booked: true, seat: 'B-5' }), 200, 'Kontaktperson setzt den Buchungsstatus')
  await expectStatus(leader.post('/api/orga/buchung/uebernehmen', { registrationId: G2 }), 200, 'Übernehmen ohne Abweichung ändert nichts')
  check(await seatOf(G2) === 'B-5' && await seatOf(holder.id) === holder.seat, 'Gina sitzt jetzt auf B-5')
  await expectStatus(leader.post('/api/sitzplan/platz', { registrationId: A2, seat: annaBefore }), 200, `Anna wieder wie vorher (${annaBefore ?? 'ohne Platz'})`)
  const meld = await expectStatus(leader.get('/api/orga/meldung'), 200, 'Meldung an den Veranstalter')
  check(meld.data.confirmed >= 2 && meld.data.seats.includes('B-5') && meld.data.text.includes('Zusagen:'), `Meldung: ${meld.data.confirmed} Zusagen, ${meld.data.seats.join(' ')}`)
  await expectStatus(rot.get('/api/orga/meldung'), 403, 'Kontaktperson holt die Meldung')
  // warten, bis die Buchungsnachrichten bearbeitet sind (ohne Bot: als Fehler), dann darf der Code nirgends gespeichert sein
  for (let i = 0; i < 20; i++) {
    if (!(await leader.get('/api/orga/nachrichten')).data.auto.some(a => a.kind === 'buchung' && a.status === 'wartet')) break
    await new Promise(r => setTimeout(r, 1000))
  }
  const msgsAfter = await leader.get('/api/orga/nachrichten')
  check(msgsAfter.data.auto.some(a => a.kind === 'buchung' && a.text?.includes('••••')), 'gespeicherter Text der Buchungsnachricht hat den Code geschwärzt')
  check(!msgsAfter.text.includes(CODE), 'Code nicht in den gespeicherten Nachrichten')
  check(!(await leader.get('/api/orga/export?format=csv')).text.includes(CODE) && !(await leader.get('/api/orga/export?format=json')).text.includes(CODE), 'Code nicht im Export')
  check(!(await leader.get('/api/orga/protokoll')).text.includes(CODE), 'Code nicht im Protokoll')
  check(!(await leader.get('/api/orga/meldung')).text.includes(CODE), 'Code nicht in der Meldung')

  console.log('Erinnerungen')
  await expectStatus(anna.post('/api/team/erinnern', { all: true }), 403, 'Teilnehmer erinnert')
  const rem = await expectStatus(leader.post('/api/team/erinnern', { all: true }), 200, 'Jetzt erinnern (alle Offenen)')
  check(typeof rem.data.queued === 'number', `Erinnerung an ${rem.data.queued} Offene`)
  await expectStatus(anna.post('/api/sitzplan/erinnerungen', { off: true }), 200, 'Anna bestellt Erinnerungen ab')
  check((await anna.get('/api/sitzplan')).data.me.remindersOff === true, 'Abbestellt ist gespeichert')
}
