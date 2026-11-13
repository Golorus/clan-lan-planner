<script setup lang="ts">
import type { PackData } from '../../../composables/usePacken'

/** Orga: was schon in den Kisten ist, was fehlt, Runde Hinweg/Rückweg umschalten, Etiketten */
definePageMeta({ middleware: 'leader' })
useHead({ title: 'Packstand · Inventar · Orga' })
const { data, error, load, start, counts, inBox, progress } = usePacken()
await load()
onMounted(start)

const groups = computed(() => [
  ...(data.value?.containers ?? []).map(c => ({ id: c.id, name: c.name || '(ohne Namen)', kind: c.kind, list: inBox(c.id) })),
  ...(inBox('').length ? [{ id: '', name: 'Ohne Kiste / Tasche', kind: '', list: inBox('') }] : []),
])
const total = computed(() => progress(data.value?.articles ?? []))
const missing = computed(() => (data.value?.articles ?? []).filter(a => (counts.value[a.id] ?? 0) < a.count).length)
const time = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''

const busy = ref(false)
async function setRound(round: 'hin' | 'rueck') {
  const text = round === 'hin' ? 'Hinweg' : 'Rückweg'
  if (!confirm(`${text} starten? Alle Zähler beginnen wieder bei null, für alle.`)) return
  busy.value = true
  try { data.value = await api<PackData>('/api/orga/inventar/runde', { method: 'POST', body: { round } }) }
  catch (e) { error.value = apiError(e) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Packstand" />
    <InventarNav />
    <PackRound />
    <section class="card">
      <p class="muted small">
        Teilnehmer packen auf <a href="/packen">/packen</a>: QR-Code an Kiste oder Teil scannen, +1 tippen.
        Die Seite aktualisiert sich alle paar Sekunden.
      </p>
      <div class="row">
        <button class="btn" :disabled="busy" @click="setRound('hin')">Hinweg starten</button>
        <button class="btn" :disabled="busy" @click="setRound('rueck')">Rückweg starten</button>
      </div>
      <p v-if="data" class="sum"><b>{{ total.drin }}</b> von {{ total.soll }} Teilen eingepackt · {{ missing }} Artikel unvollständig</p>
    </section>
    <section v-for="g in groups" :key="g.id" class="card">
      <h2>{{ g.name }} <span class="muted small">{{ g.kind }} · {{ progress(g.list).drin }} / {{ progress(g.list).soll }}</span></h2>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Artikel</th><th>Soll</th><th>Drin</th><th>Fehlt</th><th>Zuletzt</th></tr></thead>
          <tbody>
            <tr v-for="a in g.list" :key="a.id" :class="{ ok: (counts[a.id] ?? 0) >= a.count }">
              <td>{{ a.name }}</td>
              <td>{{ a.count }}</td>
              <td>{{ counts[a.id] ?? 0 }}</td>
              <td :class="{ err: (counts[a.id] ?? 0) < a.count }">{{ Math.max(0, a.count - (counts[a.id] ?? 0)) || '' }}<span v-if="(counts[a.id] ?? 0) > a.count" class="err">{{ (counts[a.id] ?? 0) - a.count }} zu viel</span></td>
              <td class="muted small">{{ data?.by[a.id] }} {{ time(data?.at[a.id]) }}</td>
            </tr>
            <tr v-if="!g.list.length"><td colspan="5" class="muted">Nichts zugeordnet.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.sum { margin: 6px 0 0; }
tr.ok td:nth-child(3) { color: #2f8f4e; font-weight: 700; }
.err { color: var(--err); font-weight: 700; }
</style>
