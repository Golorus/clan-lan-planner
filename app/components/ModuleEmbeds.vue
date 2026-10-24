<script setup lang="ts">
/**
 * Die Seiten, die Module in einen Bereich hängen (app.config.ts: moduleEmbeds.<bereich>), je zum Aufklappen.
 * Ein Rahmen lädt erst beim ersten Aufklappen. So zeigt eine Seite Inhalte anderer Module, ohne sie zu kennen.
 */
import { visibleEmbeds, type ModuleEmbed } from '#shared/utils/moduleFrames'

const props = defineProps<{ area: string }>()
const { moduleEmbeds } = useAppConfig() as { moduleEmbeds?: Record<string, ModuleEmbed[]> }
const embeds = computed(() => visibleEmbeds(moduleEmbeds?.[props.area], useRuntimeConfig().public as Record<string, unknown>))
const opened = ref(new Set<string>())
function toggle(e: Event, src: string) {
  if ((e.target as HTMLDetailsElement).open) opened.value = new Set([...opened.value, src])
}
</script>

<template>
  <details v-for="e in embeds" :key="e.src" class="card module-embed" @toggle="toggle($event, e.src)">
    <summary><h2>{{ e.title }}</h2></summary>
    <p v-if="e.hint" class="muted small">{{ e.hint }}</p>
    <ModuleFrame v-if="opened.has(e.src)" :src="e.src" :title="e.title" />
  </details>
</template>

<style scoped>
.module-embed > summary { cursor: pointer; list-style: revert; }
.module-embed > summary h2 { display: inline; margin: 0; }
.module-embed :deep(.module-frame) { margin-top: 8px; }
</style>
