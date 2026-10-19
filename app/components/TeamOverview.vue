<script setup lang="ts">
import { isOrgaPage, orgaHeaders } from '#shared/utils/orgaContext'
/** Zugesagt / abgesagt / offen / ohne Platz und Buchung, gesamt und je Kontaktperson (Orga: alle, Kontaktperson: ihre Leute) */
// unter /orga mit Orga-Rechten (alle Leute), sonst als Kontaktperson (nur die eigenen)
const inOrga = isOrgaPage(useRoute().path)
const { data, refresh, error: loadError } = await useFetch('/api/team/uebersicht', { key: inOrga ? 'orga-team-uebersicht' : 'team-uebersicht', headers: orgaHeaders(useRoute().path) })
defineExpose({ refresh })

type Filter = 'offen' | 'zugesagt' | 'abgesagt' | 'ohnePlatz' | 'warteliste' | 'nichtGebucht' | 'abweichend'
const FILTERS: [Filter, string][] = [
  ['offen', 'Offen'], ['zugesagt', 'Zugesagt'], ['ohnePlatz', 'Ohne Platz'], ['abgesagt', 'Abgesagt'],
  ['warteliste', 'Warteliste'], ['nichtGebucht', 'Nicht gebucht'], ['abweichend', 'Abweichung'],
]
const filter = ref<Filter>('offen')
const contactFilter = ref<number | null | 'alle'>('alle')

const list = computed(() => (data.value?.people ?? []).filter((p) => {
  if (contactFilter.value !== 'alle' && p.contactId !== contactFilter.value) return false
  switch (filter.value) {
    case 'offen': return p.status === 'offen' && !p.waitlist
    case 'zugesagt': return p.status === 'zugesagt'
    case 'abgesagt': return p.status === 'abgesagt'
    case 'ohnePlatz': return p.status === 'zugesagt' && !p.seat
    case 'warteliste': return p.waitlist
    case 'nichtGebucht': return p.status === 'zugesagt' && p.booking !== 'gebucht'
    case 'abweichend': return p.differs
  }
  return true
}).sort((a, b) => a.nick.localeCompare(b.nick, 'de')))

const busy = ref(false)
const error = ref('')
const info = ref('')
async function run(fn: () => Promise<unknown>, ok?: string) {
  busy.value = true
  error.value = ''
  info.value = ''
  try {
    await fn()
    if (ok) info.value = ok
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    busy.value = false
    await refresh()
  }
}

function remind(id: number | 'alle') {
  run(async () => {
    const r = await api<{ queued: number }>('/api/team/erinnern', { method: 'POST', body: id === 'alle' ? { all: true } : { registrationId: id } })
    info.value = r.queued ? `Erinnerung an ${r.queued} ${r.queued === 1 ? 'Person' : 'Personen'} in der Warteschlange.` : 'Niemand zu erinnern (Erinnerungen abbestellt oder ohne Discord).'
  })
}
function setBooked(id: number, booked: boolean) {
  let seat: string | null = null
  if (booked) {
    const answer = prompt('Gebuchter Platz (leer = wie geplant):', '')
    if (answer === null) return
    seat = answer.trim() || null
  }
  run(() => api('/api/sitzplan/gebucht', { method: 'POST', body: { registrationId: id, booked, seat } }))
}
function takeOver(id: number) {
  run(() => api('/api/orga/buchung/uebernehmen', { method: 'POST', body: { registrationId: id } }), 'Platz aus der Buchung übernommen.')
}
function decline(id: number, nick: string) {
  if (confirm(`${nick} absagen? Der Platz wird frei.`)) run(() => api('/api/sitzplan/status', { method: 'POST', body: { registrationId: id, status: 'abgesagt' } }))
}
const STATUS: Record<string, string> = { offen: 'offen', zugesagt: 'zugesagt', abgesagt: 'abgesagt' }
const countOf = (f: Filter) => data.value?.total?.[f] ?? 0
</script>

