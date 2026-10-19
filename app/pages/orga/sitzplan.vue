<script setup lang="ts">
import { orgaHeaders } from '#shared/utils/orgaContext'
import { CARPETS, coveredSeats, parseSeat, seatLabel, type Carpet } from '#shared/utils/seating'

definePageMeta({ middleware: 'leader' })
useHead({ title: 'Sitzplan · Orga' })

const { data, refresh } = await useFetch('/api/sitzplan', { key: 'orga-sitzplan', headers: orgaHeaders('/orga') })
const people = computed(() => data.value?.people ?? [])
const contacts = computed(() => data.value?.contacts ?? [])
const carpetLabel: Record<Carpet, string> = { none: 'kein Teppich', front: 'Teppich vorn', back: 'Teppich hinten', both: 'Teppich beidseitig' }

const busy = ref(false)
const error = ref('')
async function run(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try {
    await fn()
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    busy.value = false
    await refresh()
  }
}

// ── Gemeldeter Bereich: Plätze anklicken (Umschalt+Klick: von–bis in einer Reihe), speichern, fixieren ──
const marking = ref(false)
const draft = ref(new Set<string>())
watch(() => data.value?.area?.seats, (seats) => {
  if (!marking.value) draft.value = new Set(seats ?? [])
}, { immediate: true })
const areaFixed = computed(() => !!data.value?.area?.fixed)
let lastMark: string | null = null
function onMark(seat: string, range: boolean) {
  const next = new Set(draft.value)
  const a = lastMark ? parseSeat(lastMark) : null
  const b = parseSeat(seat)
  if (range && a && b && a.letter === b.letter) {
    // von–bis in derselben Reihe: alles dazwischen dazu
    const [from, to] = a.number < b.number ? [a.number, b.number] : [b.number, a.number]
    for (let n = from; n <= to; n++) next.add(seatLabel(b.letter, n))
  }
  else if (next.has(seat)) next.delete(seat)
  else next.add(seat)
  // ein doppelt breiter Platz zählt mit dem ganzen Tisch
  const holder = people.value.find(x => x.seat === seat && x.double)
  if (holder) for (const s2 of coveredSeats(holder, data.value?.rows ?? [])) next[next.has(seat) ? 'add' : 'delete'](s2)
  lastMark = seat
  draft.value = next
}
function clearDraft() {
  draft.value = new Set()
  lastMark = null
}
const draftChanged = computed(() => {
  const saved = new Set(data.value?.area?.seats ?? [])
  return saved.size !== draft.value.size || [...draft.value].some(x => !saved.has(x))
})
/** wer beim Fixieren seinen Platz verliert (sitzt außerhalb des markierten Bereichs) */
const outside = computed(() => people.value.filter(x => x.seat && !coveredSeats(x, data.value?.rows ?? []).every(s2 => draft.value.has(s2))))
const saveArea = () => run(async () => {
  await api('/api/orga/bereich', { method: 'PUT', body: { seats: [...draft.value] } })
  marking.value = false
})
const areaInfo = ref('')
function fixArea() {
  const n = outside.value.length
  if (!confirm(`Bereich mit ${draft.value.size} Plätzen fixieren?\n\nDanach gibt es Plätze nur noch im Bereich (Kontaktpersonen setzen ihre Leute dort frei um) und höchstens ${draft.value.size} Zusagen.`
    + (n ? `\n\n${n} sitzen außerhalb und verlieren ihren Platz (sie bekommen eine Nachricht): ${outside.value.map(x => x.nick).join(', ')}` : ''))) return
  run(async () => {
    if (draftChanged.value) await api('/api/orga/bereich', { method: 'PUT', body: { seats: [...draft.value] } })
    const r = await api<{ seats: number, removed: string[], bookedOutside: string[], offered: number }>('/api/orga/bereich/fixieren', { method: 'POST' })
    marking.value = false
    areaInfo.value = `Bereich fixiert: ${r.seats} Plätze.${r.removed.length ? ` Platz verloren: ${r.removed.join(', ')}.` : ''}`
      + (r.bookedOutside.length ? ` Schon gebucht und außerhalb (behalten ihren Platz, bitte von Hand lösen): ${r.bookedOutside.join(', ')}.` : '')
      + (r.offered ? ` ${r.offered} freie Plätze der Warteliste angeboten.` : '')
  })
}
function releaseArea() {
  if (confirm('Fixierung lösen? Dann gelten wieder die normalen Regeln der Platzwahl; der markierte Bereich bleibt zum Bearbeiten.')) {
    run(() => api('/api/orga/bereich/loesen', { method: 'POST' }))
  }
}

