<script setup lang="ts">
import type { MapPerson } from '../components/SeatMap.vue'

useHead({ title: 'Sitzplan' })
const { appName } = useBranding()
const route = useRoute()

// nur nach Discord-Login für Eingeladene; sonst 401 (anmelden) oder 403 (Freigabe nötig, nicht auf unserem Server)
const { data, refresh, error: loadError } = await useFetch('/api/sitzplan', { key: 'sitzplan' })
const gate = computed(() => {
  const e = loadError.value
  if (!e) return null
  const code = (e.data as { data?: { code?: string } } | undefined)?.data?.code
  if (e.statusCode === 401) return 'login'
  if (e.statusCode === 403 && code === 'not_member') return 'not_member'
  if (e.statusCode === 403 && (code === 'approval_needed' || code === 'approval_pending' || code === 'approval_rejected')) return code
  return 'error'
})

const me = computed(() => data.value?.me ?? null)
const people = computed(() => data.value?.people ?? [])
const seatsOpen = computed(() => !!data.value?.event?.seatsOpen)
const areaFixed = computed(() => !!data.value?.area?.fixed)

/** Wer darf wen ziehen – nur Bedienkomfort, entscheiden tut der Server */
function movable(p: MapPerson) {
  const m = me.value
  if (!m) return false
  if (m.isLeader) return true
  const own = p.id === m.registrationId
  const mine = m.contactId !== null && p.contactId === m.contactId
  // gebucht = personalisiertes Ticket: umsetzen nur die Orga
  if (p.booked && p.seat) return false
  // fixierter Bereich: Kontaktpersonen ihre Leute frei im Bereich; selbst bis zum Buchungsstart frei im Bereich,
  // danach nur ohne Platz (oder einmal nach dem Nachrücken)
  if (areaFixed.value) return mine || (own && (seatsOpen.value || !p.seat || m.swapLeft))
  if (!seatsOpen.value) return own && m.swapLeft
  if (m.contactId !== null && p.contactId === m.contactId) return true
  return p.id === m.registrationId
}
const pool = computed(() => people.value.filter(p => !p.seat && movable(p)))

const busy = ref(false)
const error = ref('')
async function move(id: number, seat: string | null) {
  busy.value = true
  error.value = ''
  try {
    await api('/api/sitzplan/platz', { method: 'POST', body: { registrationId: id, seat } })
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    busy.value = false
    await refresh()
  }
}

// Plan regelmäßig aktualisieren, damit man sieht, was andere gerade tun
let timer: ReturnType<typeof setInterval> | undefined
const selecting = ref(false)
onMounted(() => {
  timer = setInterval(() => {
    if (!gate.value && !busy.value && !selecting.value && document.visibilityState === 'visible') refresh()
  }, 20_000)
})
onBeforeUnmount(() => clearInterval(timer))

const seatedCount = computed(() => people.value.filter(p => p.seat).length)
const usedContacts = computed(() => (data.value?.contacts ?? []).filter(c => people.value.some(p => (p.ownContactId ?? p.contactId) === c.id)))
/** Kontaktperson: ihre zugesagten Leute */
const myPeople = computed(() => me.value?.contactId ? people.value.filter(p => p.contactId === me.value!.contactId) : [])
// QA-Umgebung: als Demo-Person anmelden (server/utils/demo.ts)
const { data: demo } = await useFetch('/api/demo', { key: 'demo' })
const loginHref = computed(() => '/auth/discord?redirect=' + encodeURIComponent(route.fullPath === '/' ? '/?registrieren=1' : route.fullPath))
</script>

