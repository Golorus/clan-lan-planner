<script setup lang="ts">
/** Unterseiten des Inventars in /orga */
const pages = [
  { to: '/orga/inventar', label: 'Artikel & Kisten' },
  { to: '/orga/inventar/packen', label: 'Packstand' },
  { to: '/orga/inventar/etiketten', label: 'QR-Etiketten' },
  { to: '/orga/inventar/packliste', label: 'Packliste (Papier)' },
]
</script>

<template>
  <nav class="inv-nav no-print" aria-label="Inventar">
    <NuxtLink v-for="p in pages" :key="p.to" :to="p.to" exact-active-class="active">{{ p.label }}</NuxtLink>
  </nav>
</template>

<style scoped>
.inv-nav { display: flex; flex-wrap: wrap; gap: 4px 6px; margin: 0 0 14px; }
.inv-nav a { padding: 6px 12px; border: 1px solid var(--border); border-radius: 999px; color: var(--text); text-decoration: none; font-size: 14px; }
.inv-nav a.active { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
</style>
