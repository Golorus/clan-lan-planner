<script setup lang="ts">
definePageMeta({ middleware: 'leader' })
useHead({ title: 'Protokoll · Orga' })

const { data, refresh } = await useFetch('/api/orga/protokoll', { key: 'orga-protokoll' })
const q = ref('')
const entries = computed(() => {
  const needle = q.value.trim().toLocaleLowerCase('de')
  const all = data.value ?? []
  if (!needle) return all
  return all.filter(e => [e.actorName, e.nick, e.action, e.fromSeat, e.toSeat, e.detail].some(v => v?.toLocaleLowerCase('de').includes(needle)))
})
const time = (d: string | Date) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' })
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Protokoll" />
    <section class="card">
      <div class="row head">
        <p class="muted small">Wer hat wann wen auf welchen Platz gesetzt – im aktuellen Event, neueste zuerst.</p>
        <span class="row">
          <input v-model="q" type="search" placeholder="Filtern (Name, Platz, Aktion …)">
          <button class="btn small" @click="refresh()">Aktualisieren</button>
        </span>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Zeit</th><th>Wer</th><th>Aktion</th><th>Wen</th><th>Platz</th><th>Details</th></tr></thead>
          <tbody>
            <tr v-for="e in entries" :key="e.id">
              <td class="nowrap muted">{{ time(e.at) }}</td>
              <td>{{ e.actorName }}</td>
              <td>{{ e.action }}</td>
              <td>{{ e.nick ?? '' }}</td>
              <td class="nowrap">
                <template v-if="e.fromSeat && e.toSeat">{{ e.fromSeat }} → {{ e.toSeat }}</template>
                <template v-else-if="e.toSeat">→ {{ e.toSeat }}</template>
                <template v-else-if="e.fromSeat">{{ e.fromSeat }} → frei</template>
              </td>
              <td class="muted">{{ e.detail ?? '' }}</td>
            </tr>
            <tr v-if="!entries.length"><td colspan="6" class="muted">Keine Einträge.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.head { justify-content: space-between; margin-bottom: 8px; }
.head p { margin: 0; }
.nowrap { white-space: nowrap; }
</style>
