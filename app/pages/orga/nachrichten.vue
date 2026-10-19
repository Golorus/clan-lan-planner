<script setup lang="ts">
import { orgaHeaders } from '#shared/utils/orgaContext'
import { formatEventRange } from '#shared/utils/eventTime'
import { MANUAL_PLACEHOLDERS, renderMessage } from '#shared/utils/messageText'

definePageMeta({ middleware: 'leader' })
useHead({ title: 'Nachrichten · Orga' })

const route = useRoute()
const { data, refresh } = await useFetch('/api/orga/nachrichten', { key: 'orga-nachrichten' })
const { data: tn } = await useFetch('/api/orga/teilnehmer', { key: 'orga-teilnehmer' })
const { data: contacts } = await useFetch('/api/orga/kontakte', { key: 'orga-kontakte' })
const { data: plan } = await useFetch('/api/sitzplan', { key: 'orga-sitzplan', headers: orgaHeaders('/orga') })

const people = computed(() => tn.value?.people ?? [])
const confirmed = computed(() => people.value.filter(p => p.status === 'zugesagt'))
const busy = ref(false)
const error = ref('')
const info = ref('')
async function run(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  info.value = ''
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

// ── Verfassen ──
const anId = Number(route.query.an) || null
const target = reactive({ type: (anId ? 'person' : 'all') as 'all' | 'contact' | 'person', contactId: null as number | null, registrationId: anId })
const body = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

const recipients = computed(() => {
  if (target.type === 'person') return people.value.filter(p => p.id === target.registrationId)
  if (target.type === 'contact') return confirmed.value.filter(p => p.contactId === target.contactId)
  return confirmed.value
})
const withoutDiscord = computed(() => recipients.value.filter(p => !p.discordId).length)

function useTemplate(e: Event) {
  const id = Number((e.target as HTMLSelectElement).value)
  const t = data.value?.templates.find(t => t.id === id)
  if (t) body.value = t.body
  ;(e.target as HTMLSelectElement).value = ''
}
function insert(ph: string) {
  const el = textarea.value
  const token = `{${ph}}`
  if (!el) {
    body.value += token
    return
  }
  const { selectionStart: a, selectionEnd: b } = el
  body.value = body.value.slice(0, a) + token + body.value.slice(b)
  nextTick(() => {
    el.focus()
    el.selectionStart = el.selectionEnd = a + token.length
  })
}
const appLink = useRequestURL().origin + '/'
const preview = computed(() => {
  const p = recipients.value[0]
  if (!p || !body.value) return ''
  const ev = plan.value?.event
  return renderMessage(body.value, {
    nick: p.nick, platz: p.seat ?? 'noch keiner', event: ev?.name ?? '', datum: ev ? formatEventRange(ev.startsAt, ev.endsAt) : '', kontakt: p.contactNick ?? 'die Orga',
    link: appLink, frist: ev?.demandUntil ? formatEventRange(ev.demandUntil, '') : 'noch offen',
    platz_bis: ev?.bookingFrom ? formatEventRange(ev.bookingFrom, '') : 'noch offen', countdown: '…',
    buchungslink: appLink, buchen_bis: ev?.bookingUntil ? formatEventRange(ev.bookingUntil, '') : 'noch offen',
  })
})

function send() {
  const n = recipients.value.length
  if (!n || !confirm(`Nachricht an ${n} Empfänger schicken?`)) return
  const t = target.type === 'person' ? { type: 'person', registrationId: target.registrationId } : target.type === 'contact' ? { type: 'contact', contactId: target.contactId } : { type: 'all' }
  run(async () => {
    await api('/api/orga/nachrichten', { method: 'POST', body: { target: t, body: body.value } })
    info.value = `Wird an ${n} Empfänger verschickt (etwa eine pro Sekunde, wegen der Discord-Limits).`
    body.value = ''
  })
}

// ── Versandstatus ──
const open = ref<number | null>(null)
const deliveries = ref<Array<{ id: number, nick: string, status: string, error: string | null, text: string | null }>>([])
async function toggle(id: number) {
  if (open.value === id) {
    open.value = null
    return
  }
  open.value = id
  deliveries.value = await api(`/api/orga/nachrichten/${id}`)
}
const pending = computed(() => (data.value?.batches ?? []).some(b => b.counts.wartet) || (data.value?.auto ?? []).some(a => a.status === 'wartet'))
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(async () => {
    if (!pending.value) return
    await refresh()
    if (open.value) deliveries.value = await api(`/api/orga/nachrichten/${open.value}`)
  }, 4000)
})
onBeforeUnmount(() => clearInterval(timer))
const time = (d: string | Date | null) => d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : ''

