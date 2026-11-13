<script setup lang="ts">
/** Eine Kiste/Tasche (Ziel ihres QR-Codes): was hineingehört und was schon drin ist */
definePageMeta({ middleware: 'packen' })
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, load, start, box, inBox, progress } = usePacken()
await load()
onMounted(start)
const c = computed(() => box(id.value))
const list = computed(() => inBox(id.value))
const pg = computed(() => progress(list.value))
useHead({ title: () => (c.value?.name || 'Kiste') + ' · Packen' })
</script>

<template>
  <div class="wrap">
    <p class="small"><NuxtLink to="/packen">← alle Kisten</NuxtLink></p>
    <template v-if="c">
      <h1>{{ c.name || '(ohne Namen)' }} <span class="muted small">{{ c.kind }}</span></h1>
      <PackRound />
      <section class="card">
        <p class="sum" :class="{ done: pg.done }"><b>{{ pg.drin }}</b> von {{ pg.soll }} Teilen drin</p>
        <progress :value="pg.drin" :max="pg.soll || 1" />
        <ul class="list"><PackItem v-for="a in list" :key="a.id" :article="a" /></ul>
        <p v-if="!list.length" class="muted">In diese {{ c.kind }} gehört laut Inventar nichts.</p>
      </section>
    </template>
    <p v-else-if="data" class="notice err">Diese Kiste gibt es im Inventar nicht (mehr). Bitte der Orga Bescheid sagen.</p>
    <p v-else-if="!error" class="muted">Lädt …</p>
  </div>
</template>

<style scoped>
.sum { font-size: 18px; margin: 0 0 6px; }
.sum.done b { color: #2f8f4e; }
.sum.done::after { content: " ✓ vollständig"; color: #2f8f4e; font-weight: 700; }
progress { width: 100%; accent-color: var(--accent); }
.list { padding: 0; margin: 8px 0 0; }
</style>
