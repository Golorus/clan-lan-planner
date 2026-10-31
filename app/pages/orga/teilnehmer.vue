<script setup lang="ts">
import type { EventFields } from '../../components/EventForm.vue'
import type { Member } from '../../components/MemberPicker.vue'
import { compareByStage, inStageGroup, reachOf, stageOf, STAGE_GROUPS, STAGES, unreached, type Reach, type Stage, type StageGroup } from '#shared/utils/participantStage'

definePageMeta({ middleware: 'leader' })
useHead({ title: 'Teilnehmer · Orga' })

const route = useRoute()
const { data, refresh } = await useFetch('/api/orga/teilnehmer', { key: 'orga-teilnehmer' })
const { data: persons, refresh: refreshPersons } = await useFetch('/api/orga/personen', { key: 'orga-personen' })
const { data: contacts } = await useFetch('/api/orga/kontakte', { key: 'orga-kontakte' })

// ── eine Zeile je Person: Stammdaten aus /personen, Teilnahme am aktuellen Event aus /teilnehmer ──
type Reg = NonNullable<typeof data.value>['people'][number]
interface Row {
  personId: number
  nick: string
  discordId: string | null
  discordName: string | null
  contactId: number | null
  events: number
  reg: Reg | null
  stage: Stage
  reach: Reach
  differs: boolean
}
const rows = computed<Row[]>(() => {
  const regs = new Map((data.value?.people ?? []).map(r => [r.personId, r]))
  const released = !!data.value?.event?.bookingReleased
  return (persons.value?.people ?? []).map((p) => {
    const reg = regs.get(p.id) ?? null
    const stage = stageOf({ registered: !!reg, status: reg?.status, seat: reg?.seat, booking: reg?.booking, waitlist: !!reg?.waitlistAt, contacted: reg?.contacted })
    return {
      personId: p.id,
      nick: p.nick,
      discordId: p.discordId,
      discordName: p.discordName,
      contactId: p.contactId,
      events: p.events,
      reg,
      stage,
      reach: reachOf({ stage, discord: !!p.discordId, messages: reg?.messages ?? {}, bookingReleased: released, offer: !!reg?.offer }),
      differs: stage === 'gebucht' && !!reg?.bookedSeat && reg.bookedSeat !== reg.seat,
    }
  }).sort(compareByStage)
})

// ── Filter: Stand, zusammengefasster Stand, „nicht erreicht“, „weicht ab“, Kontaktperson, Suche ──
type Filter = 'alle' | Stage | StageGroup | 'unerreicht' | 'abweichend'
const FILTERS = new Set<string>(['alle', 'unerreicht', 'abweichend', ...STAGES.map(s => s.key), ...STAGE_GROUPS.map(g => g.key)])
const filter = ref<Filter>(typeof route.query.stand === 'string' && FILTERS.has(route.query.stand) ? route.query.stand as Filter : 'alle')
const isGroup = (f: Filter): f is StageGroup => STAGE_GROUPS.some(g => g.key === f)
const contactFilter = ref<'alle' | 'ohne' | number>('alle')
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const inContact = (r: Row) => contactFilter.value === 'alle' || (contactFilter.value === 'ohne' ? !r.contactId : r.contactId === contactFilter.value)
const matches = (r: Row, f: Filter) => f === 'alle' || (f === 'unerreicht' ? unreached(r.reach) : f === 'abweichend' ? r.differs : isGroup(f) ? inStageGroup(r.stage, f) : r.stage === f)
const countOf = (f: Filter) => rows.value.filter(r => inContact(r) && matches(r, f)).length
const shown = computed(() => {
  const needle = q.value.trim().toLocaleLowerCase('de')
  return rows.value.filter(r => inContact(r) && matches(r, filter.value)
    && (!needle || r.nick.toLocaleLowerCase('de').includes(needle) || (r.discordName ?? '').toLocaleLowerCase('de').includes(needle)))
})
const stageInfo = (s: Stage) => STAGES.find(x => x.key === s)!
const fmt = (d: string | Date | null) => d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : ''

