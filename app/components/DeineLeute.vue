<script setup lang="ts">
import type { MapPerson } from './SeatMap.vue'

/** Für Kontaktpersonen: Stand ihrer Leute (offen, ohne Platz, nicht gebucht) und wer wo sitzt */
const props = defineProps<{
  team: { offen: number, ohnePlatz: number, nichtGebucht: number }
  people: MapPerson[]
  bookingReleased: boolean
}>()

const counts = computed(() => [
  { label: 'offen', n: props.team.offen },
  { label: 'ohne Platz', n: props.team.ohnePlatz },
  ...(props.bookingReleased ? [{ label: 'nicht gebucht', n: props.team.nichtGebucht }] : []),
])
</script>

<template>
  <section id="deine-leute" class="card leute">
    <h2>Deine Leute</h2>
    <p class="counts">
      <span v-for="c in counts" :key="c.label" class="badge" :class="c.n ? 'bad' : 'ok'">{{ c.n }} {{ c.label }}</span>
    </p>
    <ul v-if="people.length">
      <li v-for="p in people" :key="p.id">
        <span>{{ p.nick }}</span>
        <span :class="p.seat ? '' : 'muted'">{{ p.seat ?? 'ohne Platz' }}</span>
        <span v-if="bookingReleased" class="small" :class="p.booked ? 'ok-text' : 'muted'">{{ p.booked ? 'gebucht' : '' }}</span>
      </li>
    </ul>
    <p v-else class="muted small">Noch niemand zugesagt.</p>
    <p class="muted small">
      Du setzt deine Leute im Plan und tauschst sie untereinander.
      <NuxtLink to="/kontakt">Übersicht mit Offenen und Buchungen</NuxtLink>
    </p>
  </section>
</template>

<style scoped>
.leute h2 { margin-bottom: 8px; }
.counts { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; }
ul { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 2px; font-size: 14px; }
li { display: grid; grid-template-columns: 1fr auto 60px; gap: 8px; padding: 3px 0; border-bottom: 1px solid var(--border); }
li span:nth-child(2) { font-variant-numeric: tabular-nums; }
li span:last-child { text-align: right; }
p:last-child { margin: 0; }
</style>
