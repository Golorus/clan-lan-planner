<script setup lang="ts">
/** Kopf der Seiten zum Packen: welche Runde gilt, und ob noch Klicks auf das Netz warten */
const { data, queue, offline, error } = usePacken()
</script>

<template>
  <p v-if="error" class="notice err">{{ error }}</p>
  <div v-if="data" class="pack-round" :class="data.round">
    <b>{{ ROUND_TEXT[data.round] }}</b>
    <span v-if="queue.length" class="pending">{{ queue.length }} {{ queue.length === 1 ? 'Klick wartet' : 'Klicks warten' }} auf Netz</span>
    <span v-else-if="offline" class="pending">kein Netz, Stand evtl. alt</span>
    <span v-else class="muted small">gespeichert</span>
  </div>
</template>

<style scoped>
.pack-round { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; justify-content: space-between; padding: 10px 14px; border-radius: 10px; margin: 0 0 14px; background: color-mix(in srgb, var(--accent) 14%, var(--card)); border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border)); }
.pack-round.rueck { background: color-mix(in srgb, #e0a020 18%, var(--card)); border-color: color-mix(in srgb, #e0a020 50%, var(--border)); }
.pending { font-weight: 700; color: var(--err); font-size: 14px; }
</style>
