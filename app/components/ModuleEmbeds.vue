<script setup lang="ts">
/**
 * Die Seiten, die Module in einen Bereich hängen (app.config.ts: moduleEmbeds.<bereich>), je als Karte mit Überschrift.
 * So zeigt eine Seite Inhalte anderer Module, ohne sie zu kennen.
 */
import { visibleEmbeds, type ModuleEmbed } from '#shared/utils/moduleFrames'

const props = defineProps<{ area: string }>()
const { moduleEmbeds } = useAppConfig() as { moduleEmbeds?: Record<string, ModuleEmbed[]> }
const embeds = computed(() => visibleEmbeds(moduleEmbeds?.[props.area], useRuntimeConfig().public as Record<string, unknown>))
</script>

<template>
  <section v-for="e in embeds" :key="e.src" class="card module-embed">
    <h2>{{ e.title }}</h2>
    <p v-if="e.hint" class="muted small">{{ e.hint }}</p>
    <ModuleFrame :src="e.src" :title="e.title" />
  </section>
</template>

<style scoped>
.module-embed :deep(.module-frame) { margin-top: 8px; }
</style>
