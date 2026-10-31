<script setup lang="ts">
import { orgaHeaders } from '#shared/utils/orgaContext'
import { formatEventRange } from '#shared/utils/eventTime'
import type { EventFields } from '../../components/EventForm.vue'

definePageMeta({ middleware: 'leader' })
useHead({ title: 'Orga' })
const { eventRoleName } = useBranding()

const { data: events, refresh: refreshEvents } = await useFetch('/api/orga/events', { key: 'orga-events' })
const { data: plan, refresh: refreshPlan } = await useFetch('/api/sitzplan', { key: 'orga-sitzplan', headers: orgaHeaders('/orga') })
const { data: msgs } = await useFetch('/api/orga/nachrichten', { key: 'orga-nachrichten' })
const { data: roles, refresh: refreshRoles } = await useFetch('/api/orga/discord/rollen', { key: 'orga-rollen' })
const { data: team } = await useFetch('/api/team/uebersicht', { key: 'orga-team-uebersicht', headers: orgaHeaders('/orga') })
const { data: setup } = await useFetch('/api/orga/einrichtung', { key: 'orga-einrichtung' })
const { data: approvals } = await useFetch('/api/orga/freigaben', { key: 'orga-freigaben-zahl' })
const openApprovals = computed(() => approvals.value?.requests.filter(r => r.approval === 'wartet').length ?? 0)
const setupErrors = computed(() => setup.value?.checks.filter(c => c.level === 'error').length ?? 0)

const current = computed(() => events.value?.find(e => e.isCurrent) ?? null)
const people = computed(() => plan.value?.people ?? [])
const failed = computed(() => (msgs.value?.batches ?? []).reduce((n, b) => n + b.counts.fehler, 0) + (msgs.value?.auto ?? []).filter(a => a.status === 'fehler').length)

const error = ref('')
async function toggleRegistration() {
  if (!current.value) return
  error.value = ''
  try {
    await api(`/api/orga/events/${current.value.id}`, { method: 'PATCH', body: { registrationOpen: !current.value.registrationOpen } })
    await Promise.all([refreshEvents(), refreshPlan()])
  }
  catch (e) {
    error.value = apiError(e)
  }
}

// ── Event-Rolle ──
const roleBusy = ref(false)
const roleChoice = ref<string>('')
watch(() => roles.value?.eventRoleId, v => (roleChoice.value = v ?? ''), { immediate: true })
const roleName = (id: string | null | undefined) => roles.value?.roles.find(r => r.id === id)?.name ?? id ?? '–'
type SyncPart = { added: string[], removed: string[], errors: { nick: string, error: string }[] }
const sync = ref<(SyncPart & { configured: boolean, thread: SyncPart & { configured: boolean, url: string | null } }) | null>(null)
async function saveRole() {
  roleBusy.value = true
  error.value = ''
  try {
    await api('/api/orga/discord/einstellungen', { method: 'PUT', body: { eventRoleId: roleChoice.value || null } })
    await refreshRoles()
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    roleBusy.value = false
  }
}
async function syncRole() {
  roleBusy.value = true
  error.value = ''
  sync.value = null
  try {
    sync.value = await api('/api/orga/discord/rolle-abgleichen', { method: 'POST' })
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    roleBusy.value = false
  }
}

