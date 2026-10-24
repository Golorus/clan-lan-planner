<script setup lang="ts">
/**
 * Eine Seite eines Moduls in einem Rahmen, z. B. eine eigene HTML-Anwendung, die sich nicht als Vue-Seite bauen lässt.
 * Kopfleiste und Orga-Reiter bleiben die des Planners. Die Seite muss in runtimeConfig.csp.frameSelf stehen
 * (shared/utils/moduleFrames.ts). Sie liegt auf derselben Seite, deshalb misst der Rahmen sie selbst und wächst mit.
 */
const props = withDefaults(defineProps<{ src: string, title: string, minHeight?: number }>(), { minHeight: 200 })

const frame = ref<HTMLIFrameElement>()
/** bis die Seite gemessen ist: so hoch wie das Fenster */
const height = ref<number | null>(null)
let observer: ResizeObserver | undefined

/** nach jedem Laden (auch vor dem Hydrieren schon geladen) die Höhe der Seite im Rahmen beobachten */
function watchFrame() {
  observer?.disconnect()
  const win = frame.value?.contentWindow as (Window & typeof globalThis) | null | undefined
  const doc = frame.value?.contentDocument
  if (!win || !doc?.body || doc.location.href === 'about:blank') return
  const measure = () => { height.value = Math.max(props.minHeight, Math.ceil(doc.documentElement.getBoundingClientRect().height)) }
  observer = new win.ResizeObserver(measure)
  observer.observe(doc.body)
}
onMounted(() => {
  if (frame.value?.contentDocument?.readyState === 'complete') watchFrame()
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <iframe ref="frame" class="module-frame" :src="src" :title="title" :style="height ? { height: `${height}px` } : undefined" @load="watchFrame" />
</template>

<style scoped>
.module-frame { display: block; width: 100%; height: 100vh; border: 0; }
</style>
