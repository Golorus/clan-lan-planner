import { check, ID, interaction } from './lib.mjs'

/** Spielrunden: /spielen, /spiele, Knöpfe unter der Karte (ohne Bot erscheint die Karte als Antwort auf den Befehl) */
export default async function (ctx) {
  const { regOf } = ctx
  console.log('Spielrunden')
  const ping = await interaction({ type: 1 })
  if (ping.status === 401) {
    console.log('  (übersprungen: ohne NUXT_DISCORD_PUBLIC_KEY gibt es keine Knöpfe)')
    return
  }
  const ORGA = '410000000000000001'
  const STRANGER = '410000000000009001'
  const opt = (name, value, type = 3, focused) => ({ name, type, value, ...(focused ? { focused: true } : {}) })
  const spielen = (user, ...options) => interaction({ type: 2, channel_id: '700000000000000001', user: { id: user }, data: { name: 'spielen', options } })
  const press = (user, id, messageId = '800000000000000001') => interaction({ type: 3, channel_id: '700000000000000001', user: { id: user }, data: { custom_id: id }, message: { id: messageId, content: 'x' } })
  const btnIds = res => res.data?.data?.components?.[0]?.components?.map(c => c.custom_id) ?? []

  // wer gerade zugesagt hat, darf mitspielen
  const zugesagt = []
  for (const id of Object.values(ID)) if ((await regOf(id))?.status === 'zugesagt') zugesagt.push(id)
  check(zugesagt.length >= 2, `mindestens zwei Zugesagte für die Runde (${zugesagt.length})`)
  const [p1, p2] = zugesagt

  const ac = await interaction({ type: 4, user: { id: ORGA }, data: { name: 'spielen', options: [opt('spiel', 'coun', 3, true)] } })
  check(ac.data?.type === 8 && ac.data.data.choices.some(c => c.value === 'Counter-Strike 2'), '/spielen: Spiele werden vorgeschlagen (aus gamesSeed)')
  const acMode = await interaction({ type: 4, user: { id: ORGA }, data: { name: 'spielen', options: [opt('spiel', 'Counter-Strike 2'), opt('modus', '', 3, true)] } })
  check(acMode.data?.data?.choices.some(c => c.value === 'Wingman (2er-Stack)' && /2 Plätze/.test(c.name)), '/spielen: Modi des Spiels mit Plätzen')

  const no = await spielen(STRANGER, opt('spiel', 'Counter-Strike 2'), opt('modus', 'Wingman (2er-Stack)'))
  check(no.data?.data?.flags === 64 && /zugesagt/.test(no.data?.data?.content), '/spielen: ohne Zusage abgewiesen')
  const which = await spielen(ORGA, opt('spiel', 'Counter-Strike 2'))
  check(/Welcher Modus/.test(which.data?.data?.content ?? ''), '/spielen ohne Modus bei mehreren: fragt nach dem Modus')
  const unknown = await spielen(ORGA, opt('spiel', 'Testspiel E2E'))
  check(/kenne ich noch nicht/.test(unknown.data?.data?.content ?? ''), 'neues Spiel ohne Plätze: Hinweis')
  const badTime = await spielen(ORGA, opt('spiel', 'Counter-Strike 2'), opt('modus', 'Wingman (2er-Stack)'), opt('zeit', 'irgendwann'))
  check(/verstehe ich nicht/.test(badTime.data?.data?.content ?? ''), 'kaputte Zeit: Hinweis')

  const card = await spielen(p1, opt('spiel', 'counter-strike 2'), opt('modus', 'wingman (2er-stack)'), opt('zeit', 'in 2 h'))
  check(card.data?.type === 4 && !card.data.data.flags && /Wingman/.test(card.data.data.content) && /1\/2/.test(card.data.data.content), 'ohne Bot: Karte erscheint als Antwort, 1/2')
  const [dabei, raus, ab] = btnIds(card)
  check(/^sr:dabei:\d+$/.test(dabei ?? ''), 'Karte hat Knöpfe')

  const again = await press(p1, dabei)
  check(again.data?.data?.flags === 64 && /schon dabei/.test(again.data.data.content), 'Ersteller drückt „Bin dabei“: schon dabei')
  const strangerJoin = await press(STRANGER, dabei)
  check(strangerJoin.data?.data?.flags === 64, 'ohne Zusage: nicht mitspielen')
  const j2 = await press(p2, dabei)
  check(j2.data?.type === 7 && /2\/2/.test(j2.data.data.content) && /Voll/.test(j2.data.data.content), 'zweiter Spieler: Karte aktualisiert, voll')
  const next = await press(ORGA, dabei)
  check(next.data?.type === 4 && /Runde 2/.test(next.data?.data?.content ?? '') && /1\/2/.test(next.data.data.content), 'voll: „Bin dabei“ macht Runde 2 auf')
  const [dabei2, , ab2] = btnIds(next)

  const notCreator = await press(p2, ab)
  check(notCreator.data?.data?.flags === 64 && /nur, wer die Runde aufgemacht hat/.test(notCreator.data.data.content), 'Absagen nur durch den Ersteller')
  const leave = await press(p2, raus)
  check(leave.data?.type === 7 && /1\/2/.test(leave.data.data.content), '„Raus“: wieder 1/2')
  const cancel = await press(p1, ab)
  check(cancel.data?.type === 7 && /abgesagt/.test(cancel.data.data.content) && !cancel.data.data.components.length, 'Ersteller sagt ab: Karte ohne Knöpfe')
  const late = await press(p2, dabei)
  check(/abgesagt/.test(late.data?.data?.content ?? ''), 'abgesagte Runde nimmt niemanden mehr')
  const cancel2 = await press(ORGA, ab2, '800000000000000002')
  check(/abgesagt/.test(cancel2.data?.data?.content ?? ''), 'Runde 2 abgesagt')
  check(!!dabei2, 'Runde 2 hat eigene Knöpfe')

  const created = await spielen(ORGA, opt('spiel', 'Testspiel E2E'), opt('modus', 'Duell'), opt('plätze', 2, 4), opt('notiz', 'nur Spaß'))
  check(created.data?.type === 4 && /Testspiel E2E · Duell/.test(created.data.data.content) && /nur Spaß/.test(created.data.data.content), 'neues Spiel mit Plätzen angelegt')
  const remembered = await interaction({ type: 4, user: { id: ORGA }, data: { name: 'spielen', options: [opt('spiel', 'Testspiel E2E'), opt('modus', '', 3, true)] } })
  check(remembered.data?.data?.choices.some(c => c.value === 'Duell' && /2 Plätze/.test(c.name)), 'Plätze des neuen Modus gemerkt')
  await press(ORGA, btnIds(created)[2], '800000000000000003')

  const list = await interaction({ type: 2, user: { id: p1 }, data: { name: 'spiele', options: [{ name: 'liste', type: 1, options: [] }] } })
  check(list.data?.data?.flags === 64 && /Counter-Strike 2/.test(list.data.data.content) && /Testspiel E2E/.test(list.data.data.content), '/spiele liste: alle Spiele')
  const edit = (user, ...options) => interaction({ type: 2, user: { id: user }, data: { name: 'spiele', options: [{ name: 'ändern', type: 1, options }] } })
  check(/nur die Orga/.test((await edit(p1, opt('spiel', 'Testspiel E2E'), opt('modus', 'Duell'), opt('plätze', 4, 4))).data?.data?.content ?? ''), '/spiele ändern: nur Orga')
  check(/4 Plätze/.test((await edit(ORGA, opt('spiel', 'Testspiel E2E'), opt('modus', 'Duell'), opt('plätze', 4, 4))).data?.data?.content ?? ''), '/spiele ändern: Orga ändert Plätze')
  check(/entfernt/.test((await edit(ORGA, opt('spiel', 'Testspiel E2E'), opt('modus', 'Duell'), opt('plätze', 0, 4))).data?.data?.content ?? ''), '/spiele ändern plätze:0: Modus entfernt')
  const gone = await interaction({ type: 4, user: { id: ORGA }, data: { name: 'spielen', options: [opt('spiel', 'Testspiel', 3, true)] } })
  check(!gone.data?.data?.choices.some(c => c.value === 'Testspiel E2E'), 'Spiel ohne Modus nicht mehr in der Auswahl')

  const kan = await ctx.leader.get('/api/orga/discord/kanaele')
  check(kan.status === 200 && kan.data.playChannelId === null, 'Spielkanal: noch keiner')
  const put = await ctx.leader.put('/api/orga/discord/spielkanal', { channelId: '700000000000000009' })
  check(put.status === 200 && put.data.playChannelId === '700000000000000009', 'Spielkanal speichern')
  check((await ctx.rot.put('/api/orga/discord/spielkanal', { channelId: null })).status === 403, 'Kontaktperson setzt den Spielkanal nicht')
  await ctx.leader.put('/api/orga/discord/spielkanal', { channelId: null })
}
