<script setup lang="ts">
/** Ein Artikel (Ziel seines QR-Codes): in welche Kiste er gehört, und gleich zählen */
definePageMeta({ middleware: 'packen' })
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, load, start, box, article } = usePacken()
await load()
onMounted(start)
const a = computed(() => article(id.value))
const target = computed(() => a.value ? box(a.value.container) : null)
useHead({ title: () => (a.value?.name || 'Artikel') + ' · Packen' })
</script>

<template>
  <div class="wrap">
    <p class="small"><NuxtLink to="/packen">← alle Kisten</NuxtLink></p>
    <template v-if="a">
      <PackRound />
      <section class="card target">
        <span class="muted">{{ a.name }} gehört in</span>
        <NuxtLink v-if="target" :to="`/packen/k/${target.id}`" class="where">{{ target.name || '(ohne Namen)' }}</NuxtLink>
        <span v-else class="where none">keine feste Kiste, bitte die Orga fragen</span>
        <span v-if="target" class="muted small">{{ target.kind }}</span>
      </section>
      <section class="card">
        <ul class="list"><PackItem :article="a" /></ul>
      </section>
    </template>
    <p v-else-if="data" class="notice err">Diesen Artikel gibt es im Inventar nicht (mehr). Bitte der Orga Bescheid sagen.</p>
    <p v-else-if="!error" class="muted">Lädt …</p>
  </div>
</template>

<style scoped>
.target { display: flex; flex-direction: column; gap: 4px; text-align: center; }
.where { font-size: 30px; font-weight: 800; color: var(--accent); text-decoration: none; }
.where.none { font-size: 18px; color: var(--err); }
.list { padding: 0; margin: 0; }
</style>
