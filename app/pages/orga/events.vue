<script setup lang="ts">
import { formatEventRange } from '#shared/utils/eventTime'
import type { EventFields } from '~/components/EventForm.vue'

definePageMeta({ middleware: 'leader' })
useHead({ title: 'Events · Orga' })
const { eventRoleName } = useBranding()

const { data, refresh } = await useFetch('/api/orga/events', { key: 'orga-events' })

const busy = ref(false)
const error = ref('')
const info = ref('')
async function run(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  info.value = ''
  try {
    await fn()
    return true
  }
  catch (e) {
    error.value = apiError(e)
    return false
  }
  finally {
    busy.value = false
    await refresh()
  }
}

const patch = (id: number, body: Record<string, unknown>) => run(() => api(`/api/orga/events/${id}`, { method: 'PATCH', body }))
function makeCurrent(id: number, name: string) {
  if (confirm(`„${name}“ zum aktuellen Event machen? Der Sitzplan zeigt dann dieses Event, alle bekannten Personen stehen darin als „offen“, und die ${eventRoleName} gilt für die Zugesagten dieses Events.`)) patch(id, { isCurrent: true })
}

const editing = ref<number | null>(null)
const editingReg = ref<number | null>(null)
const announcing = ref<number | null>(null)
async function announced(r: { threadUrl: string }) {
  announcing.value = null
  info.value = `Angekündigt, der private Thread ist angelegt: ${r.threadUrl}`
  await refresh()
}
async function saveReg(id: number, body: Record<string, unknown>) {
  if (await patch(id, body)) editingReg.value = null
}
const deadline = (local: string) => local ? formatEventRange(local, '') : '–'
async function save(id: number, fields: EventFields) {
  if (await patch(id, { ...fields })) editing.value = null
}

const createKey = ref(0)
async function create(fields: EventFields & { copyRowsFrom?: number | null, makeCurrent?: boolean }) {
  if (await run(() => api('/api/orga/events', { method: 'POST', body: fields }))) {
    info.value = `„${fields.name}“ angelegt.`
    createKey.value++
  }
}

async function discord(id: number) {
  await run(async () => {
    const res = await api<{ created: boolean, url: string }>(`/api/orga/events/${id}/discord`, { method: 'POST' })
    info.value = res.created ? 'Discord-Event erstellt.' : 'Discord-Event aktualisiert.'
  })
}
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Events" />
    <p v-if="error" class="notice err">{{ error }}</p>
    <p v-if="info" class="notice">{{ info }}</p>

    <section v-for="e in data" :key="e.id" class="card" :class="{ current: e.isCurrent }">
      <div class="row head">
        <h2>{{ e.name }} <span v-if="e.isCurrent" class="ok-text small">aktuell</span></h2>
        <label class="small" title="Aus = Bedarfsabfrage vorzeitig schließen (danach nur noch Warteliste)"><input type="checkbox" :checked="e.registrationOpen" :disabled="busy" @change="patch(e.id, { registrationOpen: ($event.target as HTMLInputElement).checked })"> Bedarfsabfrage offen</label>
      </div>
      <template v-if="editing !== e.id">
        <p class="muted">
          {{ formatEventRange(e.startsAt, e.endsAt) }}<template v-if="e.location"> · {{ e.location }}</template><br>
          {{ e.rows }} Reihen · {{ e.registrations }} Zusagen<template v-if="e.maxParticipants"> (höchstens {{ e.maxParticipants }})</template>
        </p>
        <p class="small deadlines">
          Bedarfsabfrage bis <strong>{{ deadline(e.demandUntil) }}</strong><template v-if="e.demandClosedAt && !e.registrationOpen"> · vorzeitig geschlossen</template>
          · Erinnerungen {{ e.remindDays.join(', ') || '–' }} Tage vorher<br>
          Buchung: {{ e.bookingCode ? 'Code eingetragen' : 'kein Code' }} · Buchungsstart (Ende der Platzwahl) {{ deadline(e.bookingFrom) }} · buchen bis {{ deadline(e.bookingUntil) }}
          <template v-if="e.bookingReleasedAt"> · <span class="ok-text">freigegeben</span></template>
          · Warteliste {{ e.waitlistAuto ? `automatisch, Angebot ${e.offerHours} h` : 'nur von Hand' }}
        </p>
        <p v-if="e.description" class="desc">{{ e.description }}</p>
        <div class="row">
          <button class="btn small" :disabled="busy" @click="editing = e.id">Bearbeiten</button>
          <button class="btn small" :disabled="busy" @click="editingReg = editingReg === e.id ? null : e.id">Fristen &amp; Buchung</button>
          <button v-if="!e.isCurrent" class="btn small" :disabled="busy" @click="makeCurrent(e.id, e.name)">Zum aktuellen machen</button>
          <button class="btn small discord" :disabled="busy" :title="e.location ? '' : 'Erst einen Ort eintragen'" @click="discord(e.id)">
            {{ e.discordEventUrl ? 'Discord-Event aktualisieren' : 'Discord-Event erstellen' }}
          </button>
          <a v-if="e.discordEventUrl" class="small" :href="e.discordEventUrl" target="_blank" rel="noopener">In Discord ansehen</a>
          <button v-if="e.isCurrent && !e.threadUrl" class="btn small discord" :disabled="busy" @click="announcing = announcing === e.id ? null : e.id">In #organisation ankündigen</button>
          <a v-if="e.announceUrl" class="small" :href="e.announceUrl" target="_blank" rel="noopener">Ankündigung</a>
          <a v-if="e.threadUrl" class="small" :href="e.threadUrl" target="_blank" rel="noopener">Privater Thread</a>
        </div>
      </template>
      <AnnounceForm v-if="announcing === e.id && editing !== e.id" :event-id="e.id" @done="announced" @cancel="announcing = null" />
      <EventRegistrationForm
        v-if="editingReg === e.id && editing !== e.id"
        class="reg-edit"
        :initial="{ demandUntil: e.demandUntil, bookingFrom: e.bookingFrom, bookingUntil: e.bookingUntil, bookingCode: e.bookingCode, bookingUrl: e.bookingUrl,
                    remindDays: e.remindDays, bookingRemindDays: e.bookingRemindDays, offerHours: e.offerHours, waitlistAuto: e.waitlistAuto, maxParticipants: e.maxParticipants }"
        :busy="busy"
        @submit="b => saveReg(e.id, b)"
        @cancel="editingReg = null"
      />
      <EventForm
        v-if="editing === e.id"
        :initial="{ name: e.name, startsAt: e.startsAt, endsAt: e.endsAt, location: e.location, description: e.description }"
        :busy="busy"
        @submit="f => save(e.id, f)"
        @cancel="editing = null"
      />
    </section>

    <section class="card">
      <h2>Neues Event</h2>
      <p class="muted small">Personen und Kontaktpersonen bleiben. Wird das neue Event das aktuelle, stehen alle bekannten Personen darin als „offen“; Fristen und Buchung danach unter „Fristen &amp; Buchung“.</p>
      <EventForm :key="createKey" :copy-from="data ?? []" submit-label="Event anlegen" :busy="busy" @submit="create" />
    </section>
  </div>
</template>

<style scoped>
.head { justify-content: space-between; }
.head h2 { margin: 0; }
.card.current { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
.desc { white-space: pre-wrap; margin: 0 0 12px; font-size: 14px; }
.deadlines { margin: -4px 0 12px; color: var(--muted); }
.reg-edit { margin-top: 14px; }
</style>
