<script setup lang="ts">
/** Ankündigung in #organisation: Kanal wählen, Text anpassen, absenden (der Bot legt dazu den privaten Thread an) */
const props = defineProps<{ eventId: number }>()
const emit = defineEmits<{ done: [{ messageUrl: string, threadUrl: string }], cancel: [] }>()

const { data } = await useFetch('/api/orga/discord/kanaele', { key: 'orga-kanaele' })
const channelId = ref(data.value?.channelId ?? '')
const body = ref(data.value?.body ?? '')
watch(data, (d) => {
  if (d && !channelId.value) channelId.value = d.channelId ?? d.channels.find(c => c.name.includes('organisation'))?.id ?? ''
  if (d && !body.value) body.value = d.body
}, { immediate: true })

const busy = ref(false)
const error = ref('')
async function send() {
  const name = data.value?.channels.find(c => c.id === channelId.value)?.name ?? 'den Kanal'
  if (!confirm(`Jetzt in #${name} ankündigen${body.value.includes('@everyone') ? ' (mit @everyone)' : ''} und den privaten Thread anlegen?`)) return
  busy.value = true
  error.value = ''
  try {
    emit('done', await api(`/api/orga/events/${props.eventId}/ankuendigen`, { method: 'POST', body: { channelId: channelId.value, body: body.value } }))
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
  <div class="announce">
    <p v-if="!data?.botConfigured" class="notice err">Der Discord-Bot ist nicht eingerichtet.</p>
    <p v-else-if="data.error" class="notice err">{{ data.error }}</p>
    <template v-else>
      <label class="field">
        <span>Kanal</span>
        <select v-model="channelId">
          <option value="" disabled>wählen …</option>
          <option v-for="c in data.channels" :key="c.id" :value="c.id"># {{ c.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>Text</span>
        <textarea v-model="body" maxlength="1800" rows="5" />
      </label>
      <p class="muted small">
        Platzhalter: {event} {datum} {ort} {frist} {countdown} {link}. Mit „@everyone“ im Text pingt der Bot alle.
        Danach legt er einen privaten Thread an: Orga und Kontaktpersonen sind immer drin, wer im Planner zusagt, kommt automatisch dazu, wer absagt, fliegt raus.
        <a v-if="data.defaultBody !== body" href="#" @click.prevent="body = data.defaultBody">Standardtext</a>
      </p>
      <p v-if="error" class="err">{{ error }}</p>
      <div class="row">
        <button class="btn primary" :disabled="busy || !channelId || !body.trim()" @click="send">Ankündigen</button>
        <button class="btn" type="button" @click="emit('cancel')">Abbrechen</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.announce { display: grid; gap: 10px; margin-top: 14px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px; }
.announce p { margin: 0; }
textarea { min-height: 110px; }
</style>
