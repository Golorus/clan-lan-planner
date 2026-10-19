<script setup lang="ts">
/**
 * Startseite für alle, die noch nicht in den Planner dürfen: Freigabe anfragen (Nick + Kontaktperson),
 * warten, abgelehnt. Die Kontaktperson entscheidet per Discord-Knopf, sonst die Orga (server/utils/freigabe.ts).
 */
const props = defineProps<{ code: 'approval_needed' | 'approval_pending' | 'approval_rejected' }>()
const emit = defineEmits<{ changed: [] }>()

interface State { access: string, nick: string | null, contactId: number | null, contacts: { id: number, nick: string }[] }
const { data, refresh } = await useFetch<State>('/api/freigabe', { key: 'freigabe' })

const nick = ref(data.value?.nick ?? '')
const contactId = ref<number | null>(data.value?.contactId ?? null)
const editing = ref(false)
const busy = ref(false)
const error = ref('')
const notified = ref<boolean | null>(null)

async function submit() {
  if (!contactId.value) {
    error.value = 'Bitte eine Kontaktperson auswählen.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const r = await api<{ notified: boolean }>('/api/freigabe', { method: 'POST', body: { nick: nick.value, contactId: contactId.value } })
    notified.value = r.notified
    editing.value = false
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
const contactNick = computed(() => data.value?.contacts.find(c => c.id === data.value?.contactId)?.nick ?? 'deine Kontaktperson')
const showForm = computed(() => props.code === 'approval_needed' || editing.value)
</script>

<template>
  <section class="card gate">
    <template v-if="code === 'approval_rejected'">
      <h1>Nicht freigegeben</h1>
      <p>Deine Anfrage wurde nicht freigegeben. Wenn du glaubst, dass das ein Irrtum ist, sprich bitte jemanden aus der Orga an.</p>
    </template>
    <template v-else-if="!showForm">
      <h1>Wartet auf Freigabe</h1>
      <p>Danke, {{ data?.nick }}! {{ contactNick }} bekommt eine Nachricht auf Discord und gibt dich frei. Danach geht es hier weiter.</p>
      <p v-if="notified === false" class="muted small">Die Nachricht an {{ contactNick }} ist nicht angekommen; die Orga sieht deine Anfrage trotzdem im Planner.</p>
      <div class="row">
        <button class="btn" type="button" @click="refresh().then(() => emit('changed'))">Neu laden</button>
        <button class="btn" type="button" @click="editing = true">Angaben ändern</button>
      </div>
    </template>
    <form v-else class="form" @submit.prevent="submit">
      <h1>Freigabe anfragen</h1>
      <p>Der Planner ist nur für Leute, die wir kennen. Sag uns, wer du bist und wer dich kennt: Deine Kontaktperson bekommt eine Nachricht und gibt dich frei.</p>
      <label class="field"><span>Nickname</span><input v-model="nick" required minlength="2" maxlength="32" autocomplete="nickname"></label>
      <label class="field"><span>Kontaktperson (kennt dich)</span>
        <select v-model.number="contactId" required>
          <option :value="null" disabled>Bitte wählen</option>
          <option v-for="c in data?.contacts ?? []" :key="c.id" :value="c.id">{{ c.nick }}</option>
        </select>
      </label>
      <p v-if="error" class="notice err">{{ error }}</p>
      <div class="row">
        <button class="btn primary" type="submit" :disabled="busy">Freigabe anfragen</button>
        <button v-if="editing" class="btn" type="button" @click="editing = false">Abbrechen</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.gate { max-width: 640px; margin: 24px auto; }
.gate h1 { margin: 0 0 10px; font-size: 22px; }
.form { display: grid; gap: 12px; }
.form p { margin: 0; }
</style>
