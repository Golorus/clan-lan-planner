<template>
  <footer class="foot">
    <NuxtLink to="/">Sitzplan</NuxtLink>
    <NuxtLink to="/lizenzen">Datenschutz &amp; Lizenzen</NuxtLink>
    <NuxtLink to="/impressum">Impressum</NuxtLink>
  </footer>
</template>

<style scoped>
.foot { display: flex; gap: 18px; justify-content: center; padding: 8px 16px 32px; font-size: 14px; }
.foot a { color: var(--muted); }
@media print { .foot { display: none; } }
</style>
