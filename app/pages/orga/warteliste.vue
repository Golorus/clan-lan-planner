<script setup lang="ts">
definePageMeta({ middleware: 'leader' })
useHead({ title: 'Warteliste · Orga' })

const { data, refresh } = await useFetch('/api/orga/warteliste', { key: 'orga-warteliste' })
const { data: events, refresh: refreshEvents } = await useFetch('/api/orga/events', { key: 'orga-events' })
const current = computed(() => events.value?.find(e => e.isCurrent) ?? null)

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
    await Promise.all([refresh(), refreshEvents()])
  }
}

const act = (id: number, action: 'nachruecken' | 'entfernen' | 'anbieten', ok: string) =>
  run(() => api(`/api/orga/warteliste/${id}`, { method: 'POST', body: { action } }), ok)

function promote(id: number, nick: string) {
  if (confirm(`${nick} direkt nachrücken lassen? ${nick} ist dann zugesagt (mit dem angebotenen Platz, falls es einen gibt) und darf einmal einen freien Platz wählen.`)) act(id, 'nachruecken', `${nick} ist nachgerückt.`)
}
function remove(id: number, nick: string) {
  if (confirm(`${nick} von der Warteliste nehmen? Ein offenes Angebot geht an den Nächsten.`)) act(id, 'entfernen', `${nick} ist nicht mehr auf der Warteliste.`)
}

function moveUp(index: number, delta: -1 | 1) {
  const ids = (data.value?.list ?? []).map(e => e.id)
  const j = index + delta
  if (j < 0 || j >= ids.length) return
  ;[ids[index], ids[j]] = [ids[j]!, ids[index]!]
  run(() => api('/api/orga/warteliste/reihenfolge', { method: 'POST', body: { ids } }))
}

function toggleAuto() {
  if (!current.value) return
  run(() => api(`/api/orga/events/${current.value!.id}`, { method: 'PATCH', body: { waitlistAuto: !current.value!.waitlistAuto } }))
}

const fmt = (d: string | Date | null) => d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : ''
const OFFER: Record<string, string> = { offen: 'offen', angenommen: 'angenommen', abgelehnt: 'abgelehnt', abgelaufen: 'abgelaufen', 'zurückgezogen': 'zurückgezogen' }
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Warteliste" />
    <p v-if="error" class="notice err">{{ error }}</p>
    <p v-if="info" class="notice">{{ info }}</p>

    <section v-if="data?.event" class="card">
      <div class="row head">
        <p class="muted small">
          <template v-if="data.active">Die Warteliste ist aktiv (Bedarfsabfrage vorbei oder alle Plätze vergeben).</template>
          <template v-else>Die Warteliste wird erst aktiv, wenn die Bedarfsabfrage vorbei ist oder alle Plätze vergeben sind.</template>
          Angebote gelten {{ data.offerHours }} Stunden.
        </p>
        <label class="small"><input type="checkbox" :checked="data.auto" :disabled="busy" @change="toggleAuto"> Frei gewordene Plätze automatisch anbieten</label>
      </div>

      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>#</th><th>Nick</th><th>Kontaktperson</th><th>Seit</th><th>Angebot</th><th /></tr></thead>
          <tbody>
            <tr v-for="(e, i) in data.list" :key="e.id">
              <td>{{ e.position }}</td>
              <td>{{ e.nick }}<span v-if="e.status === 'abgesagt'" class="sub">hatte abgesagt</span></td>
              <td>{{ e.contactNick ?? '–' }}</td>
              <td class="small">{{ fmt(e.waitlistAt) }}</td>
              <td class="small">
                <template v-if="e.offer">{{ e.offer.seat ?? 'ohne festen Platz' }} · bis {{ fmt(e.offer.expiresAt) }}</template>
                <span v-else class="muted">–</span>
              </td>
              <td class="actions">
                <button class="btn small" :disabled="busy || i === 0" aria-label="nach oben" @click="moveUp(i, -1)">↑</button>
                <button class="btn small" :disabled="busy || i === data.list.length - 1" aria-label="nach unten" @click="moveUp(i, 1)">↓</button>
                <button v-if="!e.offer" class="btn small" :disabled="busy" @click="act(e.id, 'anbieten', `Angebot an ${e.nick} verschickt.`)">Angebot schicken</button>
                <button class="btn small primary" :disabled="busy" @click="promote(e.id, e.nick)">Nachrücken</button>
                <button class="btn small danger" :disabled="busy" @click="remove(e.id, e.nick)">Entfernen</button>
              </td>
            </tr>
            <tr v-if="!data.list.length"><td colspan="6" class="muted">Niemand auf der Warteliste.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <p v-else class="muted">Es gibt noch kein aktuelles Event.</p>

    <section v-if="data?.offers.length" class="card">
      <h2>Angebote</h2>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Nick</th><th>Platz</th><th>Angeboten</th><th>Frist</th><th>Stand</th></tr></thead>
          <tbody>
            <tr v-for="o in data.offers" :key="o.id">
              <td>{{ o.nick }}</td><td>{{ o.seat ?? '–' }}</td><td class="small">{{ fmt(o.createdAt) }}</td><td class="small">{{ fmt(o.expiresAt) }}</td>
              <td :class="{ 'ok-text': o.status === 'angenommen' }">{{ OFFER[o.status] }}<span v-if="o.answeredAt" class="sub">{{ fmt(o.answeredAt) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.head { justify-content: space-between; align-items: flex-start; }
.head p { margin: 0; max-width: 60ch; }
.actions { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
</style>