async function createEvent(fields: EventFields) {
  error.value = ''
  try {
    await api('/api/orga/events', { method: 'POST', body: { ...fields, copyRowsFrom: null, makeCurrent: true } })
    await Promise.all([refreshEvents(), refreshPlan()])
  }
  catch (e) {
    error.value = apiError(e)
  }
}
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Übersicht" />

    <p v-if="error" class="notice err">{{ error }}</p>
    <p v-if="openApprovals" class="notice">
      {{ openApprovals === 1 ? 'Eine neue Person wartet' : `${openApprovals} neue Personen warten` }} auf Freigabe. <NuxtLink to="/orga/teilnehmer">Entscheiden</NuxtLink>
    </p>
    <p v-if="setupErrors" class="notice err">
      Die Einrichtung hat {{ setupErrors === 1 ? 'einen Fehler' : `${setupErrors} Fehler` }}. <NuxtLink to="/orga/discord">Ansehen</NuxtLink>
    </p>
    <section v-if="!current" class="card">
      <h2>Noch kein Event</h2>
      <p class="muted small">Leg zuerst ein Event an. Danach Reihen, Kontaktpersonen und Fristen – und die Bedarfsabfrage öffnen.</p>
      <EventForm :copy-from="[]" submit-label="Event anlegen" @submit="createEvent" />
    </section>

    <template v-else>
      <section class="card">
        <h2>{{ current.name }}</h2>
        <p class="muted">{{ formatEventRange(current.startsAt, current.endsAt) }}<template v-if="current.location"> · {{ current.location }}</template> · aktuelles Event</p>
        <div class="stats">
          <NuxtLink to="/orga/teilnehmer"><strong>{{ people.length }}</strong><span>zugesagt</span></NuxtLink>
          <NuxtLink to="/orga/teilnehmer?stand=nicht_zugesagt"><strong>{{ team?.total?.offen ?? 0 }}</strong><span>offen</span></NuxtLink>
          <NuxtLink to="/orga/teilnehmer?stand=nicht_gebucht"><strong>{{ team?.total?.nichtGebucht ?? 0 }}</strong><span>nicht gebucht</span></NuxtLink>
          <NuxtLink to="/orga/teilnehmer?stand=gebucht"><strong>{{ team?.total?.gebucht ?? 0 }}</strong><span>gebucht</span></NuxtLink>
          <NuxtLink to="/orga/teilnehmer?stand=abgesagt"><strong>{{ team?.total?.abgesagt ?? 0 }}</strong><span>abgesagt</span></NuxtLink>
          <NuxtLink to="/orga/warteliste"><strong>{{ team?.total?.warteliste ?? 0 }}</strong><span>Warteliste</span></NuxtLink>
          <NuxtLink to="/orga/sitzplan"><strong>{{ people.filter(p => p.seat).length }}</strong><span>mit Platz</span></NuxtLink>
          <NuxtLink to="/orga/sitzplan"><strong>{{ people.filter(p => !p.seat).length }}</strong><span>ohne Platz</span></NuxtLink>
          <NuxtLink to="/orga/sitzplan"><strong>{{ plan?.rows.length ?? 0 }}</strong><span>Reihen · {{ (plan?.rows.length ?? 0) * 40 }} Plätze</span></NuxtLink>
          <NuxtLink to="/orga/kontakte"><strong>{{ plan?.contacts.length ?? 0 }}</strong><span>Kontaktpersonen</span></NuxtLink>
          <NuxtLink to="/orga/nachrichten" :class="{ bad: failed }"><strong>{{ failed }}</strong><span>Nachrichten fehlgeschlagen</span></NuxtLink>
        </div>
        <div class="row">
          <span>Bedarfsabfrage <span class="badge" :class="plan?.event?.phase === 'abfrage' ? 'ok' : ''">{{ plan?.event?.phase === 'abfrage' ? 'läuft' : plan?.event?.phase === 'nachher' ? (current.registrationOpen ? 'Frist vorbei' : 'geschlossen') : 'noch nicht geöffnet' }}</span>
            <span v-if="current.demandUntil" class="muted small"> · bis {{ formatEventRange(current.demandUntil, '') }}</span></span>
          <button class="btn small" @click="toggleRegistration">{{ current.registrationOpen ? (plan?.event?.phase === 'abfrage' ? 'Vorzeitig schließen' : 'Schließen') : 'Öffnen' }}</button>
          <NuxtLink to="/orga/events" class="small">Fristen &amp; Buchung</NuxtLink>
        </div>
      </section>

      <section class="card">
        <h2>{{ eventRoleName }} und Thread in Discord</h2>
        <p class="muted small">
          Der Bot gibt diese Rolle allen Zugesagten des aktuellen Events und nimmt sie bei Absage wieder weg. Er fasst keine andere Rolle an.
          Sie darf weder die Orga-Rolle noch eine Rolle für Einladungen sein. Ist das Event angekündigt, hält der Bot auch den privaten Thread aktuell:
          Orga und Kontaktpersonen immer, dazu alle Zugesagten.
        </p>
        <p v-if="roles?.clash" class="notice err">
          Orga-Rolle und {{ eventRoleName }} haben dieselbe ID. Bis das in der .env korrigiert ist, gilt keine von beiden: nur der Projektleiter kommt in /orga, und der Bot fasst keine Rolle an.
        </p>
        <p v-else-if="!roles?.botConfigured" class="muted small">Der Discord-Bot ist nicht eingerichtet.</p>
        <template v-else>
          <p v-if="roles?.error" class="notice err">{{ roles.error }}</p>
          <div class="row">
            <label class="field role-pick">
              <span>{{ eventRoleName }} {{ roles?.source === 'env' ? '(aus der .env)' : roles?.source === 'orga' ? '(hier gesetzt)' : '' }}</span>
              <select v-model="roleChoice" :disabled="roleBusy">
                <option value="">– keine (aus der .env, falls gesetzt) –</option>
                <option v-for="r in roles?.roles" :key="r.id" :value="r.id" :disabled="r.id === roles?.orgaRoleId">{{ r.name }}{{ r.id === roles?.orgaRoleId ? ' (Orga-Rolle)' : '' }}</option>
              </select>
            </label>
            <button class="btn small" :disabled="roleBusy || roleChoice === (roles?.eventRoleId ?? '')" @click="saveRole">Speichern</button>
            <button class="btn small primary" :disabled="roleBusy" @click="syncRole">Rolle &amp; Thread abgleichen</button>
          </div>
          <p class="small">Aktuell: <strong>{{ roleName(roles?.eventRoleId) }}</strong></p>
          <div v-if="sync" class="notice">
            <p v-if="sync.configured"><strong>Rolle:</strong> {{ !sync.added.length && !sync.removed.length && !sync.errors.length ? 'passt schon' : '' }}
              <template v-if="sync.added.length">vergeben an {{ sync.added.join(', ') }}. </template>
              <template v-if="sync.removed.length">entfernt bei {{ sync.removed.join(', ') }}.</template></p>
            <p v-for="e in sync.errors" :key="'r' + e.nick" class="err">{{ e.nick }}: {{ e.error }}</p>
            <p v-if="sync.thread.configured"><strong>Thread:</strong> {{ !sync.thread.added.length && !sync.thread.removed.length && !sync.thread.errors.length ? 'passt schon' : '' }}
              <template v-if="sync.thread.added.length">hinzugefügt {{ sync.thread.added.join(', ') }}. </template>
              <template v-if="sync.thread.removed.length">entfernt {{ sync.thread.removed.join(', ') }}.</template>
              <a v-if="sync.thread.url" :href="sync.thread.url" target="_blank" rel="noopener">öffnen</a></p>
            <p v-else class="muted">Noch kein Thread: das aktuelle Event unter Events ankündigen.</p>
            <p v-for="e in sync.thread.errors" :key="'t' + e.nick" class="err">{{ e.nick }}: {{ e.error }}</p>
          </div>
        </template>
      </section>

      <section class="card">
        <h2>Checkliste</h2>
        <ul class="check">
          <li :class="{ done: (plan?.rows.length ?? 0) > 0 }"><NuxtLink to="/orga/sitzplan">Reihen anlegen</NuxtLink></li>
          <li :class="{ done: (plan?.contacts.length ?? 0) > 0 }"><NuxtLink to="/orga/kontakte">Kontaktpersonen ernennen</NuxtLink></li>
          <li :class="{ done: !!current.demandUntil }"><NuxtLink to="/orga/events">Frist der Bedarfsabfrage setzen</NuxtLink> und die Bedarfsabfrage öffnen</li>
          <li :class="{ done: people.length > 0 }"><NuxtLink to="/orga/teilnehmer">Gäste anlegen</NuxtLink> (bekannte Personen stehen automatisch als „offen“ drin)</li>
          <li :class="{ done: !!roles?.eventRoleId && !roles?.clash }">{{ eventRoleName }} einstellen (oben)</li>
          <li :class="{ done: !!current.discordEventUrl }"><NuxtLink to="/orga/events">Discord-Event erstellen</NuxtLink></li>
          <li><NuxtLink to="/orga/nachrichten">Automatische Nachrichten prüfen</NuxtLink> und <NuxtLink to="/orga/discord">Bot testen</NuxtLink></li>
          <li :class="{ done: !!plan?.area?.fixed }">
            Nach der Bedarfsabfrage: <NuxtLink to="/orga/buchung">Meldung an den Veranstalter</NuxtLink> schicken, den Bereich blocken lassen
            und ihn im <NuxtLink to="/orga/sitzplan">Sitzplan markieren und fixieren</NuxtLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 14px 0 18px; }
.stats a { display: grid; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; color: var(--text); text-decoration: none; }
.stats a:hover { border-color: var(--accent); }
.stats strong { font-size: 24px; }
.stats span { font-size: 13px; color: var(--muted); }
.stats .bad strong { color: var(--err); }
.check { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
.check li.done::marker { content: '✓  '; color: var(--accent); }
.role-pick { min-width: 260px; }
.notice p { margin: 0 0 4px; }
</style>
