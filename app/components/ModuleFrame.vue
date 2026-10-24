<script setup lang="ts">
/**
 * Eine Seite eines Moduls in einem Rahmen, z. B. eine eigene HTML-Anwendung, die sich nicht als Vue-Seite bauen lässt.
 * Kopfleiste und Orga-Reiter bleiben die des Planners. Die Seite muss in runtimeConfig.csp.frameSelf stehen und
 * /module-frame.js einbinden, dann wächst der Rahmen mit ihrer Höhe (shared/utils/moduleFrames.ts).
 */
import type { ModuleFrameMessage } from '#shared/utils/moduleFrames'

const props = withDefaults(defineProps<{ src: string, title: string, minHeight?: number }>(), { minHeight: 200 })

const frame = ref<HTMLIFrameElement>()
/** bis die Seite ihre Höhe meldet: so hoch wie das Fenster */
const height = ref<number | null>(null)
function onMessage(e: MessageEvent<Partial<ModuleFrameMessage>>) {
  if (e.origin !== location.origin || e.source !== frame.value?.contentWindow) return
  if (typeof e.data?.moduleFrameHeight === 'number') height.value = Math.max(props.minHeight, e.data.moduleFrameHeight)
}
onMounted(() => addEventListener('message', onMessage))
onBeforeUnmount(() => removeEventListener('message', onMessage))
</script>

<template>
  <iframe ref="frame" class="module-frame" :src="src" :title="title" :style="height ? { height: `${height}px` } : undefined" />
</template>

<style scoped>
.module-frame { display: block; width: 100%; height: 100vh; border: 0; }
</style>
