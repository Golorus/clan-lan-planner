<script setup lang="ts">
/** /orga › Teilnehmer: offene Freigabe-Anfragen entscheiden, Ablehnungen zurücksetzen (server/utils/freigabe.ts) */
interface Request { personId: number, nick: string, discordName: string | null, contactNick: string | null, approval: 'wartet' | 'abgelehnt', requestedAt: string, decidedAt: string | null, decidedBy: string | null }
const { data, refresh } = await useFetch<{ requests: Request[] }>('/api/orga/freigaben', { key: 'orga-freigaben' })
const emit = defineEmits<{ changed: [] }>()

const waiting = computed(() => (data.value?.requests ?? []).filter(r => r.approval === 'wartet'))
const rejected = computed(() => (data.value?.requests ?? []).filter(r => r.approval === 'abgelehnt'))
const busy = ref(false)
const error = ref('')
const when = (d: string | null) => d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : ''

async function decide(r: Request, decision: 'frei' | 'abgelehnt' | 'zurück') {
  if (decision === 'abgelehnt' && !confirm(`${r.nick} ablehnen? Die Person kann dann nicht mitmachen.`)) return
  busy.value = true
  error.value = ''
  try {
    await api(`/api/orga/freigaben/${r.personId}`, { method: 'POST', body: { decision } })
    await refresh()
    emit('changed')
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="waiting.length || rejected.length" class="card">
    <h2>Freigaben<span v-if="waiting.length" class="muted"> · {{ waiting.length }} offen</span></h2>
    <p class="muted small">Neue Leute ohne Clan-Rolle fragen hier an. Ihre Kontaktperson kann per Discord-Knopf entscheiden, du hier.</p>
    <p v-if="error" class="notice err">{{ error }}</p>
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>Nick</th><th>Kontaktperson</th><th>Stand</th><th /></tr></thead>
        <tbody>
          <tr v-for="r in [...waiting, ...rejected]" :key="r.personId">
            <td>{{ r.nick }}<span v-if="r.discordName" class="sub">{{ r.discordName }}</span></td>
            <td>{{ r.contactNick ?? '–' }}</td>
            <td>
              <span class="badge" :class="{ bad: r.approval === 'abgelehnt' }">{{ r.approval === 'wartet' ? 'wartet' : 'abgelehnt' }}</span>
              <span class="sub">{{ r.approval === 'wartet' ? `seit ${when(r.requestedAt)}` : `${when(r.decidedAt)}${r.decidedBy ? ` von ${r.decidedBy}` : ''}` }}</span>
            </td>
            <td><div class="row acts">
              <template v-if="r.approval === 'wartet'">
                <button class="btn small primary" type="button" :disabled="busy" @click="decide(r, 'frei')">Freigeben</button>
                <button class="btn small danger" type="button" :disabled="busy" @click="decide(r, 'abgelehnt')">Ablehnen</button>
              </template>
              <template v-else>
                <button class="btn small" type="button" :disabled="busy" @click="decide(r, 'frei')">Doch freigeben</button>
                <button class="btn small" type="button" :disabled="busy" title="Die Person kann neu anfragen" @click="decide(r, 'zurück')">Zurücksetzen</button>
              </template>
            </div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.acts { gap: 6px; flex-wrap: nowrap; justify-content: flex-end; }
</style>
