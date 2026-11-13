<script setup lang="ts">
import type { PackArticle } from '../composables/usePacken'

/** ein Artikel beim Packen: Soll, schon drin, −1 / +1; showBox zeigt, in welche Kiste er gehört */
const props = defineProps<{ article: PackArticle, showBox?: boolean }>()
const { counts, count, box, data } = usePacken()
const drin = computed(() => counts.value[props.article.id] ?? 0)
const state = computed(() => drin.value === props.article.count ? 'done' : drin.value > props.article.count ? 'over' : '')
const target = computed(() => box(props.article.container))
/** erst zählen lassen, wenn die Seite im Browser läuft: ein Klick davor ginge verloren */
const live = ref(false)
onMounted(() => { live.value = true })
</script>

<template>
  <li class="pack-item" :class="state">
    <div class="what">
      <NuxtLink :to="`/packen/a/${article.id}`" class="name">{{ article.name }}</NuxtLink>
      <span v-if="article.note" class="muted small">{{ article.note }}</span>
      <span v-if="showBox" class="small">→ <NuxtLink v-if="target" :to="`/packen/k/${target.id}`">{{ target.name }}</NuxtLink><i v-else>noch keiner Kiste zugeordnet</i></span>
      <span v-if="data?.by[article.id]" class="muted small">zuletzt {{ data.by[article.id] }}</span>
    </div>
    <div class="count" :aria-label="`${drin} von ${article.count}`"><b>{{ drin }}</b> / {{ article.count }}</div>
    <div class="btns">
      <button class="btn" :disabled="!live || drin === 0" :aria-label="`${article.name}: eins weniger`" @click="count(article.id, -1)">−</button>
      <button class="btn primary" :disabled="!live" :aria-label="`${article.name}: eins eingepackt`" @click="count(article.id, 1)">+1</button>
    </div>
  </li>
</template>

<style scoped>
.pack-item { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); list-style: none; }
.what { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.name { font-weight: 600; color: var(--text); text-decoration: none; }
.count { font-size: 18px; white-space: nowrap; }
.btns { display: flex; gap: 6px; }
.btns .btn { min-width: 48px; min-height: 44px; font-size: 18px; }
.done .count b { color: #2f8f4e; }
.done .count b::after { content: " ✓"; }
.over .count b { color: var(--err); }
</style>
