<script setup lang="ts">
import { ORGA_GROUPS, activeOrgaGroup } from '#shared/utils/orgaNav'

defineProps<{ title: string }>()

const route = useRoute()
const active = computed(() => activeOrgaGroup(route.path))
/** Seiten der Module: eigene Seiten vom Server, rechts in der Reiterleiste */
const moduleLinks = useModuleLinks().orga
</script>

<template>
  <nav class="orga-nav" aria-label="Orga">
    <NuxtLink v-for="g in ORGA_GROUPS" :key="g.label" :to="g.pages[0]?.to" :class="{ active: g === active }">{{ g.label }}</NuxtLink>
    <a v-for="(l, i) in moduleLinks" :key="l.to" :class="{ ext: i === 0 }" :href="l.to">{{ l.label }}</a>
  </nav>
  <nav v-if="active.pages.length > 1" class="orga-sub" :aria-label="active.label">
    <NuxtLink v-for="p in active.pages" :key="p.to" :to="p.to" exact-active-class="active">{{ p.label }}</NuxtLink>
  </nav>
  <h1>{{ title }}</h1>
</template>

<style scoped>
.orga-nav, .orga-sub {
  display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none;
}
.orga-nav::-webkit-scrollbar, .orga-sub::-webkit-scrollbar { display: none; }
.orga-nav { margin: -8px 0 0; border-bottom: 1px solid var(--border); }
.orga-nav a {
  padding: 10px 12px; font-size: 15px; color: var(--muted); text-decoration: none; white-space: nowrap;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.orga-nav a:hover { color: var(--text); }
.orga-nav a.active { color: var(--text); font-weight: 600; border-bottom-color: var(--accent); }
.orga-nav .ext { margin-left: auto; }
.orga-sub { margin: 8px 0 0; gap: 6px; }
.orga-sub a {
  padding: 4px 10px; font-size: 14px; color: var(--muted); text-decoration: none; white-space: nowrap;
  border-radius: 999px; border: 1px solid transparent;
}
.orga-sub a:hover { color: var(--text); }
.orga-sub a.active { color: var(--text); border-color: var(--border); background: var(--card); font-weight: 600; }
h1 { margin-top: 20px; }
</style>