// ── Vorlagen ──
const newTpl = reactive({ name: '', body: '' })
const addTemplate = () => run(async () => {
  await api('/api/orga/vorlagen', { method: 'POST', body: { ...newTpl } })
  newTpl.name = ''
  newTpl.body = ''
})
const saveTemplate = (t: { id: number, name: string, body: string }) => run(() => api(`/api/orga/vorlagen/${t.id}`, { method: 'PATCH', body: { name: t.name, body: t.body } }))
function deleteTemplate(id: number, name: string) {
  if (confirm(`Vorlage „${name}“ löschen?`)) run(() => api(`/api/orga/vorlagen/${id}`, { method: 'DELETE' }))
}

// ── Automatische Nachrichten ──
type Kind = 'registrierung' | 'umsetzung' | 'erinnerung_offen' | 'erinnerung_platz' | 'erinnerung_buchung' | 'buchung' | 'absage_kontakt' | 'angebot' | 'nachgerueckt_kontakt' | 'bereich'
/** Anlass, Erklärung, darf ausgeschaltet werden? (Angebote und Buchungsfreigabe gehen immer raus) */
const KINDS: [Kind, string, string, boolean][] = [
  ['registrierung', 'Info-Nachricht bei Zusage', 'Auch per Knopf unter Teilnehmer nachsendbar.', true],
  ['umsetzung', 'Umgesetzt', 'Wenn jemand von Kontaktperson oder Orga umgesetzt wurde (nach 1 Minute, damit mehrfaches Umsetzen nur eine Nachricht auslöst).', true],
  ['erinnerung_offen', 'Erinnerung an Offene', 'Vor dem Ende der Bedarfsabfrage (Tage unter Events › Fristen & Buchung), mit den Knöpfen „Bin dabei“ / „Bin nicht dabei“.', true],
  ['erinnerung_platz', 'Erinnerung zur Platzwahl', 'An Zugesagte ohne Platz, vor dem Ende der Platzwahl.', true],
  ['buchung', 'Buchung freigegeben', 'Mit {code} (Buchungscode), {buchungslink} und {buchen_bis}; Knopf „Ich habe gebucht“. Geht beim Freigeben immer raus.', false],
  ['erinnerung_buchung', 'Erinnerung zur Buchung', 'An Zugesagte, die noch nicht gebucht haben, vor „Buchen bis“. Darf {code} enthalten.', true],
  ['absage_kontakt', 'Absage an die Kontaktperson', '{kontakt} ist die Kontaktperson, {nick} wer abgesagt hat, {platz} der frei gewordene Platz.', true],
  ['angebot', 'Platzangebot (Warteliste)', 'Mit {angebot_bis} und den Knöpfen „Platz annehmen“ / „Ablehnen“. Geht immer raus.', false],
  ['nachgerueckt_kontakt', 'Nachgerückt, an die Kontaktperson', '{kontakt} ist die Kontaktperson, {nick} wer nachgerückt ist.', true],
  ['bereich', 'Platz außerhalb des gemeldeten Bereichs', 'Beim Fixieren des Bereichs an alle, die außerhalb saßen; {platz} ist der bisherige Platz. Geht immer raus.', false],
]
const KIND_LABEL = Object.fromEntries(KINDS.map(([k, l]) => [k, l])) as Record<string, string>
const settings = reactive(Object.fromEntries(KINDS.map(([k]) => [k, { enabled: true, body: '' }])) as Record<Kind, { enabled: boolean, body: string }>)
watch(() => data.value?.settings, (s) => {
  if (s) Object.assign(settings, JSON.parse(JSON.stringify(s)))
}, { immediate: true })
const saveSettings = () => run(async () => {
  await api('/api/orga/nachrichten/einstellungen', { method: 'PUT', body: settings })
  info.value = 'Automatische Nachrichten gespeichert.'
})
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Nachrichten" />
    <p v-if="error" class="notice err">{{ error }}</p>
    <p v-if="info" class="notice">{{ info }}</p>

    <section class="card">
      <h2>Nachricht schicken</h2>
      <p class="muted small">Der Bot schickt jedem Empfänger eine Direktnachricht. Platzhalter werden pro Person eingesetzt. Den Buchungscode gibt es nur in der Buchungsnachricht.</p>
      <div class="form-grid">
        <label class="field"><span>An</span>
          <select v-model="target.type">
            <option value="all">alle Zugesagten ({{ confirmed.length }})</option>
            <option value="contact">die zugesagten Leute einer Kontaktperson</option>
            <option value="person">eine Person</option>
          </select>
        </label>
        <label v-if="target.type === 'contact'" class="field"><span>Kontaktperson</span>
          <select v-model="target.contactId">
            <option :value="null" disabled>wählen …</option>
            <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.nick }} ({{ c.people }})</option>
          </select>
        </label>
        <label v-if="target.type === 'person'" class="field"><span>Person</span>
          <select v-model="target.registrationId">
            <option :value="null" disabled>wählen …</option>
            <option v-for="p in people" :key="p.id" :value="p.id">{{ p.nick }}{{ p.discordName ? ` (@${p.discordName})` : '' }} · {{ p.status }}</option>
          </select>
        </label>
        <label class="field"><span>Vorlage einsetzen</span>
          <select @change="useTemplate"><option value="">–</option><option v-for="t in data?.templates" :key="t.id" :value="t.id">{{ t.name }}</option></select>
        </label>
      </div>
      <div class="ph row">
        <span class="muted small">Platzhalter:</span>
        <button v-for="ph in MANUAL_PLACEHOLDERS" :key="ph" type="button" class="btn small" @click="insert(ph)" v-text="'{' + ph + '}'" />
      </div>
      <textarea ref="textarea" v-model="body" maxlength="1900" placeholder="Hallo {nick}, …" />
      <p v-if="preview" class="preview"><span class="muted small">Vorschau für {{ recipients[0]?.nick }}:</span><br>{{ preview }}</p>
      <p v-if="withoutDiscord" class="muted small">{{ withoutDiscord }} Empfänger ohne Discord-ID (aus dem Import) bekommen nichts.</p>
      <button class="btn primary" :disabled="busy || !body.trim() || !recipients.length" @click="send">An {{ recipients.length }} Empfänger senden</button>
    </section>

    <section class="card">
      <h2>Versendet</h2>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Zeit</th><th>An</th><th>Text</th><th>Status</th><th /></tr></thead>
          <tbody>
            <template v-for="b in data?.batches" :key="b.id">
              <tr>
                <td class="nowrap">{{ time(b.createdAt) }}</td>
                <td>{{ b.target }}</td>
                <td class="text">{{ b.body }}</td>
                <td class="nowrap">
                  <span class="ok-text">{{ b.counts.gesendet }} ✓</span>
                  <span v-if="b.counts.wartet"> · {{ b.counts.wartet }} wartet</span>
                  <span v-if="b.counts.fehler" class="err"> · {{ b.counts.fehler }} Fehler</span>
                </td>
                <td><button class="btn small" @click="toggle(b.id)">{{ open === b.id ? 'Zu' : 'Details' }}</button></td>
              </tr>
              <tr v-if="open === b.id">
                <td colspan="5">
                  <ul class="deliveries">
                    <li v-for="d in deliveries" :key="d.id" :class="d.status">
                      <strong>{{ d.nick }}</strong> – {{ d.status }}<span v-if="d.error">: {{ d.error }}</span>
                    </li>
                  </ul>
                </td>
              </tr>
            </template>
            <tr v-if="!data?.batches.length"><td colspan="5" class="muted">Noch nichts verschickt.</td></tr>
          </tbody>
        </table>
      </div>

      <h3>Automatische Nachrichten</h3>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Zeit</th><th>Anlass</th><th>An</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="a in data?.auto" :key="a.id">
              <td class="nowrap">{{ time(a.sentAt ?? a.sendAfter) }}</td>
              <td>{{ KIND_LABEL[a.kind] ?? a.kind }}</td>
              <td>{{ a.nick }}</td>
              <td :class="{ err: a.status === 'fehler', 'ok-text': a.status === 'gesendet', muted: a.status === 'entfallen' }">{{ a.status }}<span v-if="a.error">: {{ a.error }}</span></td>
            </tr>
            <tr v-if="!data?.auto.length"><td colspan="4" class="muted">Noch keine.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Automatische Nachrichten</h2>
      <p class="muted small">Platzhalter: {nick} {platz} {event} {datum} {kontakt} {link} {frist} {platz_bis} {countdown} {buchungslink} {buchen_bis} {angebot_bis} {code}. Wer Erinnerungen abbestellt hat, bekommt keine.</p>
      <div class="auto">
        <template v-for="[k, label, help, optional] in KINDS" :key="k">
          <label class="check">
            <input v-if="optional" v-model="settings[k].enabled" type="checkbox">
            <strong>{{ label }}</strong>
          </label>
          <p class="muted small help">{{ help }}</p>
          <textarea v-model="settings[k].body" maxlength="1900" :disabled="optional && !settings[k].enabled" />
        </template>
      </div>
      <button class="btn primary" :disabled="busy" @click="saveSettings">Speichern</button>
    </section>

    <section class="card">
      <h2>Vorlagen</h2>
      <div v-for="t in data?.templates" :key="t.id" class="tpl">
        <input v-model="t.name" maxlength="60">
        <textarea v-model="t.body" maxlength="1900" />
        <div class="row">
          <button class="btn small" :disabled="busy" @click="saveTemplate(t)">Speichern</button>
          <button class="btn small danger" :disabled="busy" @click="deleteTemplate(t.id, t.name)">Löschen</button>
        </div>
      </div>
      <form class="tpl" @submit.prevent="addTemplate">
        <input v-model="newTpl.name" required maxlength="60" placeholder="Name der neuen Vorlage">
        <textarea v-model="newTpl.body" required maxlength="1900" placeholder="Text mit Platzhaltern, z. B. Hallo {nick}, dein Platz ist {platz}." />
        <div><button class="btn primary" :disabled="busy">Vorlage anlegen</button></div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.ph { margin: 14px 0 8px; gap: 6px; }
.preview { white-space: pre-wrap; padding: 10px 12px; border-left: 3px solid var(--discord); background: color-mix(in srgb, var(--discord) 8%, var(--card)); border-radius: 6px; }
.nowrap { white-space: nowrap; }
.text { max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
h3 { margin: 22px 0 8px; font-size: 16px; }
.deliveries { margin: 0; padding-left: 18px; columns: 2 260px; font-size: 14px; }
.deliveries .fehler { color: var(--err); }
.auto { display: grid; gap: 8px; margin-bottom: 12px; }
.check { display: flex; gap: 8px; align-items: center; font-size: 14px; margin-top: 8px; }
.help { margin: -4px 0 0; }
.tpl { display: grid; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.tpl:last-child { border-bottom: 0; }
.tpl textarea { min-height: 70px; }
</style>
