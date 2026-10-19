import { check, expectStatus, ID } from './lib.mjs'

/** Eigene Daten löschen */
export default async function (ctx) {
  const { ROT, anna, anon, leader, rot } = ctx
  console.log('Eigene Daten löschen')
  await expectStatus(anon.del('/api/konto'), 401, 'anonym löschen')
  const gone = await expectStatus(anna.del('/api/konto'), 200, 'Anna löscht ihre Daten')
  check(gone.data.registrations === 2, `Annas Registrierungen in beiden Events gelöscht (${gone.data.registrations})`)
  const people2 = (await leader.get('/api/orga/teilnehmer')).data.people
  check(!people2.some(p => p.discordId === ID.anna), 'Anna steht nicht mehr in der Teilnehmerliste')
  check(!(await leader.get('/api/orga/personen')).data.people.some(p => p.discordId === ID.anna), 'Anna gibt es auch als Person nicht mehr')
  const exp = (await leader.get('/api/orga/export?format=csv')).text
  check(!exp.includes(ID.anna), 'Annas Discord-ID nirgends mehr im Export')
  const log2 = (await leader.get('/api/orga/protokoll')).data
  check(log2.every(l => l.actorDiscordId !== ID.anna && l.nick !== 'Anna'), 'Protokoll ohne Annas ID und Nick')
  check((await rot.get('/api/sitzplan')).data.me.contactId === ROT, 'Kontaktperson bleibt Kontaktperson')
}
