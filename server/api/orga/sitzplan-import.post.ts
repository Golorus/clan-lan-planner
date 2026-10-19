import { CARPETS, fitsSeat, isLeftSeat, ROW_LETTER, rowOfSeat, seatLabel, type SeatHolder } from '#shared/utils/seating'

/**
 * Import ins aktuelle Event, ergänzend (nichts wird gelöscht):
 * - unser eigener JSON-Export (format „lan-planner-sitzplan“)
 * - Daten aus dem Original-Seat-Planner (d3molite/Seat-Planner): eine Liste von Attendees
 *   (NickName, NumberOfSeats, SeatIdentifier …), wahlweise mit SeatingRows (Letter, StartingSeat),
 *   auch als Event-Objekt { Year, Attendees, SeatingRows }. Groß-/Kleinschreibung der Felder egal.
 * Reihen kommen dazu, wenn es den Buchstaben noch nicht gibt. Vorhandene Personen (gleiche Discord-ID, sonst gleicher Nick)
 * bekommen eine Teilnahme, neue werden angelegt; wer schon teilnimmt, wird übersprungen.
 * Wer auf einem belegten oder unbekannten Platz säße, kommt ohne Platz herein.
 */
type Obj = Record<string, unknown>

function pick(o: Obj, ...keys: string[]) {
  const lower = new Map(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]))
  for (const k of keys) if (lower.has(k.toLowerCase())) return lower.get(k.toLowerCase())
  return undefined
}
const str = (v: unknown) => typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

export default defineEventHandler(async (event) => {
  const leader = await requireLeader(event)
  const data = await readBody<unknown>(event)
  const root: Obj = Array.isArray(data) ? { attendees: data } : isObj(data) ? data : {}
  const rawPeople = pick(root, 'attendees')
  const rawRows = pick(root, 'rows', 'seatingRows')
  if (!Array.isArray(rawPeople)) throw createError({ statusCode: 400, statusMessage: 'In der Datei stehen keine Teilnehmer (attendees).' })
  if (rawPeople.length > 5000) throw createError({ statusCode: 400, statusMessage: 'Zu viele Einträge.' })
  const actor = { discordId: leader.discordId, name: leader.displayName || leader.username }

  return useDb().transaction((tx) => {
    const ev = requireCurrentEvent(tx)
    const result = { rows: 0, people: 0, newPersons: 0, seated: 0, unseated: 0, skipped: [] as string[] }

    // Reihen
    const existingRows = loadRows(tx, ev.id)
    let position = existingRows.length
    for (const r of Array.isArray(rawRows) ? rawRows.filter(isObj) : []) {
      const letter = str(pick(r, 'letter')).trim().toUpperCase()
      const start = Number(pick(r, 'start', 'startingSeat'))
      const carpetRaw = str(pick(r, 'carpet'))
      const carpet = (CARPETS as readonly string[]).includes(carpetRaw) ? carpetRaw as typeof CARPETS[number] : 'none'
      if (!ROW_LETTER.test(letter) || !Number.isInteger(start) || start < 1 || start > 9960) continue
      if (existingRows.some(x => x.letter === letter)) continue
      const created = tx.insert(tables.seatRows).values({ eventId: ev.id, letter, start, carpet, position: position++ }).returning().get()
      existingRows.push(created)
      result.rows++
    }

    // Leute: vorhandene Personen (per Discord-ID, sonst Nick) bekommen eine Teilnahme, neue werden angelegt
    const contactsByNick = new Map(tx.select().from(tables.contacts).all().map(c => [c.nick.toLocaleLowerCase('de'), c.id]))
    const regs = loadRegistrations(tx, ev.id)
    const holders: SeatHolder[] = regs.map(r => ({ id: r.id, seat: r.seat, double: r.double, discordId: r.discordId, contactId: r.contactId }))
    const persons = tx.select().from(tables.persons).all()
    const byDiscord = new Map(persons.flatMap(p => p.discordId ? [[p.discordId, p] as const] : []))
    const byNick = new Map(persons.map(p => [p.nick.toLocaleLowerCase('de'), p] as const))
    const participating = new Set(regs.map(r => r.personId))
    const now = new Date()

    for (const p of rawPeople.filter(isObj)) {
      const nick = cleanText(str(pick(p, 'nick', 'nickName')) || [str(pick(p, 'firstName')), str(pick(p, 'lastName'))].join(' ')).slice(0, 32)
      if (nick.length < 2) continue
      const discordIdRaw = str(pick(p, 'discordId'))
      const discordId = /^d{5,25}$/.test(discordIdRaw) ? discordIdRaw : null
      let person = (discordId && byDiscord.get(discordId)) || byNick.get(nick.toLocaleLowerCase('de'))
      // gleicher Nick, aber eine andere Discord-ID: das ist jemand anderes
      if (person && discordId && person.discordId && person.discordId !== discordId) {
        result.skipped.push(`${nick} (Nick schon vergeben)`)
        continue
      }
      if (person && participating.has(person.id)) {
        result.skipped.push(`${nick} (nimmt schon teil)`)
        continue
      }
      if (!person) {
        const contactId = contactsByNick.get(str(pick(p, 'contact')).toLocaleLowerCase('de')) ?? null
        person = tx.insert(tables.persons).values({
          discordId, discordName: discordId ? cleanText(str(pick(p, 'discordName'))) || null : null,
          nick, contactId, createdAt: now, updatedAt: now,
        }).returning().get()
        byNick.set(nick.toLocaleLowerCase('de'), person)
        if (discordId) byDiscord.set(discordId, person)
        result.newPersons++
      }
      const double = pick(p, 'double') === true || Number(pick(p, 'numberOfSeats')) > 1
      let wanted = str(pick(p, 'seat', 'seatIdentifier')).trim().toUpperCase()
      // Doppelplätze liegen bei uns links am Tisch (niedrigere Nummer), im Original-Seat-Planner auf der zweiten Nummer
      const found = double && wanted ? rowOfSeat(existingRows, wanted) : null
      if (found && !isLeftSeat(found.row, found.number)) wanted = seatLabel(found.row.letter, found.number - 1)
      const seat = wanted && fitsSeat(existingRows, holders, { id: -1, double }, wanted).ok ? wanted : null
      const created = tx.insert(tables.registrations).values({ eventId: ev.id, personId: person.id, seat, double, createdAt: now, updatedAt: now })
        .returning({ id: tables.registrations.id }).get()
      holders.push({ id: created.id, seat, double, discordId: person.discordId, contactId: person.contactId })
      participating.add(person.id)
      result.people++
      if (seat) result.seated++
      else if (wanted) result.unseated++
    }
    writeLog(tx, ev.id, actor, { action: 'importiert', detail: `${result.people} Person(en), ${result.rows} Reihe(n)` })
    return result
  })
})
