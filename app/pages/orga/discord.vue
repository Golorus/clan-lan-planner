<script setup lang="ts">
definePageMeta({ middleware: 'leader' })
useHead({ title: 'Discord · Orga' })

const { data: setup } = await useFetch('/api/orga/einrichtung', { key: 'orga-einrichtung' })
const ICON = { ok: '✓', warn: '!', error: '✗' } as const

const testState = ref('')
const busy = ref(false)

/** Profilbilder aller bekannten Personen neu von Discord holen (über die Mitgliederliste des Servers) */
const avatarState = ref('')
async function loadAvatars() {
  busy.value = true
  avatarState.value = 'Hole Avatare …'
  try {
    const r = await api<{ updated: number, unchanged: number, without: number, notMember: number, failed: number }>('/api/orga/avatare', { method: 'POST' })
    avatarState.value = `${r.updated} neu geladen, ${r.unchanged} unverändert, ${r.without} ohne Bild`
      + (r.notMember ? `, ${r.notMember} nicht auf dem Server` : '') + (r.failed ? `, ${r.failed} fehlgeschlagen` : '') + '.'
  }
  catch (e) {
    avatarState.value = apiError(e)
  }
  finally {
    busy.value = false
  }
}

async function testBot() {
  busy.value = true
  testState.value = 'Sende …'
  try {
    const r = await api<{ buttons: boolean }>('/api/orga/discord-test', { method: 'POST' })
    testState.value = r.buttons ? 'Gesendet – schau in deine Discord-Direktnachrichten und drück die Knöpfe.' : 'Gesendet – ohne Knöpfe (Public Key fehlt).'
  }
  catch (e) {
    testState.value = apiError(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Discord" />

    <section class="card">
      <h2>Einrichtung</h2>
      <p class="muted small">Aus der .env und den Einstellungen in /orga, ohne Discord zu fragen. Geheime Werte stehen hier nie.</p>
      <ul class="checks">
        <li v-for="c in setup?.checks ?? []" :key="c.key" :class="c.level">
          <span class="icon" aria-hidden="true">{{ ICON[c.level] }}</span> {{ c.text }}
        </li>
      </ul>
    </section>

    <section class="card">
      <h2>Bot testen</h2>
      <p class="muted small">
        Schickt dir selbst eine Direktnachricht über den Bot, mit zwei Test-Knöpfen; eingetragen wird dabei nichts.
        Reagieren die Knöpfe nicht („… reagiert nicht“), fehlt im Discord Developer Portal unter
        <em>General Information › Interactions Endpoint URL</em> die Adresse <code>…/api/discord/interactions</code>.
      </p>
      <div class="row">
        <button class="btn" :disabled="busy" @click="testBot">Test-Nachricht senden</button>
        <span class="muted small">{{ testState }}</span>
      </div>
    </section>

    <section class="card">
      <h2>Avatare</h2>
      <p class="muted small">Holt die Profilbilder aller bekannten Personen neu von Discord (Sitzplan und Listen zeigen sie).</p>
      <div class="row">
        <button class="btn" :disabled="busy" @click="loadAvatars">Avatare von Discord holen</button>
        <span class="muted small">{{ avatarState }}</span>
      </div>
    </section>

    <p class="muted small">
      Die Event-Rolle und den Thread stellst du in der <NuxtLink to="/orga">Übersicht</NuxtLink> ein, die automatischen Nachrichten unter
      <NuxtLink to="/orga/nachrichten">Nachrichten</NuxtLink>.
    </p>
  </div>
</template>

<style scoped>
.checks { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; font-size: 14px; }
.checks .icon { display: inline-block; width: 1.2em; font-weight: 700; text-align: center; }
.checks .ok .icon { color: var(--accent); }
.checks .warn .icon { color: var(--muted); }
.checks .error { color: var(--err); }
</style>