// ── Aktionen ──
const busy = ref(false)
const error = ref('')
const info = ref('')
async function run(fn: () => Promise<unknown>, done?: string) {
  busy.value = true
  error.value = ''
  info.value = ''
  try {
    await fn()
    if (done) info.value = done
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    busy.value = false
    await Promise.all([refresh(), refreshPersons()])
  }
}

/** Nick und Kontaktperson gehören zur Person; über die Teilnahme geändert, steht es im Protokoll */
const patchPerson = (r: Row, body: { nick?: string, contactId?: number | null }) =>
  run(() => r.reg ? api(`/api/orga/teilnehmer/${r.reg.id}`, { method: 'PATCH', body }) : api(`/api/orga/personen/${r.personId}`, { method: 'PATCH', body }))
const patchReg = (id: number, body: Record<string, unknown>) => run(() => api(`/api/orga/teilnehmer/${id}`, { method: 'PATCH', body }))
function rename(r: Row) {
  const nick = prompt('Neuer Nickname (gilt für alle Events)', r.nick)
  if (nick && nick !== r.nick) patchPerson(r, { nick })
}
function setStatus(r: Row, status: 'offen' | 'zugesagt' | 'abgesagt') {
  if (!r.reg) return
  if (status === 'abgesagt' && !confirm(`${r.nick} absagen? Der Platz wird frei.`)) return
  patchReg(r.reg.id, { status })
}
function seat(r: Row) {
  const s = prompt(`Platz für ${r.nick} (z. B. A-12)`, r.reg?.seat ?? '')
  if (s && r.reg) run(() => api('/api/sitzplan/platz', { method: 'POST', body: { registrationId: r.reg!.id, seat: s.trim().toUpperCase() } }))
}
const unseat = (r: Row) => r.reg && run(() => api('/api/sitzplan/platz', { method: 'POST', body: { registrationId: r.reg!.id, seat: null } }))
function remind(id: number | 'alle') {
  run(async () => {
    const res = await api<{ queued: number }>('/api/team/erinnern', { method: 'POST', body: id === 'alle' ? { all: true } : { registrationId: id } })
    info.value = res.queued ? `Erinnerung an ${res.queued} ${res.queued === 1 ? 'Person' : 'Personen'} in der Warteschlange.` : 'Niemand zu erinnern (Erinnerungen abbestellt oder ohne Discord).'
  })
}
function setBooked(r: Row, booked: boolean) {
  if (!r.reg) return
  let seatInput: string | null = null
  if (booked) {
    const answer = prompt('Gebuchter Platz (leer = wie geplant):', '')
    if (answer === null) return
    seatInput = answer.trim() || null
  }
  run(() => api('/api/sitzplan/gebucht', { method: 'POST', body: { registrationId: r.reg!.id, booked, seat: seatInput } }))
}
const takeOver = (r: Row) => r.reg && run(() => api('/api/orga/buchung/uebernehmen', { method: 'POST', body: { registrationId: r.reg!.id } }), 'Platz aus der Buchung übernommen.')
const sendInfo = (r: Row) => r.reg && run(() => api('/api/orga/teilnehmer/info', { method: 'POST', body: { registrationId: r.reg!.id } }), `Info-Nachricht an ${r.nick} wird verschickt.`)
const infoDone = (r: Row) => r.reg && run(() => api('/api/orga/teilnehmer/info-erledigt', { method: 'POST', body: { registrationId: r.reg!.id } }), `Info an ${r.nick} als erledigt abgehakt.`)
const addToEvent = (r: Row) => run(() => api('/api/orga/teilnehmer', { method: 'POST', body: { personId: r.personId } }), `${r.nick} steht jetzt im Event (offen).`)
function removeFromEvent(r: Row) {
  if (r.reg && confirm(`${r.nick} aus dem aktuellen Event nehmen? Der Platz wird frei, die Person bleibt.`)) {
    run(() => api(`/api/orga/teilnehmer/${r.reg!.id}`, { method: 'DELETE' }), `${r.nick} ist nicht mehr im Event.`)
  }
}
function removePerson(r: Row) {
  if (!confirm(`${r.nick} endgültig löschen?${r.events ? ` Auch ${r.events} Teilnahme(n), auch an früheren Events, werden gelöscht.` : ''}`)) return
  run(() => api(`/api/orga/personen/${r.personId}`, { method: 'DELETE' }), `${r.nick} gelöscht.`)
}
function invite() {
  run(async () => {
    const res = await api<{ invited: number }>('/api/orga/teilnehmer/einladen', { method: 'POST' })
    info.value = res.invited ? `${res.invited} bekannte Personen ins Event geholt (offen).` : 'Alle bekannten Personen stehen schon im Event.'
  })
}

