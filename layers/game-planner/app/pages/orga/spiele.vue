<script setup lang="ts">
definePageMeta({ middleware: 'leader' })
useHead({ title: 'Spiele · Orga' })

const { data, refresh } = await useFetch('/api/orga/spiele', { key: 'orga-spiele' })
const channel = ref(data.value?.playChannelId ?? '')
watch(data, (d) => {
  if (d && !channel.value) channel.value = d.playChannelId ?? ''
})
const state = ref('')
async function saveChannel() {
  state.value = ''
  try {
    await api('/api/orga/spiele/kanal', { method: 'PUT', body: { channelId: channel.value || null } })
    state.value = 'Gespeichert.'
    await refresh()
  }
  catch (e) {
    state.value = apiError(e)
  }
}
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Spiele" />

    <section class="card">
      <h2>Spielkanal</h2>
      <p class="muted small">
        Mit <code>/spielen</code> macht jeder Zugesagte eine Runde auf (Spiel, Modus, Uhrzeit). Der Bot postet sie als Karte in diesen Kanal,
        erinnert die Spieler 15 Minuten vor dem Start und macht bei voller Runde die nächste auf. Ohne Kanal erscheint die Karte dort,
        wo der Befehl getippt wurde. Der Bot braucht im Kanal „Nachrichten senden“; die Befehle meldest du unter
        <NuxtLink to="/orga/discord">Discord</NuxtLink> an.
      </p>
      <p v-if="!data?.botConfigured" class="muted small">Der Discord-Bot ist nicht eingerichtet.</p>
      <p v-else-if="data.error" class="err small">{{ data.error }}</p>
      <div v-else class="row">
        <select v-model="channel" aria-label="Spielkanal">
          <option value="">kein Kanal</option>
          <option v-for="c in data.channels" :key="c.id" :value="c.id"># {{ c.name }}</option>
        </select>
        <button class="btn" @click="saveChannel">Speichern</button>
        <span class="muted small">{{ state }}</span>
      </div>
    </section>

    <section class="card">
      <h2>Spieleliste</h2>
      <p class="muted small">
        Neue Spiele und Modi legt jeder mit <code>/spielen … plätze:</code> an. Plätze ändern oder einen Modus entfernen: <code>/spiele ändern</code> (Orga).
        <template v-if="data?.lastEventName">„Letztes Mal“ = {{ data.lastEventName }}.</template>
      </p>
      <p v-if="!data?.games.length" class="muted small">Noch keine Spiele.</p>
      <table v-else class="games">
        <thead><tr><th>Spiel</th><th>Modi (Plätze)</th><th>diesmal</th><th>letztes Mal</th></tr></thead>
        <tbody>
          <tr v-for="g in data.games" :key="g.name">
            <td>{{ g.name }}</td>
            <td>{{ g.modes.map(m => `${m.name} ${m.max}${m.min ? ` (ab ${m.min})` : ''}`).join(' · ') }}</td>
            <td>{{ g.playedNow || '–' }}</td>
            <td>{{ g.playedLast || '–' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.games { width: 100%; border-collapse: collapse; font-size: 14px; }
.games th, .games td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
</style>
