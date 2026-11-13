<script setup lang="ts">
/** Packen: alle Kisten mit Fortschritt und eine Suche „wo gehört das hin?“; für alle, die in den Planner dürfen */
definePageMeta({ middleware: 'packen' })
useHead({ title: 'Packen' })
const { data, error, load, start, inBox, progress } = usePacken()
await load()
onMounted(start)
const q = ref('')
const hits = computed(() => {
  const s = q.value.trim().toLowerCase()
  return s ? (data.value?.articles ?? []).filter(a => a.name.toLowerCase().includes(s)).slice(0, 20) : []
})
const loose = computed(() => inBox(''))
</script>

<template>
  <div class="wrap">
    <h1>Packen</h1>
    <PackRound />
    <p class="muted small">QR-Code an einer Kiste oder einem Teil mit der Handy-Kamera scannen, oder hier suchen. Jeder Klick auf +1 zählt ein Teil als eingepackt.</p>
    <section v-if="data" class="card">
      <label class="search">Wo gehört es hin?
        <input v-model="q" type="search" placeholder="z. B. Patchkabel" autocomplete="off">
      </label>
      <ul v-if="hits.length" class="list"><PackItem v-for="a in hits" :key="a.id" :article="a" show-box /></ul>
      <p v-else-if="q.trim()" class="muted">Nichts gefunden.</p>
    </section>
    <section v-if="data" class="card">
      <h2>Kisten &amp; Taschen</h2>
      <p v-if="!data.containers.length" class="muted">Die Orga hat noch keine Kisten angelegt.</p>
      <ul class="boxes">
        <li v-for="c in data.containers" :key="c.id">
          <NuxtLink :to="`/packen/k/${c.id}`" class="box" :class="{ done: progress(inBox(c.id)).done }">
            <span class="nm">{{ c.name || '(ohne Namen)' }} <span class="muted small">{{ c.kind }}</span></span>
            <span class="pg">{{ progress(inBox(c.id)).drin }} / {{ progress(inBox(c.id)).soll }}</span>
            <progress :value="progress(inBox(c.id)).drin" :max="progress(inBox(c.id)).soll || 1" />
          </NuxtLink>
        </li>
      </ul>
      <template v-if="loose.length">
        <h3>Ohne Kiste / Tasche</h3>
        <ul class="list"><PackItem v-for="a in loose" :key="a.id" :article="a" /></ul>
      </template>
    </section>
    <p v-else-if="!error" class="muted">Lädt …</p>
  </div>
</template>

<style scoped>
.search { display: flex; flex-direction: column; gap: 6px; font-weight: 600; }
.search input { font-size: 17px; padding: 10px 12px; }
.list { padding: 0; margin: 8px 0 0; }
.boxes { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.box { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; color: var(--text); text-decoration: none; }
.box progress { grid-column: 1 / -1; width: 100%; accent-color: var(--accent); }
.box.done { border-color: #2f8f4e; }
.box.done .pg::after { content: " ✓"; color: #2f8f4e; }
.nm { font-weight: 600; }
</style>
