<script setup lang="ts">
definePageMeta({ middleware: 'leader' })
useHead({ title: 'Import/Export · Orga' })

interface ImportResult { rows: number, people: number, seated: number, unseated: number, skipped: string[] }

const file = ref<File | null>(null)
const busy = ref(false)
const error = ref('')
const result = ref<ImportResult | null>(null)

function pick(e: Event) {
  file.value = (e.target as HTMLInputElement).files?.[0] ?? null
  error.value = ''
  result.value = null
}

async function run() {
  if (!file.value) return
  if (!confirm(`„${file.value.name}“ ins aktuelle Event übernehmen? Es wird nur ergänzt, nichts gelöscht.`)) return
  busy.value = true
  error.value = ''
  try {
    let json: unknown
    try {
      json = JSON.parse(await file.value.text())
    }
    catch {
      throw new Error(`„${file.value.name}“ ist kein gültiges JSON.`)
    }
    result.value = await api<ImportResult>('/api/orga/sitzplan-import', { method: 'POST', body: json as Record<string, unknown> })
  }
  catch (e) {
    error.value = e instanceof Error && !(e as { data?: unknown }).data ? e.message : apiError(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Import/Export" />

    <section class="card">
      <h2>Export</h2>
      <p class="muted small">Teilnehmer des aktuellen Events mit Nick, Discord-Name und -ID, Kontaktperson und Platz. Enthält personenbezogene Daten – vorsichtig weitergeben.</p>
      <div class="row">
        <a class="btn" href="/api/orga/export?format=csv" download>CSV (Excel)</a>
        <a class="btn" href="/api/orga/export?format=json" download>JSON</a>
      </div>
    </section>

    <section class="card">
      <h2>Import</h2>
      <p>
        Übernimmt Teilnehmer und Reihen ins aktuelle Event – aus unserem eigenen JSON-Export oder aus dem
        <a href="https://github.com/d3molite/Seat-Planner" target="_blank" rel="noopener">Original-Seat-Planner</a>
        (Liste der Attendees mit <code>NickName</code>, <code>NumberOfSeats</code>, <code>SeatIdentifier</code>, wahlweise mit <code>SeatingRows</code>).
      </p>
      <p class="muted small">
        Es wird nur ergänzt: Reihen, deren Buchstabe es schon gibt, und Leute mit schon vorhandenem Nick werden übersprungen.
        Wer auf einem belegten oder unbekannten Platz säße, kommt ohne Platz herein. Leute aus dem Original-Planer haben keine
        Discord-ID und bekommen deshalb keine Nachrichten.
      </p>
      <div class="row">
        <input type="file" accept=".json,application/json" @change="pick">
        <button class="btn primary" :disabled="!file || busy" @click="run">{{ busy ? 'Wird übernommen …' : 'Importieren' }}</button>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="result" class="notice">
        Übernommen: {{ result.people }} Person(en), davon {{ result.seated }} mit Platz<template v-if="result.unseated">, {{ result.unseated }} ohne (Platz belegt oder unbekannt)</template>;
        {{ result.rows }} neue Reihe(n).
        <template v-if="result.skipped.length"><br>Übersprungen (Nick schon vorhanden): {{ result.skipped.join(', ') }}</template>
      </p>
    </section>
  </div>
</template>
