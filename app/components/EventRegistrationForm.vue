<script setup lang="ts">
/** Fristen, Erinnerungen, Buchung und Warteliste eines Events (Ortszeit Europe/Berlin wie bei Beginn und Ende) */
export interface RegistrationSettings {
  demandUntil: string, bookingFrom: string, bookingUntil: string
  bookingCode: string, bookingUrl: string
  remindDays: number[], bookingRemindDays: number[]
  offerHours: number, waitlistAuto: boolean, maxParticipants: number | null
}

const props = defineProps<{ initial: RegistrationSettings, busy?: boolean }>()
const emit = defineEmits<{ submit: [Record<string, unknown>], cancel: [] }>()

const f = reactive({
  ...props.initial,
  remindDays: props.initial.remindDays.join(', '),
  bookingRemindDays: props.initial.bookingRemindDays.join(', '),
  maxParticipants: props.initial.maxParticipants ?? ('' as number | ''),
})
const showCode = ref(false)
const error = ref('')

function submit() {
  error.value = ''
  if (f.bookingFrom && f.demandUntil && f.bookingFrom <= f.demandUntil) {
    error.value = 'Der Buchungsstart muss nach dem Ende der Bedarfsabfrage liegen (dazwischen ist die Platzwahl).'
    return
  }
  if (f.bookingFrom && f.bookingUntil && f.bookingUntil <= f.bookingFrom) {
    error.value = '„Buchen bis“ muss nach dem Buchungsstart liegen.'
    return
  }
  emit('submit', {
    demandUntil: f.demandUntil, bookingFrom: f.bookingFrom, bookingUntil: f.bookingUntil,
    bookingCode: f.bookingCode, bookingUrl: f.bookingUrl.trim(),
    remindDays: f.remindDays, bookingRemindDays: f.bookingRemindDays,
    offerHours: Number(f.offerHours) || 48, waitlistAuto: f.waitlistAuto,
    maxParticipants: f.maxParticipants === '' ? null : Number(f.maxParticipants),
  })
}
</script>

<template>
  <form class="reg-form" @submit.prevent="submit">
    <fieldset>
      <legend>Bedarfsabfrage</legend>
      <div class="form-grid">
        <label class="field">
          <span>Bedarfsabfrage bis</span>
          <input v-model="f.demandUntil" type="datetime-local">
        </label>
        <label class="field">
          <span>Erinnern, Tage vor Ende</span>
          <input v-model="f.remindDays" placeholder="14, 7, 2">
        </label>
        <label class="field">
          <span>Höchstens Zusagen (optional)</span>
          <input v-model="f.maxParticipants" type="number" min="1" placeholder="ohne Grenze">
        </label>
      </div>
      <p class="muted small">Erinnert werden Offene (an die Frist) und Zugesagte ohne Platz (an den Buchungsstart). Nach der Frist: keine neuen Zusagen, nur Warteliste. Plätze wählen geht weiter bis zum Buchungsstart.</p>
    </fieldset>

    <fieldset>
      <legend>Warteliste</legend>
      <div class="form-grid">
        <label class="field">
          <span>Angebot gilt (Stunden)</span>
          <input v-model="f.offerHours" type="number" min="1" max="336">
        </label>
        <label class="check-field"><input v-model="f.waitlistAuto" type="checkbox"> Frei gewordene Plätze automatisch anbieten</label>
      </div>
    </fieldset>

    <fieldset>
      <legend>Buchung beim Veranstalter</legend>
      <div class="form-grid">
        <label class="field">
          <span>Buchungscode (geheim)</span>
          <span class="row code-row">
            <input v-model="f.bookingCode" :type="showCode ? 'text' : 'password'" autocomplete="off" maxlength="100">
            <button type="button" class="btn small" @click="showCode = !showCode">{{ showCode ? 'Verbergen' : 'Zeigen' }}</button>
          </span>
        </label>
        <label class="field">
          <span>Link zum Buchungstool</span>
          <input v-model="f.bookingUrl" type="url" placeholder="https://…">
        </label>
        <label class="field">
          <span>Buchungsstart (Ende der Platzwahl)</span>
          <input v-model="f.bookingFrom" type="datetime-local" :min="f.demandUntil || undefined">
        </label>
        <label class="field">
          <span>Buchen bis</span>
          <input v-model="f.bookingUntil" type="datetime-local">
        </label>
        <label class="field">
          <span>Erinnern, Tage vor „Buchen bis“</span>
          <input v-model="f.bookingRemindDays" placeholder="7, 2">
        </label>
      </div>
      <p class="muted small">Zum Buchungsstart verschickt der Bot automatisch Code, Link und Platz; dafür müssen Code und Link eingetragen sein. Ab dann setzt sich niemand mehr selbst um.</p>
      <p class="muted small">Der Code erscheint nur angemeldeten Zugesagten in ihrer eigenen Ansicht und in ihrer Discord-Nachricht – nie im Sitzplan, Protokoll oder Export.</p>
    </fieldset>

    <p v-if="error" class="err">{{ error }}</p>
    <div class="row">
      <button class="btn primary" :disabled="busy">Speichern</button>
      <button type="button" class="btn" @click="emit('cancel')">Abbrechen</button>
    </div>
  </form>
</template>

<style scoped>
.reg-form { display: grid; gap: 12px; }
fieldset { border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px 4px; margin: 0; }
legend { font-weight: 600; padding: 0 6px; }
.check-field { display: flex; gap: 8px; align-items: center; align-self: end; padding-bottom: 8px; }
.code-row { flex-wrap: nowrap; }
.code-row input { flex: 1; min-width: 0; }
</style>
