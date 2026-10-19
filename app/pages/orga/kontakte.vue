<script setup lang="ts">
import type { Member } from '../../components/MemberPicker.vue'

definePageMeta({ middleware: 'leader' })
useHead({ title: 'Kontaktpersonen · Orga' })

const { data, refresh } = await useFetch('/api/orga/kontakte', { key: 'orga-kontakte' })

const busy = ref(false)
const error = ref('')
async function run(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try {
    await fn()
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    busy.value = false
    await refresh()
  }
}

const patch = (id: number, body: Record<string, unknown>) => run(() => api(`/api/orga/kontakte/${id}`, { method: 'PATCH', body }))
function remove(id: number, nick: string, people: number) {
  if (!confirm(`${nick} als Kontaktperson entfernen?${people ? ` ${people} Person(en) stehen danach ohne Kontaktperson da.` : ''}`)) return
  run(() => api(`/api/orga/kontakte/${id}`, { method: 'DELETE' }))
}
const add = (m: Member) => run(() => api('/api/orga/kontakte', { method: 'POST', body: { discordId: m.discordId, discordName: m.username, nick: m.name } }))
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Kontaktpersonen" />

    <section class="card">
      <p class="muted small">
        Kontaktpersonen gelten dauerhaft über alle Events. Sie sehen ihre Leute im aktuellen Event und dürfen sie
        setzen und untereinander tauschen – Leute anderer Kontaktpersonen nicht. Ihre Farbe erscheint im öffentlichen Sitzplan.
      </p>
      <p v-if="error" class="notice err">{{ error }}</p>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Farbe</th><th>Nick (öffentlich)</th><th>Discord</th><th>Personen</th><th>im Event</th><th /></tr></thead>
          <tbody>
            <tr v-for="c in data" :key="c.id">
              <td><input type="color" :value="c.color" :disabled="busy" @change="patch(c.id, { color: ($event.target as HTMLInputElement).value })"></td>
              <td><input :value="c.nick" maxlength="32" :disabled="busy" @change="patch(c.id, { nick: ($event.target as HTMLInputElement).value })"></td>
              <td :title="c.discordId">@{{ c.discordName }}</td>
              <td>{{ c.persons }}</td>
              <td>{{ c.people }}</td>
              <td><button class="btn small danger" :disabled="busy" @click="remove(c.id, c.nick, c.persons)">Entfernen</button></td>
            </tr>
            <tr v-if="!data?.length"><td colspan="6" class="muted">Noch keine Kontaktpersonen.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Kontaktperson ernennen</h2>
      <MemberPicker :exclude="(data ?? []).map(c => c.discordId)" @pick="add" />
    </section>
  </div>
</template>
