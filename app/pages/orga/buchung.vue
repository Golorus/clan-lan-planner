<script setup lang="ts">
import { orgaHeaders } from '#shared/utils/orgaContext'

definePageMeta({ middleware: 'leader' })
useHead({ title: 'Buchung · Orga' })

const { data: events, refresh: refreshEvents } = await useFetch('/api/orga/events', { key: 'orga-events' })
const current = computed(() => events.value?.find(e => e.isCurrent) ?? null)
const { data: team, refresh: refreshTeam } = await useFetch('/api/team/uebersicht', { key: 'orga-team-uebersicht', headers: orgaHeaders('/orga') })

const busy = ref(false)
const error = ref('')
const info = ref('')
async function run(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  info.value = ''
  try {
    await fn()
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    busy.value = false
    await Promise.all([refreshEvents(), refreshTeam()])
  }
}

// ── Meldung an den Veranstalter ──
const report = ref<{ confirmed: number, seats: string[], withoutSeat: number, text: string } | null>(null)
const copied = ref(false)
async function loadReport() {
  await run(async () => (report.value = await api('/api/orga/meldung')))
}
async function copyReport() {
  if (!report.value) return
  try {
    await navigator.clipboard.writeText(report.value.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
  catch { /* Text ist markierbar */ }
}

function releaseBooking() {
  const ev = current.value
  if (!ev) return
  if (!ev.bookingCode) {
    error.value = 'Bitte zuerst unter Events › „Fristen & Buchung“ den Buchungscode eintragen.'
    return
  }
  if (!confirm(`Buchung freigeben? Alle Zugesagten, die noch nicht gebucht haben, bekommen per Discord den Buchungscode, den Link${ev.bookingUntil ? ', die Frist' : ''} und ihren geplanten Platz. Die Platzwahl endet damit sofort.`)) return
  run(async () => {
    const r = await api<{ queued: number }>('/api/orga/buchung/freigeben', { method: 'POST' })
    info.value = `Buchung freigegeben: ${r.queued} Nachrichten in der Warteschlange.`
  })
}
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Buchung" />
    <p v-if="error" class="notice err">{{ error }}</p>
    <p v-if="info" class="notice">{{ info }}</p>

    <section v-if="team?.total" class="card">
      <h2>Stand je Kontaktperson</h2>
      <p class="muted small">Wer genau wo steht und alle Aktionen je Person: <NuxtLink to="/orga/teilnehmer">Teilnehmer</NuxtLink>.</p>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Kontaktperson</th><th class="num">offen</th><th class="num">zugesagt</th><th class="num">ohne Platz</th><th class="num">gebucht</th><th class="num">abgesagt</th></tr></thead>
          <tbody>
            <tr v-for="c in team.perContact" :key="c.contactId ?? 'ohne'">
              <td><span class="swatch" :style="{ background: c.color }" />{{ c.nick }}</td>
              <td class="num">{{ c.counts.offen }}</td><td class="num">{{ c.counts.zugesagt }}</td><td class="num">{{ c.counts.ohnePlatz }}</td>
              <td class="num">{{ c.counts.gebucht }}/{{ c.counts.zugesagt }}</td><td class="num">{{ c.counts.abgesagt }}</td>
            </tr>
            <tr class="total">
              <td>Gesamt</td>
              <td class="num">{{ team.total.offen }}</td><td class="num">{{ team.total.zugesagt }}</td><td class="num">{{ team.total.ohnePlatz }}</td>
              <td class="num">{{ team.total.gebucht }}/{{ team.total.zugesagt }}</td><td class="num">{{ team.total.abgesagt }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="current" class="card">
      <h2>Meldung an den Veranstalter</h2>
      <p class="muted small">Zahl der Zusagen und belegte Platz-IDs, ohne Namen. Zum Weitergeben an den Veranstalter, der die Plätze für uns blockiert.</p>
      <div class="row">
        <button class="btn" :disabled="busy" @click="loadReport">{{ report ? 'Aktualisieren' : 'Zusammenfassung erstellen' }}</button>
        <a class="btn" href="/api/orga/meldung?format=csv" download>Als CSV</a>
      </div>
      <template v-if="report">
        <pre class="report">{{ report.text }}</pre>
        <button class="btn small" @click="copyReport">{{ copied ? 'Kopiert' : 'Text kopieren' }}</button>
      </template>
    </section>

    <section v-if="current" class="card">
      <h2>Buchung</h2>
      <p class="muted small">
        Code, Link und Frist stehen unter <NuxtLink to="/orga/events">Events › Fristen &amp; Buchung</NuxtLink>.
        Zum Buchungsstart gibt der Planner automatisch frei und die Platzwahl endet; „Buchung freigeben“ zieht das vor.
        Freigeben schickt allen Zugesagten ihre Nachricht („Buche bitte Platz A-81“) mit dem Knopf „Ich habe gebucht“; wer später nachrückt, bekommt sie automatisch.
      </p>
      <p>
        Code: <strong>{{ current.bookingCode ? 'eingetragen' : 'fehlt' }}</strong>
        · Buchungsstart: <strong>{{ current.bookingFrom ? current.bookingFrom.replace('T', ' ') : '–' }}</strong>
        · Buchen bis: <strong>{{ current.bookingUntil ? current.bookingUntil.replace('T', ' ') : '–' }}</strong>
        · <span :class="current.bookingReleasedAt ? 'ok-text' : 'muted'">{{ current.bookingReleasedAt ? 'freigegeben' : 'noch nicht freigegeben' }}</span>
      </p>
      <button class="btn primary" :disabled="busy" @click="releaseBooking">{{ current.bookingReleasedAt ? 'An Neue ohne Nachricht schicken' : 'Buchung freigeben' }}</button>
    </section>
  </div>
</template>

<style scoped>
.num { text-align: right; font-variant-numeric: tabular-nums; }
.total td { font-weight: 600; }
.report { white-space: pre-wrap; padding: 10px 12px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); font-size: 14px; user-select: all; }
</style>