// ── Info-Nachricht nach der Zusage ──
const missingInfo = computed(() => (data.value?.people ?? []).filter(p => p.status === 'zugesagt' && p.discordId && (!p.info || p.info.status === 'fehler')).length)
function sendInfoAll() {
  if (!confirm(`Info-Nachricht an ${missingInfo.value} Zugesagte schicken, die sie noch nicht bekommen haben?`)) return
  run(async () => {
    const res = await api<{ queued: number }>('/api/orga/teilnehmer/info', { method: 'POST', body: { all: true } })
    info.value = `Info-Nachricht wird an ${res.queued} Teilnehmer verschickt (etwa eine pro Sekunde).`
  })
}
function infoDoneAll() {
  if (!confirm(`Info-Nachricht für ${missingInfo.value} Zugesagte als erledigt abhaken, ohne sie zu schicken?`)) return
  run(async () => {
    const res = await api<{ done: number }>('/api/orga/teilnehmer/info-erledigt', { method: 'POST', body: { all: true } })
    info.value = `${res.done} als erledigt abgehakt.`
  })
}
async function setInfoAuto(enabled: boolean) {
  await run(async () => {
    const { settings } = await api<{ settings: { registrierung: { enabled: boolean, body: string } } }>('/api/orga/nachrichten')
    await api('/api/orga/nachrichten/einstellungen', { method: 'PUT', body: { registrierung: { ...settings.registrierung, enabled } } })
  }, enabled ? 'Wer zusagt, bekommt die Info-Nachricht automatisch.' : 'Die Info-Nachricht geht nur noch per Knopf raus.')
}
// „wartet“ aktualisieren, solange Nachrichten in der Warteschlange sind
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (!busy.value && rows.value.some(r => r.reach.state === 'wartet')) refresh()
  }, 4000)
})
onBeforeUnmount(() => clearInterval(timer))

// ── Person anlegen (aus den Discord-Mitgliedern) ──
const adding = ref<Member | null>(null)
const addNick = ref('')
const addContact = ref<number | null>(null)
const addNow = ref(true)
function pickMember(m: Member) {
  adding.value = m
  addNick.value = m.name
}
async function add() {
  const m = adding.value
  if (!m) return
  await run(() => api('/api/orga/personen', {
    method: 'POST',
    body: { discordId: m.discordId, discordName: m.username, nick: addNick.value, contactId: addContact.value, addToEvent: addNow.value && !!data.value?.event },
  }), `${addNick.value} angelegt.`)
  if (!error.value) adding.value = null
}
const knownIds = computed(() => rows.value.flatMap(r => r.discordId ? [r.discordId] : []))

// Noch kein Event: direkt hier anlegen
const createEvent = (fields: EventFields & { copyRowsFrom?: number | null, makeCurrent?: boolean }) =>
  run(() => api('/api/orga/events', { method: 'POST', body: { ...fields, copyRowsFrom: null, makeCurrent: true } }))
