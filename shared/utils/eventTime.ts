/**
 * Zeiten von Events: gespeichert als Ortszeit Europe/Berlin im Format JJJJ-MM-TTTHH:mm
 * (genau das, was <input type="datetime-local"> liefert). Discord will UTC, der Container läuft in UTC.
 */

export const EVENT_TIME_ZONE = 'Europe/Berlin'
export const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** Abstand Berlin–UTC in Minuten zu einem Zeitpunkt (Sommerzeit +120, Winterzeit +60) */
function berlinOffsetMinutes(at: Date) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0
}

/** 2026-11-20T18:00 (Berlin) → 2026-11-20T17:00:00.000Z */
export function berlinToUtcIso(local: string) {
  const m = LOCAL_DATETIME.exec(local)
  if (!m) throw new Error(`Ungültige Zeit: ${local}`)
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  // erst mit dem Offset zur geschätzten Zeit rechnen, dann mit dem zur korrigierten (Zeitumstellung)
  let utc = asUtc - berlinOffsetMinutes(new Date(asUtc)) * 60_000
  utc = asUtc - berlinOffsetMinutes(new Date(utc)) * 60_000
  return new Date(utc).toISOString()
}

/** Zeitpunkt → Ortszeit Berlin JJJJ-MM-TTTHH:mm (Gegenstück zu berlinToUtcIso) */
export function utcToBerlinLocal(at: Date | number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(at)).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

function parts(local: string) {
  const m = LOCAL_DATETIME.exec(local)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay()]
  return { day: `${weekday} ${d}.${mo}.${y}`, time: `${h}:${mi}` }
}

/** „Fr 20.11.2026, 18:00 – So 22.11.2026, 14:00“, am selben Tag „Fr 20.11.2026, 18:00–23:00“ */
export function formatEventRange(startsAt: string, endsAt: string) {
  const a = parts(startsAt)
  const b = parts(endsAt)
  if (!a) return startsAt
  if (!b) return `${a.day}, ${a.time}`
  return a.day === b.day ? `${a.day}, ${a.time}–${b.time}` : `${a.day}, ${a.time} – ${b.day}, ${b.time}`
}
