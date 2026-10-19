<script setup lang="ts">
/** Angaben eines Events; beim Anlegen zusätzlich Reihen übernehmen und „aktuell machen“ */
export interface EventFields { name: string, startsAt: string, endsAt: string, location: string, description: string }

const props = withDefaults(defineProps<{
  initial?: Partial<EventFields>
  /** Events, deren Reihen übernommen werden können (nur beim Anlegen) */
  copyFrom?: Array<{ id: number, name: string, rows: number }>
  submitLabel?: string
  busy?: boolean
}>(), { initial: () => ({}), copyFrom: undefined, submitLabel: 'Speichern', busy: false })

const emit = defineEmits<{ submit: [fields: EventFields & { copyRowsFrom?: number | null, makeCurrent?: boolean }], cancel: [] }>()

const form = reactive<EventFields>({ name: '', startsAt: '', endsAt: '', location: '', description: '', ...props.initial })
const copyRowsFrom = ref<number | null>(props.copyFrom?.[0]?.id ?? null)
const makeCurrent = ref(true)
const error = ref('')

// Ende vorschlagen: zwei Tage später, 14:00
watch(() => form.startsAt, (start) => {
  if (!start || form.endsAt) return
  const d = new Date(start.slice(0, 10) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + 2)
  form.endsAt = d.toISOString().slice(0, 10) + 'T14:00'
})

function submit() {
  error.value = form.endsAt <= form.startsAt ? 'Das Ende muss nach dem Beginn liegen.' : ''
  if (error.value) return
  emit('submit', { ...form, ...(props.copyFrom ? { copyRowsFrom: copyRowsFrom.value, makeCurrent: makeCurrent.value } : {}) })
}
</script>

<template>
  <form class="event-form" @submit.prevent="submit">
    <div class="form-grid">
      <label class="field"><span>Name</span><input v-model="form.name" required maxlength="100" placeholder="z. B. Sommer-LAN 2027"></label>
      <label class="field"><span>Beginn</span><input v-model="form.startsAt" type="datetime-local" required></label>
      <label class="field"><span>Ende</span><input v-model="form.endsAt" type="datetime-local" required></label>
      <label class="field"><span>Ort (für Discord-Event nötig)</span><input v-model="form.location" maxlength="100" placeholder="Halle, Straße, Ort"></label>
    </div>
    <label class="field"><span>Beschreibung (erscheint im Discord-Event)</span>
      <textarea v-model="form.description" maxlength="1000" placeholder="Anreise, Mitbringen, Ansprechpartner …" />
    </label>
    <div v-if="copyFrom?.length" class="form-grid">
      <label class="field"><span>Reihen übernehmen von</span>
        <select v-model="copyRowsFrom">
          <option :value="null">keine</option>
          <option v-for="e in copyFrom" :key="e.id" :value="e.id">{{ e.name }} ({{ e.rows }} Reihen)</option>
        </select>
      </label>
      <label class="check"><input v-model="makeCurrent" type="checkbox"> zum aktuellen Event machen</label>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <div class="row">
      <button class="btn primary" :disabled="busy">{{ submitLabel }}</button>
      <button v-if="!copyFrom" type="button" class="btn" @click="emit('cancel')">Abbrechen</button>
    </div>
  </form>
</template>

<style scoped>
.event-form { display: grid; gap: 12px; }
.event-form textarea { min-height: 80px; }
.check { display: flex; gap: 8px; align-items: center; font-size: 14px; }
</style>