</script>

<template>
  <div class="wrap orga">
    <OrgaNav title="Teilnehmer" />
    <p v-if="error" class="notice err">{{ error }}</p>
    <p v-if="info" class="notice">{{ info }}</p>
    <FreigabenCard />

    <section v-if="!data?.event" class="card">
      <h2>Erst ein Event anlegen</h2>
      <p class="muted small">Teilnehmer sind die Personen im aktuellen Event. Leg dafür zuerst das Event an; Personen anlegen kannst du unten trotzdem schon.</p>
      <EventForm :copy-from="[]" submit-label="Event anlegen" :busy="busy" @submit="createEvent" />
    </section>

    <section class="card">
      <div class="row head">
        <h2>{{ rows.length }} Personen<span v-if="data?.event" class="muted"> · {{ data.event.name }}</span></h2>
        <span class="row">
          <select v-model="contactFilter" aria-label="Kontaktperson">
            <option value="alle">alle Kontaktpersonen</option>
            <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.nick }}</option>
            <option value="ohne">ohne Kontaktperson</option>
          </select>
          <input v-model="q" type="search" placeholder="Suchen …" class="search">
        </span>
      </div>

      <div class="chips" role="group" aria-label="Stand">
        <button type="button" class="chip" :class="{ active: filter === 'alle' }" @click="filter = 'alle'">Alle <b>{{ countOf('alle') }}</b></button>
        <button v-for="s in STAGES" :key="s.key" type="button" class="chip" :class="{ active: filter === s.key }" @click="filter = s.key">
          {{ s.label }} <b>{{ countOf(s.key) }}</b>
        </button>
        <span class="sep" aria-hidden="true" />
        <button v-for="g in STAGE_GROUPS" :key="g.key" type="button" class="chip" :class="{ active: filter === g.key }" :title="g.title" @click="filter = g.key">
          {{ g.label }} <b>{{ countOf(g.key) }}</b>
        </button>
        <button v-if="countOf('unerreicht')" type="button" class="chip warn" :class="{ active: filter === 'unerreicht' }" @click="filter = 'unerreicht'">nicht erreicht <b>{{ countOf('unerreicht') }}</b></button>
        <button v-if="countOf('abweichend')" type="button" class="chip warn" :class="{ active: filter === 'abweichend' }" @click="filter = 'abweichend'">Platz weicht ab <b>{{ countOf('abweichend') }}</b></button>
      </div>

      <div v-if="data?.event" class="row toolbar small">
        <button class="btn small" :disabled="busy" title="Personen, die der Planner kennt, aber noch nicht im Event stehen" @click="invite">Bekannte Personen einladen</button>
        <button class="btn small" :disabled="busy || !(countOf('offen') + countOf('eingeladen'))" title="Alle, die noch nicht geantwortet haben" @click="remind('alle')">Alle Offenen erinnern</button>
        <span class="sep" />
        <strong>Info-Nachricht</strong>
        <label class="row toggle">
          <input type="checkbox" :checked="data.infoAuto" :disabled="busy" @change="setInfoAuto(($event.target as HTMLInputElement).checked)">
          automatisch bei Zusage
        </label>
        <button class="btn small" :disabled="busy || !missingInfo" @click="sendInfoAll">{{ missingInfo ? `An ${missingInfo} ohne Info senden` : 'Alle haben die Info' }}</button>
        <button v-if="missingInfo" class="btn small" :disabled="busy" title="Die Leute sind schon anders informiert: nichts schicken, nur abhaken" @click="infoDoneAll">Alle abhaken</button>
        <NuxtLink to="/orga/nachrichten" class="muted">Texte</NuxtLink>
      </div>

      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Stand</th><th>Erreicht</th><th>Nick</th><th>Kontaktperson</th><th>Platz</th><th /></tr></thead>
          <tbody>
            <tr v-for="r in shown" :key="r.personId" :class="['st-' + r.stage, { differs: r.differs }]">
              <td class="nowrap">
                <span v-if="stageInfo(r.stage).steps !== null" class="steps" :title="`${stageInfo(r.stage).steps} von 3: zugesagt, Platz, gebucht`">
                  <i v-for="n in 3" :key="n" :class="{ on: n <= stageInfo(r.stage).steps! }" />
                </span>
                <span v-else class="icon" aria-hidden="true">{{ stageInfo(r.stage).icon }}</span>
                {{ stageInfo(r.stage).label }}
                <span v-if="r.reg?.offer" class="sub">Angebot bis {{ fmt(r.reg.offer.expiresAt) }}</span>
              </td>
              <td class="reach" :class="r.reach.state" :title="r.reach.error ?? (r.reach.at ? fmt(r.reach.at) : '')">
                <template v-if="r.reach.state !== 'none'">{{ r.reach.state === 'ok' ? '✓' : r.reach.state === 'wartet' ? '…' : r.reach.state === 'offen' ? '–' : '✗' }} {{ r.reach.label }}</template>
                <span v-else class="muted">{{ r.reach.label }}</span>
              </td>
              <td>
                {{ r.nick }}<span v-if="r.reg?.remindersOff" title="Erinnerungen abbestellt"> 🔕</span>
                <span class="sub" :title="r.discordId ?? ''">{{ r.discordId ? '@' + (r.discordName ?? '–') : 'ohne Discord (Import)' }}</span>
              </td>
              <td>
                <select :value="r.contactId ?? ''" :disabled="busy" :aria-label="`Kontaktperson von ${r.nick}`" @change="patchPerson(r, { contactId: Number(($event.target as HTMLSelectElement).value) || null })">
                  <option value="">keine</option>
                  <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.nick }}</option>
                </select>
              </td>
              <td class="nowrap">
                <template v-if="r.reg?.status === 'zugesagt'">
                  {{ r.reg.seat ?? '–' }}<span v-if="r.reg.double" class="sub">doppelt</span>
                  <span v-if="r.differs" class="sub bad-text">gebucht {{ r.reg.bookedSeat }}</span>
                </template>
              </td>
              <td class="end">
                <button v-if="!r.reg && data?.event" class="btn small" :disabled="busy" @click="addToEvent(r)">+ Zum Event</button>
                <RowMenu>
                  <template v-if="r.reg">
                    <button v-if="r.reg.status !== 'zugesagt'" :disabled="busy" @click="setStatus(r, 'zugesagt')">Als zugesagt eintragen</button>
                    <button v-if="r.reg.status !== 'offen'" :disabled="busy" @click="setStatus(r, 'offen')">Zurück auf offen</button>
                    <button v-if="r.reg.status !== 'abgesagt'" :disabled="busy" @click="setStatus(r, 'abgesagt')">Absagen</button>
                    <hr>
                    <template v-if="r.reg.status === 'zugesagt'">
                      <button :disabled="busy" @click="seat(r)">Platz setzen …</button>
                      <button v-if="r.reg.seat" :disabled="busy" @click="unseat(r)">Platz freigeben</button>
                      <button :disabled="busy" @click="patchReg(r.reg.id, { double: !r.reg.double })">{{ r.reg.double ? 'Einfach breit' : 'Doppelt breit' }}</button>
                      <button v-if="r.reg.booking !== 'gebucht'" :disabled="busy" @click="setBooked(r, true)">Als gebucht melden …</button>
                      <button v-else :disabled="busy" @click="setBooked(r, false)">Doch nicht gebucht</button>
                      <button v-if="r.differs" :disabled="busy" @click="takeOver(r)">Gebuchten Platz übernehmen</button>
                      <hr>
                    </template>
                    <template v-if="r.discordId">
                      <button v-if="r.stage === 'offen' || r.stage === 'eingeladen'" :disabled="busy" @click="remind(r.reg.id)">Jetzt erinnern</button>
                      <button v-if="r.reg.status === 'zugesagt'" :disabled="busy" @click="sendInfo(r)">{{ r.reg.info?.status === 'gesendet' ? 'Info-Nachricht erneut senden' : 'Info-Nachricht senden' }}</button>
                      <button v-if="r.reg.status === 'zugesagt' && (!r.reg.info || r.reg.info.status === 'fehler')" :disabled="busy" @click="infoDone(r)">Info als erledigt abhaken</button>
                      <NuxtLink :to="{ path: '/orga/nachrichten', query: { an: r.reg.id } }">Nachricht schreiben …</NuxtLink>
                      <hr>
                    </template>
                  </template>
                  <button :disabled="busy" @click="rename(r)">Umbenennen …</button>
                  <button v-if="r.reg" :disabled="busy" @click="removeFromEvent(r)">Aus Event nehmen</button>
                  <hr>
                  <button class="danger" :disabled="busy" @click="removePerson(r)">Person löschen …</button>
                </RowMenu>
              </td>
            </tr>
            <tr v-if="!shown.length"><td colspan="6" class="muted">{{ rows.length ? 'Niemand gefunden.' : 'Noch keine Personen.' }}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Person anlegen</h2>
      <p class="muted small">Auswahl aus den Mitgliedern unseres Discord-Servers. Personen bleiben über alle Events bestehen.</p>
      <MemberPicker v-if="!adding" :exclude="knownIds" @pick="pickMember" />
      <form v-else class="form-grid" @submit.prevent="add">
        <p class="full">Discord: <strong>{{ adding.name }}</strong> <span class="muted">@{{ adding.username }}</span></p>
        <label class="field"><span>Nickname</span><input v-model="addNick" required minlength="2" maxlength="32"></label>
        <label class="field"><span>Kontaktperson</span>
          <select v-model="addContact"><option :value="null">keine</option><option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.nick }}</option></select>
        </label>
        <label v-if="data?.event" class="row toggle"><input v-model="addNow" type="checkbox"> gleich zu {{ data.event.name }} einladen</label>
        <div class="row">
          <button class="btn primary" :disabled="busy">Anlegen</button>
          <button type="button" class="btn" @click="adding = null">Abbrechen</button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.head { justify-content: space-between; margin-bottom: 10px; }
