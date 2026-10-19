<script setup lang="ts">
/** „⋯“-Menü für Tabellenzeilen: seltene Aktionen, damit die Zeilen ruhig bleiben */
const root = ref<HTMLDetailsElement | null>(null)

function close() {
  if (root.value) root.value.open = false
}
function onDocClick(e: MouseEvent) {
  if (root.value?.open && !root.value.contains(e.target as Node)) close()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <details ref="root" class="row-menu">
    <summary class="btn small" aria-label="Weitere Aktionen" title="Weitere Aktionen">⋯</summary>
    <div class="items" @click="close">
      <slot />
    </div>
  </details>
</template>

<style scoped>
.row-menu { position: relative; display: inline-block; }
.row-menu summary { list-style: none; }
.row-menu summary::-webkit-details-marker { display: none; }
.items {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; min-width: 210px; padding: 4px;
  background: var(--card); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 6px 24px rgb(0 0 0 / .14);
  display: grid;
}
.items :deep(button), .items :deep(a) {
  display: block; width: 100%; text-align: left; padding: 7px 10px; border: 0; border-radius: 6px; background: none;
  font: inherit; font-size: 14px; color: var(--text); text-decoration: none; cursor: pointer;
}
.items :deep(button:hover), .items :deep(a:hover) { background: var(--bg); }
.items :deep(button:disabled) { opacity: .5; cursor: default; }
.items :deep(.danger) { color: var(--err); }
.items :deep(hr) { border: 0; border-top: 1px solid var(--border); margin: 4px 2px; }
</style>
