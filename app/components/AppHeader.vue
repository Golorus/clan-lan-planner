<script setup lang="ts">
/** Kopfleiste auf allen Seiten: Name der App (zum Sitzplan), angemeldet als …, Links der Module, Orga, Abmelden */
const { loggedIn, user } = useUserSession()
const { appName } = useBranding()
const demo = !!useRuntimeConfig().public.demo
const route = useRoute()
const links = useModuleLinks().header
const inOrga = computed(() => route.path.startsWith('/orga'))
const loginUrl = computed(() => `/auth/discord?redirect=${encodeURIComponent(route.fullPath)}`)
</script>

<template>
  <header class="appbar">
    <div class="appbar-inner">
      <NuxtLink to="/" class="brand">{{ appName }}<span v-if="demo" class="qa" title="Testumgebung mit ausgedachten Daten">QA</span></NuxtLink>
      <nav class="row">
        <template v-if="loggedIn && user">
          <span class="who muted small">{{ user.displayName || user.username }}</span>
          <a v-for="l in links" :key="l.to" class="btn small" :href="l.to" :title="l.title">{{ l.label }}</a>
          <a v-if="user.isLeader && !inOrga" class="btn small" href="/orga">Orga</a>
          <a class="btn small" href="/auth/logout">Abmelden</a>
        </template>
        <a v-else class="btn small discord" :href="loginUrl">Mit Discord anmelden</a>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.appbar { background: var(--card); border-bottom: 1px solid var(--border); }
.appbar-inner { max-width: 1440px; margin: 0 auto; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.brand { font-weight: 700; font-size: 18px; color: var(--text); text-decoration: none; white-space: nowrap; }
.appbar nav { gap: 8px; flex-wrap: nowrap; }
.qa { margin-left: 8px; padding: 1px 7px; border-radius: 6px; font-size: 12px; vertical-align: 2px; background: #e1bc29; color: #1d231c; }
@media (max-width: 560px) { .who { display: none; } }
/* Handy: die Knöpfe unter den Namen, statt seitlich überzustehen */
@media (max-width: 440px) { .appbar-inner { flex-wrap: wrap; row-gap: 8px; } }
@media print { .appbar { display: none; } }
</style>