.head h2 { margin: 0; }
.search { min-width: 220px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.chip { font: inherit; font-size: 14px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; }
.chip b { font-weight: 600; color: var(--muted); margin-left: 2px; }
.chip.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.chip.warn, .chip.warn b { color: var(--err); }
.toolbar { gap: 8px 12px; padding: 8px 10px; margin-bottom: 8px; border-radius: 8px; background: var(--bg); }
.toolbar .sep, .chips .sep { width: 1px; align-self: stretch; background: var(--border); }
.toggle { gap: 6px; flex-wrap: nowrap; font-size: 14px; }
.steps { display: inline-flex; gap: 3px; margin-right: 6px; vertical-align: 1px; }
.steps i { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--accent); }
.steps i.on { background: var(--accent); }
.icon { display: inline-block; width: 36px; text-align: center; margin-right: 0; }
.reach { font-size: 13.5px; white-space: nowrap; }
.reach.ok { color: var(--accent); }
.reach.fehler, .reach.fehlt { color: var(--err); }
.reach.wartet, .reach.offen { color: var(--muted); }
tr.st-abgesagt td, tr.st-nicht td { color: var(--muted); }
tr.differs td { background: color-mix(in srgb, #d39b1d 12%, var(--card)); }
.bad-text { color: var(--err); }
.end { text-align: right; width: 1%; white-space: nowrap; }
.end > .btn { margin-right: 4px; }
.nowrap { white-space: nowrap; }
.full { grid-column: 1 / -1; margin: 0; }
@media (max-width: 560px) { .search { min-width: 0; width: 100%; } }
</style>