<template>
  <div v-if="data?.event && data.total">
    <p v-if="error" class="notice err">{{ error }}</p>
    <p v-if="info" class="notice">{{ info }}</p>
    <div class="stats">
      <button v-for="[k, label] in FILTERS" :key="k" type="button" class="stat" :class="{ active: filter === k, bad: k === 'abweichend' && countOf(k) }" @click="filter = k">
        <strong>{{ countOf(k) }}</strong><span>{{ label }}</span>
      </button>
    </div>

    <div v-if="data.perContact.length > 1 || data.isLeader" class="tbl-wrap">
      <table class="tbl per-contact">
        <thead><tr><th>Kontaktperson</th><th class="num">zugesagt</th><th class="num">offen</th><th class="num">abgesagt</th><th class="num">ohne Platz</th><th class="num">gebucht</th></tr></thead>
        <tbody>
          <tr v-for="c in data.perContact" :key="c.contactId ?? 'ohne'" :class="{ sel: contactFilter === c.contactId }" @click="contactFilter = contactFilter === c.contactId ? 'alle' : c.contactId">
            <td><span class="swatch" :style="{ background: c.color }" />{{ c.nick }}</td>
            <td class="num">{{ c.counts.zugesagt }}</td><td class="num">{{ c.counts.offen }}</td><td class="num">{{ c.counts.abgesagt }}</td>
            <td class="num">{{ c.counts.ohnePlatz }}</td><td class="num">{{ c.counts.gebucht }}/{{ c.counts.zugesagt }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="contactFilter !== 'alle'" class="small muted">Gefiltert auf eine Kontaktperson – <a href="#" @click.prevent="contactFilter = 'alle'">alle zeigen</a></p>
    </div>

    <div class="row list-head">
      <h3>{{ FILTERS.find(f => f[0] === filter)?.[1] }} ({{ list.length }})</h3>
      <button v-if="filter === 'offen' && list.length" class="btn small" :disabled="busy" @click="remind('alle')">Alle Offenen jetzt erinnern</button>
    </div>
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>Nick</th><th>Status</th><th>Platz</th><th>Buchung</th><th /></tr></thead>
        <tbody>
          <tr v-for="p in list" :key="p.id" :class="{ differs: p.differs }">
            <td>{{ p.nick }}<span v-if="p.remindersOff" class="sub" title="Erinnerungen abbestellt">🔕</span><span v-if="!p.reachable" class="sub">ohne Discord</span></td>
            <td>{{ STATUS[p.status] }}<span v-if="p.waitlist" class="sub">Warteliste</span></td>
            <td>{{ p.seat ?? '–' }}<span v-if="p.double" class="sub">doppelt</span></td>
            <td>
              <template v-if="p.booking">
                <span :class="p.booking === 'gebucht' ? 'ok-text' : 'muted'">{{ p.booking === 'gebucht' ? 'gebucht' : 'noch nicht' }}</span>
                <span v-if="p.differs" class="bad-text"> · gebucht {{ p.bookedSeat }}</span>
              </template>
            </td>
            <td class="actions">
              <button v-if="p.status === 'offen' && !p.waitlist && p.reachable" class="btn small" :disabled="busy" @click="remind(p.id)">Erinnern</button>
              <button v-if="p.status === 'zugesagt' && p.booking !== 'gebucht'" class="btn small" :disabled="busy" @click="setBooked(p.id, true)">Gebucht</button>
              <button v-if="p.booking === 'gebucht'" class="btn small" :disabled="busy" @click="setBooked(p.id, false)">Nicht gebucht</button>
              <button v-if="p.differs && data.isLeader" class="btn small primary" :disabled="busy" @click="takeOver(p.id)">Platz übernehmen</button>
              <button v-if="p.status === 'zugesagt'" class="btn small danger" :disabled="busy" @click="decline(p.id, p.nick)">Absagen</button>
            </td>
          </tr>
          <tr v-if="!list.length"><td colspan="5" class="muted">Niemand.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  <p v-else-if="loadError" class="notice err">{{ loadError.statusCode === 403 ? 'Diese Übersicht ist nur für Kontaktpersonen und die Orga.' : loadError.statusCode === 401 ? 'Bitte zuerst mit Discord anmelden.' : 'Laden hat nicht geklappt.' }}</p>
  <p v-else class="muted">Es gibt noch kein aktuelles Event.</p>
</template>

<style scoped>
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin: 0 0 16px; }
.stat { display: grid; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--text); text-align: left; cursor: pointer; font: inherit; }
.stat strong { font-size: 22px; }
.stat span { font-size: 13px; color: var(--muted); }
.stat.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.stat.bad strong { color: var(--err); }
.per-contact tr { cursor: pointer; }
.per-contact tr.sel td { background: color-mix(in srgb, var(--accent) 10%, var(--card)); }
.list-head { justify-content: space-between; margin: 16px 0 6px; }
.list-head h3 { margin: 0; font-size: 16px; }
.actions { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
tr.differs td { background: color-mix(in srgb, #d39b1d 12%, var(--card)); }
.bad-text { color: var(--err); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