<template>
  <div class="wrap wide">
    <p v-if="route.query.login === 'fehler'" class="card err">
      Die Anmeldung mit Discord hat nicht geklappt. Bitte noch einmal versuchen.
    </p>
    <p v-if="route.query.geloescht === '1'" class="card notice">Deine Daten sind gelöscht.</p>

    <section v-if="gate === 'login'" class="card gate">
      <h1>{{ appName }}</h1>
      <p>Hier planen wir unsere Events: wer dabei ist, wer wo sitzt, wer schon gebucht hat. Melde dich mit Discord an, um mitzumachen.</p>
      <a class="btn discord" :href="loginHref">Mit Discord anmelden</a>
      <div v-if="demo?.personas.length" class="demo">
        <h2>Testumgebung: ohne Discord ansehen als …</h2>
        <a v-for="p in demo.personas" :key="p.key" class="btn" :href="`/auth/demo?as=${p.key}`">{{ p.name }}<span class="muted small">{{ p.text }}</span></a>
      </div>
    </section>

    <FreigabeGate v-else-if="gate === 'approval_needed' || gate === 'approval_pending' || gate === 'approval_rejected'" :code="gate" @changed="refresh" />

    <section v-else-if="gate === 'not_member'" class="card gate">
      <h1>Freigegeben: jetzt noch Discord</h1>
      <p>Du bist freigegeben. Damit dich der Bot erreicht (Platz, Erinnerungen), tritt bitte noch unserem Discord-Server bei – Discord fragt dich dabei um Erlaubnis.</p>
      <a class="btn discord" href="/auth/discord?join=1&redirect=%2F%3Fregistrieren%3D1">Discord-Server beitreten</a>
    </section>

    <section v-else-if="gate === 'error'" class="card err">
      <p>Der Sitzplan lässt sich gerade nicht laden: {{ loadError?.statusMessage || loadError?.message }}</p>
      <button class="btn" @click="refresh()">Noch einmal</button>
    </section>

    <section v-else-if="!data?.event" class="card">
      <h2>Sitzplan</h2>
      <p class="muted">Für das nächste Event gibt es noch keinen Sitzplan. Schau bald wieder vorbei!</p>
    </section>

    <template v-else-if="me">
      <div class="top" :class="{ 'with-team': me.team }">
        <StandPanel :event="data.event" :contacts="data.contacts" :me="me" :confirmed="people.length" @changed="refresh" />
        <DeineLeute v-if="me.team" :team="me.team" :people="myPeople" :booking-released="data.event.bookingReleased" />
      </div>

      <div class="layout">
        <section id="sitzplan" class="card plan">
          <div class="plan-head">
            <h2>Sitzplan</h2>
            <p class="muted small">
              {{ people.length }} Zusage{{ people.length === 1 ? '' : 'n' }} · {{ seatedCount }} mit Platz<template v-if="data.event.maxParticipants"> · höchstens {{ data.event.maxParticipants }}</template><template v-if="data.event.waiting"> · {{ data.event.waiting }} auf der Warteliste</template>
            </p>
          </div>
          <div v-if="usedContacts.length" class="legend">
            <span class="muted">Farbe = Kontaktperson:</span>
            <span v-for="c in usedContacts" :key="c.id"><span class="ring" :style="{ background: c.color }" />{{ c.nick }}</span>
            <span v-if="data.area" class="muted"><span class="area-mark" />gemeldeter Bereich</span>
          </div>
          <p v-if="error" class="notice err">{{ error }}</p>
          <SeatMap
            :rows="data.rows"
            :people="people"
            :contacts="data.contacts"
            :movable="movable"
            :mine="me.registrationId"
            :pool="pool"
            :held="data.held"
            :area="data.area?.seats"
            :limit-to-area="areaFixed && !me.isLeader"
            :busy="busy"
            @move="move"
            @select="id => (selecting = id !== null)"
          />
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gate { max-width: 640px; margin: 24px auto; }
.gate h1 { margin: 0 0 10px; font-size: 22px; }
.demo { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); display: grid; gap: 8px; }
.demo h2 { font-size: 16px; margin: 0; }
.demo .btn { justify-content: space-between; flex-wrap: wrap; }
.top { display: grid; gap: 0 16px; align-items: start; }
@media (min-width: 960px) { .top.with-team { grid-template-columns: minmax(0, 3fr) minmax(0, 1fr); } }
.plan-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 12px; margin-bottom: 8px; }
.plan-head h2 { margin: 0; }
.plan-head p { margin: 0; }
.layout { display: grid; gap: 16px; }
.plan { min-width: 0; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-bottom: 10px; font-size: 14px; align-items: center; }
.area-mark { display: inline-block; width: 14px; height: 14px; border: 2px dashed #2e86ab; border-radius: 4px; margin-right: 6px; vertical-align: -2px; box-sizing: border-box; }
.ring { display: inline-block; width: 14px; height: 14px; border-radius: 4px; margin-right: 6px; vertical-align: -2px; }
</style>