const move = (id: number, seat: string | null) => run(() => api('/api/sitzplan/platz', { method: 'POST', body: { registrationId: id, seat } }))

// gewählte Person: Details und Aktionen
const selectedId = ref<number | null>(null)
const selected = computed(() => people.value.find(p => p.id === selectedId.value) ?? null)
const contactNick = (id: number | null) => contacts.value.find(c => c.id === id)?.nick ?? 'keine'
const setDouble = (id: number, double: boolean) => run(() => api(`/api/orga/teilnehmer/${id}`, { method: 'PATCH', body: { double } }))

// Reihen
const newRow = reactive({ letter: '', start: 1, carpet: 'none' as Carpet })
function suggestRow() {
  const letters = (data.value?.rows ?? []).map(r => r.letter)
  const last = letters.at(-1)
  newRow.letter = last && last.length === 1 && last < 'Z' ? String.fromCharCode(last.charCodeAt(0) + 1) : 'A'
}
suggestRow()
const addRow = () => run(async () => {
  await api('/api/orga/reihen', { method: 'POST', body: { ...newRow } })
  await refresh()
  suggestRow()
})
const patchRow = (id: number, body: Record<string, unknown>) => run(() => api(`/api/orga/reihen/${id}`, { method: 'PATCH', body }))
function deleteRow(id: number, letter: string) {
  const seated = people.value.filter(p => p.seat?.startsWith(letter + '-')).length
  if (!confirm(`Reihe ${letter} löschen?${seated ? ` ${seated} Person(en) verlieren ihren Platz.` : ''}`)) return
  run(() => api(`/api/orga/reihen/${id}`, { method: 'DELETE' }))
}
function editRow(id: number, field: 'letter' | 'start', value: string) {
  const body = field === 'start' ? { start: Number(value) } : { letter: value }
  patchRow(id, body)
}
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Sitzplan" />

    <section v-if="!data?.event" class="card">
      <p>Es gibt noch kein aktuelles Event. <NuxtLink to="/orga/events">Event anlegen</NuxtLink></p>
    </section>

    <template v-else>
      <section class="card">
        <h2>{{ data.event.name }}</h2>
        <p class="muted small">
          Ziehen zum Verschieben, auf einen belegten Platz zum Tauschen, auf „Ohne Platz“ zum Freigeben.
          Antippen zeigt Details und weitere Aktionen.
        </p>
        <p v-if="error" class="notice err">{{ error }}</p>

        <div v-if="selected" class="selected notice">
          <strong>{{ selected.nick }}</strong>
          · Platz {{ selected.seat ?? '–' }} · Kontaktperson {{ contactNick(selected.contactId) }}
          <span class="row">
            <button class="btn small" :disabled="busy" @click="setDouble(selected.id, !selected.double)">{{ selected.double ? 'Einfach breit machen' : 'Doppelt breit machen' }}</button>
            <button v-if="selected.seat" class="btn small" :disabled="busy" @click="move(selected.id, null)">Platz freigeben</button>
            <NuxtLink class="btn small" :to="{ path: '/orga/teilnehmer', query: { q: selected.nick } }">In der Teilnehmerliste</NuxtLink>
          </span>
        </div>

        <SeatMap
          :rows="data.rows"
          :people="people"
          :contacts="contacts"
          :movable="() => true"
          :mine="data.me?.registrationId"
          :pool="people.filter(p => !p.seat)"
          :held="data.held"
          :area="marking ? [...draft] : data.area?.seats"
          :marking="marking"
          :busy="busy"
          @mark="onMark"
          @move="move"
          @select="id => id !== null && (selectedId = id)"
        />
      </section>

      <section class="card">
        <h2>Gemeldeter Bereich</h2>
        <p class="muted small">
          Den Bereich, den du dem Veranstalter meldest, im Plan oben markieren: „Markieren“, dann Plätze anklicken
          (Umschalt+Klick wählt von–bis in einer Reihe). Fixiert gilt: Wer außerhalb sitzt, verliert seinen Platz und bekommt
          eine Nachricht; Teilnehmer setzen sich nur noch, wenn sie keinen Platz haben, Kontaktpersonen setzen und tauschen ihre Leute frei – alles nur im Bereich; es gibt höchstens so viele Zusagen wie
          Plätze, danach Warteliste, und frei werdende Plätze im Bereich gehen automatisch an die Warteliste.
        </p>
        <p v-if="areaInfo" class="notice">{{ areaInfo }}</p>
        <p>
          <strong>{{ draft.size }}</strong> Plätze markiert
          <span v-if="areaFixed" class="badge ok">fixiert</span>
          <span v-else-if="draft.size" class="badge">Entwurf{{ draftChanged ? ', nicht gespeichert' : '' }}</span>
          <template v-if="!areaFixed && draft.size && outside.length"> · {{ outside.length }} sitzen außerhalb: {{ outside.map(x => x.nick).join(', ') }}</template>
        </p>
        <div class="row">
          <template v-if="!areaFixed">
            <button class="btn small" :class="{ active: marking }" :disabled="busy" @click="marking = !marking">{{ marking ? 'Markieren beenden' : 'Markieren' }}</button>
            <button v-if="draftChanged" class="btn small" :disabled="busy" @click="saveArea">Speichern</button>
            <button v-if="draft.size" class="btn small" :disabled="busy" @click="clearDraft">Alles abwählen</button>
            <button class="btn small primary" :disabled="busy || !draft.size" @click="fixArea">Bereich fixieren</button>
          </template>
          <button v-else class="btn small" :disabled="busy" @click="releaseArea">Fixierung lösen</button>
        </div>
      </section>

      <section class="card">
        <h2>Reihen</h2>
        <p class="muted small">
          Jede Reihe hat 40 Plätze ab der Startnummer (z. B. A ab 81 = A-81 … A-120), je zwei bilden einen Tisch.
          Ändern sich Buchstabe oder Startnummer, wandern die Leute mit.
        </p>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Reihe</th><th>Start</th><th>Plätze</th><th>Teppich</th><th>Belegt</th><th /></tr></thead>
            <tbody>
              <tr v-for="(r, i) in data.rows" :key="r.id">
                <td><input :value="r.letter" maxlength="2" size="3" @change="editRow(r.id, 'letter', ($event.target as HTMLInputElement).value)"></td>
                <td><input type="number" :value="r.start" min="1" max="9960" style="width: 90px" @change="editRow(r.id, 'start', ($event.target as HTMLInputElement).value)"></td>
                <td class="muted">{{ r.letter }}-{{ r.start }} … {{ r.letter }}-{{ r.start + 39 }}</td>
                <td>
                  <select :value="r.carpet" @change="patchRow(r.id, { carpet: ($event.target as HTMLSelectElement).value })">
                    <option v-for="c in CARPETS" :key="c" :value="c">{{ carpetLabel[c] }}</option>
                  </select>
                </td>
                <td>{{ people.filter(p => p.seat?.startsWith(r.letter + '-')).length }}</td>
                <td><span class="row">
                  <button class="btn small" :disabled="busy || i === 0" title="nach oben" @click="patchRow(r.id, { move: -1 })">↑</button>
                  <button class="btn small" :disabled="busy || i === data.rows.length - 1" title="nach unten" @click="patchRow(r.id, { move: 1 })">↓</button>
                  <button class="btn small danger" :disabled="busy" @click="deleteRow(r.id, r.letter)">Löschen</button>
                </span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <form class="form-grid add" @submit.prevent="addRow">
          <label class="field"><span>Neue Reihe</span><input v-model="newRow.letter" required maxlength="2" pattern="[A-Za-z]{1,2}"></label>
          <label class="field"><span>Startnummer</span><input v-model.number="newRow.start" type="number" min="1" max="9960" required></label>
          <label class="field"><span>Teppich</span>
            <select v-model="newRow.carpet"><option v-for="c in CARPETS" :key="c" :value="c">{{ carpetLabel[c] }}</option></select>
          </label>
          <div><button class="btn primary" :disabled="busy">Reihe anlegen</button></div>
        </form>
      </section>
    </template>
  </div>
</template>

<style scoped>
.selected { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-bottom: 12px; }
.add { margin-top: 16px; }
</style>
