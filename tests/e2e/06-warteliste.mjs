import { check, login, expectStatus, ID } from './lib.mjs'

/** Warteliste: Angebote, Annehmen/Ablehnen, Reihenfolge, Höchstzahl */
export default async function (ctx) {
  const { BLAU, ROT, anna, ben, cem, ev2, gina, leader, tn2 } = ctx
  console.log('Warteliste und Angebot')
  await expectStatus(ben.post('/api/sitzplan/status', { status: 'abgesagt' }), 200, 'Ben sagt nach der Frist ab')
  let gm = (await gina.get('/api/sitzplan')).data
  check(!!gm.me.offer && gm.me.offer.seat === null, `Gina bekommt einen Platz angeboten, ohne festen Platz (${gm.me.offer?.seat})`)
  check(gm.held.length === 0, 'kein bestimmter Platz ist reserviert, Gina sucht sich nach dem Annehmen einen aus')
  await expectStatus(cem.post('/api/sitzplan/angebot', { offerId: gm.me.offer.id, accept: true }), 403, 'Cem nimmt Ginas Angebot an')
  await expectStatus(gina.post('/api/sitzplan/angebot', { offerId: gm.me.offer.id, accept: true }), 200, 'Gina nimmt an')
  gm = (await gina.get('/api/sitzplan')).data
  check(gm.me.status === 'zugesagt' && gm.me.seat === null && !gm.me.swapLeft, 'Gina ist zugesagt, noch ohne Platz (kein Sonder-Tausch, die Platzwahl läuft noch)')
  const G2 = gm.me.registrationId
  await expectStatus(gina.post('/api/sitzplan/platz', { registrationId: G2, seat: 'A-81' }), 200, 'Gina sucht sich A-81 aus')
  await expectStatus(gina.post('/api/sitzplan/platz', { registrationId: G2, seat: 'A-91' }), 200, 'Gina wechselt auf A-91')
  await expectStatus(gina.post('/api/sitzplan/platz', { registrationId: G2, seat: 'A-90' }), 200, 'und noch einmal auf A-90 (Platzwahl läuft)')
  check((await leader.get('/api/orga/nachrichten')).data.auto.some(a => a.kind === 'nachgerueckt_kontakt' && a.nick === 'Rot'), 'Rot bekommt eine Nachricht, dass Gina nachrückt')
  const wl = await expectStatus(leader.get('/api/orga/warteliste'), 200, 'Warteliste in /orga')
  check(wl.data.offers.some(o => o.status === 'angenommen'), 'Angebot als angenommen gelistet')
  await expectStatus(anna.get('/api/orga/warteliste'), 403, 'Teilnehmer sieht die Warteliste nicht')

  console.log('Warteliste von oben nach unten (mit Höchstzahl)')
  const zugesagtNow = (await tn2()).filter(p => p.status === 'zugesagt').length
  await expectStatus(leader.patch(`/api/orga/events/${ev2.data.id}`, { maxParticipants: zugesagtNow }), 200, 'Höchstzahl = Zusagen, kein Platz frei')
  const eliS = await login(ID.eli, 'Eli'), fritzS = await login(ID.fritz, 'Fritz')
  await expectStatus(fritzS.post('/api/sitzplan/registrierung', { nick: 'Fritz', contactId: ROT, waitlist: true }), 200, 'Fritz auf die Warteliste')
  await expectStatus(eliS.post('/api/sitzplan/registrierung', { nick: 'Eli', contactId: BLAU, waitlist: true }), 200, 'Eli auf die Warteliste')
  const offerOf = async s => (await s.get('/api/sitzplan')).data.me.offer
  check(!(await offerOf(fritzS)) && !(await offerOf(eliS)), 'voll: noch kein Angebot')
  const wl2 = (await leader.get('/api/orga/warteliste')).data.list
  const F2 = wl2.find(e => e.nick === 'Fritz').id, E2 = wl2.find(e => e.nick === 'Eli').id
  await expectStatus(leader.post('/api/orga/warteliste/reihenfolge', { ids: [E2, F2] }), 200, 'Orga zieht Eli nach oben')
  await expectStatus(leader.patch(`/api/orga/events/${ev2.data.id}`, { maxParticipants: zugesagtNow + 1 }), 200, 'Höchstzahl um eins erhöhen')
  const eliOffer = await offerOf(eliS)
  check(!!eliOffer && !(await offerOf(fritzS)), 'ein Platz frei: nur Eli (oben) bekommt sofort ein Angebot, Fritz wartet')
  await expectStatus(eliS.post('/api/sitzplan/angebot', { offerId: eliOffer.id, accept: false }), 200, 'Eli lehnt ab')
  const fritzOffer = await offerOf(fritzS)
  check(!!fritzOffer, 'das Angebot geht an Fritz weiter')
  await expectStatus(fritzS.post('/api/sitzplan/angebot', { offerId: fritzOffer.id, accept: false }), 200, 'Fritz lehnt auch ab')
  await expectStatus(leader.patch(`/api/orga/events/${ev2.data.id}`, { maxParticipants: null }), 200, 'Höchstzahl wieder aus')
  Object.assign(ctx, { G2 })
}
