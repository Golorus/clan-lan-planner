import { BASE, check, client, expectStatus, ID, interaction, SESSION_COOKIE } from './lib.mjs'

/** Unbekannte (ohne Server/Clan-Rolle) müssen eine Freigabe anfragen; Kontaktperson per Knopf oder Orga entscheidet */
async function stranger(id, name, member) {
  const res = await fetch(`${BASE}/auth/dev-login?as=${id}&name=${encodeURIComponent(name)}&mitglied=${member ? 1 : 0}`, { redirect: 'manual' })
  const cookie = (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).find(c => c.startsWith(SESSION_COOKIE + '='))
  return client(cookie, name)
}
const code = res => res.data?.data?.code

export default async function (ctx) {
  const { leader } = ctx
  console.log('Freigabe neuer Leute')
  const kontakte = (await leader.get('/api/orga/kontakte')).data
  const rot = kontakte.find(k => k.discordId === ID.rot), blau = kontakte.find(k => k.discordId === ID.blau)

  const fremd = await stranger('410000000000005001', 'Fremd', false)
  const gate = await fremd.get('/api/sitzplan')
  check(gate.status === 403 && code(gate) === 'approval_needed', `Unbekannt: Sitzplan gesperrt, Freigabe nötig (${gate.status} ${code(gate)})`)
  await expectStatus(fremd.post('/api/sitzplan/registrierung', { nick: 'Fremd', contactId: rot.id }), 403, 'Unbekannt: direkt zusagen geht nicht')
  const state = (await fremd.get('/api/freigabe')).data
  check(state.access === 'approval_needed' && state.contacts.some(c => c.id === rot.id), 'Unbekannt: sieht die Kontaktpersonen zur Auswahl')
  const req = await expectStatus(fremd.post('/api/freigabe', { nick: 'Fremdling', contactId: rot.id }), 200, 'Unbekannt: Freigabe anfragen')
  const personId = req.data.personId
  check(code(await fremd.get('/api/sitzplan')) === 'approval_pending', 'Anfrage wartet')
  check((await leader.get('/api/orga/freigaben')).data.requests.some(r => r.personId === personId && r.approval === 'wartet' && r.contactNick === rot.nick), 'Orga sieht die offene Anfrage mit Kontaktperson')

  const wrong = await interaction({ type: 3, user: { id: ID.blau }, data: { custom_id: `fg:ja:${personId}` }, message: { content: 'x' } })
  check(wrong.data?.data?.flags === 64 && code(await fremd.get('/api/sitzplan')) === 'approval_pending', 'fremde Kontaktperson kann nicht freigeben')
  const ok = await interaction({ type: 3, user: { id: ID.rot }, data: { custom_id: `fg:ja:${personId}` }, message: { content: 'x' } })
  check(ok.data?.type === 7 && /freigegeben/.test(ok.data?.data?.content ?? ''), 'eigene Kontaktperson gibt per Knopf frei')
  const after = await fremd.get('/api/sitzplan')
  check(after.status === 403 && code(after) === 'not_member', `freigegeben, ohne Server: jetzt beitreten (${code(after)})`)
  const again = await interaction({ type: 3, user: { id: ID.rot }, data: { custom_id: `fg:nein:${personId}` }, message: { content: 'x' } })
  check(/schon entschieden/.test(again.data?.data?.content ?? ''), 'nach der Entscheidung ändert der Knopf nichts mehr')
  const member = await stranger('410000000000005001', 'Fremd', true)
  await expectStatus(member.get('/api/sitzplan'), 200, 'freigegeben und auf dem Server: Sitzplan')

  const zweit = await stranger('410000000000005002', 'Zweit', false)
  const r2 = (await zweit.post('/api/freigabe', { nick: 'Zweitling', contactId: blau.id })).data
  await expectStatus(leader.post(`/api/orga/freigaben/${r2.personId}`, { decision: 'abgelehnt' }), 200, 'Orga lehnt ab')
  check(code(await zweit.get('/api/sitzplan')) === 'approval_rejected', 'abgelehnt bleibt draußen')
  await expectStatus(zweit.post('/api/freigabe', { nick: 'Zweitling', contactId: blau.id }), 403, 'abgelehnt: keine neue Anfrage')
  await expectStatus(leader.post(`/api/orga/freigaben/${r2.personId}`, { decision: 'zurück' }), 200, 'Orga setzt die Ablehnung zurück')
  check(code(await zweit.get('/api/sitzplan')) === 'approval_needed', 'zurückgesetzt: kann neu anfragen')
  await expectStatus(zweit.post(`/api/orga/freigaben/${r2.personId}`, { decision: 'frei' }), 403, 'Teilnehmer: Orga-Freigabe nicht erlaubt')
}
