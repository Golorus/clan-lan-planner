<script setup lang="ts">
import { buildChecklist, type ChecklistEvent, type ChecklistMe, type ChecklistStep } from '#shared/utils/checklist'
import type { MapContact } from './SeatMap.vue'

/**
 * „Dein Stand“: die eine Stelle zum Handeln auf der Startseite. Oben Event und Zeitstrahl, darunter die Schritte;
 * der Schritt, der dran ist, enthält seine Aktion selbst (zusagen, Platzangebot, Buchungscode, „Ich habe gebucht“).
 * Was dran ist, berechnet buildChecklist aus denselben Regeln wie das Backend; hier wird nur angezeigt und abgeschickt.
 */
export interface PlanEvent extends ChecklistEvent {
  name: string
  phase: 'vorher' | 'abfrage' | 'nachher'
  seatsOpen: boolean
  waitlistActive: boolean
}
export interface PlanMe extends ChecklistMe {
  name: string
  isLeader: boolean
  registrationId: number | null
  offer: { id: number, seat: string | null, expiresAt: string | Date } | null
  booking: { code: string, url: string, until: string, status: 'offen' | 'gebucht', bookedSeat: string | null } | null
  remindersOff: boolean
  person: { nick: string, contactId: number | null } | null
}

const props = defineProps<{ event: PlanEvent, contacts: MapContact[], me: PlanMe, confirmed: number }>()
const emit = defineEmits<{ changed: [] }>()

const route = useRoute()
const router = useRouter()

// Fristen springen auf die Minute um, auch ohne neue Daten
const now = ref(new Date())
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => (tick = setInterval(() => (now.value = new Date()), 15_000)))
onBeforeUnmount(() => clearInterval(tick))

const { eventRoleName } = useBranding()
const list = computed(() => buildChecklist(props.event, props.me, props.confirmed, now.value, eventRoleName))

// eingeklappt: nur der Schritt, der dran ist (gemerkt je Browser)
const OPEN_KEY = 'lan-planner-stand-offen'
const open = ref(false)
onMounted(() => {
  try {
    open.value = localStorage.getItem(OPEN_KEY) === '1'
  }
  catch { /* dann eben eingeklappt */ }
})
function toggle() {
  open.value = !open.value
  try {
    localStorage.setItem(OPEN_KEY, open.value ? '1' : '0')
  }
  catch { /* egal */ }
}
const shown = computed<ChecklistStep[]>(() => open.value ? list.value.steps : list.value.focus ? [list.value.focus.step] : [])
const ICON = { done: '✓', now: '●', later: '○', missed: '!' } as const

const status = computed(() => props.me.status)
const confirmed = computed(() => status.value === 'zugesagt')
const contactNick = (id: number | null | undefined) => props.contacts.find(c => c.id === id)?.nick ?? '–'
const known = computed(() => !!props.me.registrationId && !!props.me.person?.contactId)
const onWaitlist = computed(() => !confirmed.value && (!!props.me.waitlistPosition || !!props.me.offer))

function toPlan() {
  document.getElementById('sitzplan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── Anmelden, absagen, Warteliste ──
const editing = ref(false)
const forWaitlist = ref(false)
const nick = ref('')
const contactId = ref<number | null>(null)
const busy = ref(false)
const error = ref('')
const done = ref('')
const needsJoin = ref(false)
const DRAFT = 'lan-planner-registrierung'

function startEdit(waitlist = false) {
  nick.value = props.me.person?.nick ?? props.me.name ?? ''
  contactId.value = props.me.person?.contactId ?? null
  forWaitlist.value = waitlist
  error.value = ''
  needsJoin.value = false
  editing.value = true
}

async function run(fn: () => Promise<unknown>, ok?: string) {
  busy.value = true
  error.value = ''
  done.value = ''
  try {
    await fn()
    if (ok) done.value = ok
    emit('changed')
  }
  catch (e) {
    const code = apiErrorCode(e)
    if (code === 'need_contact') startEdit(forWaitlist.value)
    else if (code === 'not_member') needsJoin.value = true
    else if (code === 'waitlist') {
      error.value = apiError(e)
      emit('changed')
    }
    else error.value = apiError(e)
  }
  finally {
    busy.value = false
  }
}

/** „Bin dabei“: mit gespeicherten Angaben direkt, sonst erst Nick und Kontaktperson */
function confirmJoin() {
  if (!known.value) return startEdit(false)
  run(() => api('/api/sitzplan/status', { method: 'POST', body: { status: 'zugesagt' } }), 'Super, du bist dabei! Such dir jetzt unten einen Platz aus.')
}

function decline() {
  if (confirmed.value && !window.confirm(`Für ${props.event.name} absagen?${props.me.seat ? ` Dein Platz ${props.me.seat} wird sofort frei.` : ''}`)) return
  run(() => api('/api/sitzplan/registrierung', { method: 'DELETE' }), 'Schade! Du bist abgemeldet.')
}

function joinWaitlist() {
  if (!known.value) return startEdit(true)
  run(() => api('/api/sitzplan/warteliste', { method: 'POST' }), 'Du stehst auf der Warteliste. Wird ein Platz frei, schreiben wir dir über Discord.')
}

function leaveWaitlist() {
  run(() => api('/api/sitzplan/warteliste', { method: 'DELETE' }), 'Du bist nicht mehr auf der Warteliste.')
}

function answer(accept: boolean) {
  if (!props.me.offer) return
  run(() => api('/api/sitzplan/angebot', { method: 'POST', body: { offerId: props.me.offer!.id, accept } }),
    accept ? (props.me.offer.seat ? 'Willkommen dabei!' : 'Willkommen dabei! Such dir jetzt einen freien Platz aus.') : 'Alles klar, der Platz geht an den Nächsten.')
}

async function submit() {
  if (!contactId.value) {
    error.value = 'Bitte deine Kontaktperson auswählen – ohne geht es nicht.'
    return
  }
  await run(async () => {
    await api('/api/sitzplan/registrierung', { method: 'POST', body: { nick: nick.value, contactId: contactId.value, waitlist: forWaitlist.value } })
    editing.value = false
    try {
      sessionStorage.removeItem(DRAFT)
    }
    catch { /* egal */ }
  }, forWaitlist.value ? 'Du stehst auf der Warteliste.' : 'Danke! Du bist dabei. Such dir jetzt einen Platz aus.')
}

// ── Buchung beim Veranstalter: Code nur hier, nur für dich ──
const bookedSeat = ref('')
const bookingOpen = ref(false)
function startBooked() {
  bookedSeat.value = props.me.booking?.bookedSeat ?? props.me.seat ?? ''
  bookingOpen.value = true
}
function sendBooked(booked: boolean) {
  run(async () => {
    const r = await api<{ seat: string | null, moved: boolean, differs: boolean }>('/api/sitzplan/gebucht', { method: 'POST', body: { booked, seat: booked ? bookedSeat.value || null : null } })
    bookingOpen.value = false
    // anderer Platz gebucht: war er frei, sitzt du im Plan jetzt dort; sonst klärt es die Orga
    if (booked) done.value = r.moved ? `Danke, ist notiert! Im Sitzplan sitzt du jetzt auf ${r.seat}.` : r.differs ? `Danke, ist notiert! ${r.seat} ist im Sitzplan schon belegt, die Orga schaut drüber.` : 'Danke, ist notiert!'
  }, booked ? undefined : 'Zurückgesetzt: noch nicht gebucht.')
}
const copied = ref(false)
async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.me.booking?.code ?? '')
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
  catch { /* dann eben abtippen */ }
}

function toggleReminders() {
  run(() => api('/api/sitzplan/erinnerungen', { method: 'POST', body: { off: !props.me.remindersOff } }),
    props.me.remindersOff ? 'Erinnerungen sind wieder an.' : 'Du bekommst keine Erinnerungen mehr.')
}

/**
 * Mit Zustimmung unserem Discord-Server beitreten: Discord fragt um Erlaubnis, danach geht es hier weiter.
 * Die Eingaben werden gemerkt und nach dem Beitritt automatisch abgeschickt.
 */
function join() {
  try {
    if (editing.value) sessionStorage.setItem(DRAFT, JSON.stringify({ nick: nick.value, contactId: contactId.value, waitlist: forWaitlist.value }))
  }
  catch { /* dann eben neu ausfüllen */ }
  location.href = '/auth/discord?join=1&redirect=' + encodeURIComponent(editing.value ? '/?registrieren=1' : '/')
}

async function deleteAccount() {
  const contactHint = props.me.contactId ? '\n\nAls Kontaktperson bleibst du eingetragen, bis die Orga dich entfernt.' : ''
  if (!window.confirm('Alle deine Daten löschen?\n\nDas entfernt deine Teilnahmen in allen Events (auch frühere), deine Plätze, deinen Avatar und Nachrichten und meldet dich ab. Das lässt sich nicht rückgängig machen.' + contactHint)) return
  busy.value = true
  error.value = ''
  try {
    await api('/api/konto', { method: 'DELETE' })
    location.href = '/?geloescht=1'
  }
  catch (e) {
    error.value = apiError(e)
    busy.value = false
  }
}

onMounted(() => {
  const q = route.query
  if (q.beitritt === 'ok') done.value = 'Willkommen auf unserem Discord-Server!'
  if (q.beitritt === 'fehler') error.value = 'Der Beitritt zu unserem Discord-Server hat nicht geklappt. Bitte versuch es noch einmal oder melde dich bei der Orga.'
  if (q.registrieren === '1' && !confirmed.value) {
    let draft: { nick?: string, contactId?: number, waitlist?: boolean } | null = null
    try {
      draft = JSON.parse(sessionStorage.getItem(DRAFT) || 'null')
    }
    catch { /* egal */ }
    startEdit(!!draft?.waitlist || props.event.waitlistActive)
    // zurück vom Server-Beitritt: gemerkte Eingaben übernehmen und gleich abschicken
    if (draft?.nick) nick.value = draft.nick
    if (draft?.contactId) contactId.value = draft.contactId
    if (q.beitritt === 'ok' && draft?.contactId) submit()
  }
  if (q.beitritt || q.registrieren) router.replace({ query: {} })
})
</script>

<template>
  <section id="anmeldung" class="card stand">
    <header class="head">
      <div class="title">
        <h1>{{ event.name }}</h1>
        <p class="muted small">
          {{ list.event.when }}<template v-if="list.event.where"> · {{ list.event.where }}</template>
          <span v-if="list.event.countdown" class="badge">{{ list.event.countdown }}</span>
        </p>
      </div>
      <div v-if="list.mode === 'liste' && !editing" class="progress">
        <span class="muted small">{{ list.done }} von {{ list.total }} erledigt</span>
        <button class="btn small" type="button" :aria-expanded="open" @click="toggle">{{ open ? 'Weniger' : 'Alle Schritte' }}</button>
      </div>
    </header>

    <!-- Zeitstrahl: immer sichtbar -->
    <div class="timeline" role="img" :aria-label="list.timeline.summary">
      <div class="bar">
        <div v-for="s in list.timeline.segments" :key="s.key" class="seg" :class="s.state">
          <span class="name">{{ s.label }}</span>
          <span class="date">{{ s.date }}</span>
        </div>
        <span class="today" :class="{ flip: list.timeline.marker > 0.85 }" :style="{ left: `${list.timeline.marker * 100}%` }"><span>heute</span></span>
      </div>
      <p v-if="list.timeline.summary" class="summary small muted"><span class="long">{{ list.timeline.summary }}</span><span class="short">{{ list.timeline.short }}</span></p>
    </div>

    <p v-if="done" class="notice">{{ done }}</p>
    <p v-if="error" class="notice err">{{ error }}</p>
    <p v-for="w in list.warnings" :key="w" class="notice err">{{ w }}</p>

    <!-- Formular: Nick und Kontaktperson -->
    <form v-if="editing" class="grid" @submit.prevent="submit">
      <label class="field">
        <span>Nickname</span>
        <input v-model="nick" required minlength="2" maxlength="32" autocomplete="nickname">
      </label>
      <label class="field">
        <span>Kontaktperson (Pflicht)</span>
        <select v-model="contactId" required>
          <option :value="null" disabled>Bitte wählen …</option>
          <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.nick }}</option>
        </select>
      </label>
      <p class="muted small privacy">
        Wir speichern deine Discord-ID, deinen Namen und Avatar, um dir einen Platz zuzuordnen und dich über Discord zu informieren.
        Deine Daten kannst du jederzeit selbst löschen.
      </p>
      <div v-if="needsJoin" class="notice join">
        <p>
          Mitmachen können nur Mitglieder unseres Discord-Servers – und du bist noch nicht drauf.
          Wenn du einverstanden bist, fügen wir dich hinzu (Discord fragt dich dabei um Erlaubnis) und schicken alles gleich ab.
        </p>
        <div class="row">
          <button type="button" class="btn discord" @click="join">Server beitreten</button>
          <button type="button" class="btn" @click="needsJoin = false">Abbrechen</button>
        </div>
      </div>
      <div class="row">
        <button class="btn primary" :disabled="busy || !contactId">{{ forWaitlist ? 'Auf die Warteliste' : confirmed ? 'Speichern' : 'Bin dabei' }}</button>
        <button type="button" class="btn" @click="editing = false">Abbrechen</button>
      </div>
    </form>

    <p v-else-if="!contacts.length" class="muted">Es sind noch keine Kontaktpersonen eingetragen – bitte später noch einmal vorbeischauen.</p>

    <!-- abgesagt: eine Zeile -->
    <div v-else-if="list.declined" class="declined">
      <span>{{ list.declined.text }}</span>
      <button v-if="list.declined.action === 'zusagen'" class="btn small primary" :disabled="busy" @click="confirmJoin">Doch dabei</button>
      <button v-else class="btn small primary" :disabled="busy" @click="joinWaitlist">Auf die Warteliste</button>
    </div>

    <template v-else>
      <p v-if="!list.focus" class="lead ok-text"><strong>✓ Alles erledigt.</strong> Wir sehen uns auf der LAN!</p>
      <p v-else-if="!open && list.focus.kind === 'next'" class="lead muted small">Gerade nichts zu tun. Als Nächstes:</p>
      <ol class="steps">
        <li v-for="s in shown" :key="s.key" class="step" :class="[s.state, { orga: s.orga }]">
          <span class="icon" aria-hidden="true">{{ ICON[s.state] }}</span>
          <div class="body">
            <div class="line">
              <span class="label">{{ s.label }}</span>
              <span v-if="s.orga" class="badge">Orga</span>
              <span v-if="s.dueText" class="due small">{{ s.dueText }}</span>
              <span v-if="s.left" class="badge" :class="s.state === 'now' ? 'ok' : ''">{{ s.left }}</span>
            </div>
            <p v-if="s.key === 'zusage' && confirmed" class="detail small muted">als {{ me.person?.nick }} · Kontaktperson {{ contactNick(me.person?.contactId) }}</p>
            <p v-else-if="s.key === 'zusage' && s.action === 'zusagen' && known" class="detail small muted">Du sagst zu als {{ me.person?.nick }}, Kontaktperson {{ contactNick(me.person?.contactId) }}.</p>
            <p v-if="s.detail" class="detail small" :class="s.state === 'missed' || s.warn ? 'err' : 'muted'">{{ s.detail }}</p>

            <!-- Buchung: Code nur hier, nur für dich -->
            <div v-if="s.key === 'buchung' && me.booking && s.state === 'now'" class="booking">
              <p>
                Buche bitte <strong>{{ me.seat ? `Platz ${me.seat}` : 'deinen Platz' }}</strong> im Buchungstool des Veranstalters.
              </p>
              <p class="code-line">
                Buchungscode: <code class="code">{{ me.booking.code }}</code>
                <button class="btn small" type="button" @click="copyCode">{{ copied ? 'Kopiert' : 'Kopieren' }}</button>
              </p>
              <p class="muted small">Der Code ist nur für dich – bitte nicht weitergeben.</p>
            </div>
            <form v-if="s.key === 'buchung' && me.booking && bookingOpen" class="row booked-form" @submit.prevent="sendBooked(true)">
              <label class="field">
                <span>Tatsächlich gebuchter Platz</span>
                <input v-model="bookedSeat" placeholder="z. B. A-81" maxlength="10">
              </label>
              <button class="btn small primary" :disabled="busy">Gebucht</button>
              <button v-if="me.booking.status === 'gebucht'" type="button" class="btn small" :disabled="busy" @click="sendBooked(false)">Doch nicht gebucht</button>
              <button type="button" class="btn small" @click="bookingOpen = false">Abbrechen</button>
            </form>

            <!-- Aktionen je Schritt -->
            <div class="act row">
              <template v-if="s.key === 'angebot'">
                <button class="btn small primary" :disabled="busy" @click="answer(true)">Platz annehmen</button>
                <button class="btn small" :disabled="busy" @click="answer(false)">Ablehnen</button>
              </template>
              <button v-else-if="s.key === 'discord'" class="btn small discord" type="button" @click="join">Discord-Server beitreten</button>
              <template v-else-if="s.key === 'zusage'">
                <template v-if="s.action === 'zusagen'">
                  <button class="btn small primary" :disabled="busy" @click="confirmJoin">Bin dabei</button>
                  <button v-if="me.registrationId && status !== 'abgesagt'" class="btn small" :disabled="busy" @click="decline">Bin nicht dabei</button>
                  <button v-if="known" class="btn small" :disabled="busy" @click="startEdit(false)">Angaben ändern</button>
                </template>
                <button v-else-if="s.action === 'warteliste'" class="btn small primary" :disabled="busy" @click="joinWaitlist">Auf die Warteliste</button>
                <button v-else-if="onWaitlist && !me.offer" class="btn small" :disabled="busy" @click="leaveWaitlist">Von der Warteliste nehmen</button>
                <template v-else-if="confirmed && open">
                  <button v-if="event.phase === 'abfrage'" class="btn small" :disabled="busy" @click="startEdit(false)">Angaben ändern</button>
                  <button class="btn small danger" :disabled="busy" @click="decline">Absagen</button>
                </template>
              </template>
              <button v-else-if="s.key === 'platz' && s.state === 'now'" class="btn small primary" type="button" @click="toPlan">Zum Sitzplan</button>
              <template v-else-if="s.key === 'buchung' && me.booking && !bookingOpen">
                <template v-if="s.state === 'now'">
                  <a v-if="me.booking.url" class="btn small primary" :href="me.booking.url" target="_blank" rel="noopener">Zum Buchungstool</a>
                  <button class="btn small" :disabled="busy" @click="startBooked">Ich habe gebucht</button>
                </template>
                <button v-else-if="me.booking.status === 'gebucht' && open" class="btn small" :disabled="busy" @click="startBooked">Platz korrigieren</button>
              </template>
            </div>
          </div>
        </li>
      </ol>
    </template>

    <details class="account">
      <summary class="muted small">Meine Daten</summary>
      <p class="small">
        Gespeichert sind deine Discord-ID, dein Discord-Name, dein Avatar und deine Teilnahmen (Nickname, Kontaktperson, Platz, Buchung).
        Du kannst alles selbst löschen.
      </p>
      <div class="row">
        <button v-if="me.person" class="btn small" :disabled="busy" @click="toggleReminders">{{ me.remindersOff ? 'Erinnerungen wieder anstellen' : 'Keine Erinnerungen mehr' }}</button>
        <button class="btn small danger" :disabled="busy" @click="deleteAccount">Meine Daten löschen</button>
      </div>
    </details>
  </section>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 8px 16px; margin-bottom: 4px; }
.head h1 { margin: 0; font-size: 22px; }
.head .title p { margin: 2px 0 0; }
.head .title .badge { margin-left: 4px; }
.progress { display: flex; align-items: center; gap: 10px; }

.timeline { margin-bottom: 12px; }
.bar { position: relative; display: flex; gap: 3px; margin-top: 20px; }
.seg { flex: 1 1 0; min-width: 0; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); font-size: 12.5px; line-height: 1.3; color: var(--muted); }
.seg .name, .seg .date { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.seg .name { font-weight: 600; }
.seg.past { opacity: .65; }
.seg.current { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--card)); color: var(--text); }
.today { position: absolute; top: -16px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--err); pointer-events: none; }
.today span { position: absolute; top: -2px; left: 4px; font-size: 11px; line-height: 1; color: var(--err); white-space: nowrap; }
.today.flip span { left: auto; right: 4px; }
.summary { margin: 6px 0 0; }
.summary .short { display: none; }

.grid { display: grid; gap: 12px; max-width: 520px; }
.privacy { margin: 0; }
.join p { margin: 0 0 10px; }
.declined { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.lead { margin: 0 0 6px; }

.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.step { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 8px; border: 1px solid transparent; }
.step .icon { flex: none; width: 22px; height: 22px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 13px; font-weight: 700; border: 1px solid var(--border); color: var(--muted); }
.step .body { flex: 1; min-width: 0; }
.step .line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.step .detail { margin: 2px 0 0; }
.step .due { color: var(--muted); }
.step .act { margin-top: 6px; gap: 6px; }
.step .act:empty { display: none; }
.step.done .icon { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.step.done .label { color: var(--muted); }
.step.now { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--card)); }
.step.now .icon { border-color: var(--accent); color: var(--accent); }
.step.now .label { font-weight: 600; }
.step.later { color: var(--muted); }
.step.missed { border-color: color-mix(in srgb, var(--err) 40%, var(--border)); background: color-mix(in srgb, var(--err) 7%, var(--card)); }
.step.missed .icon { border-color: var(--err); color: var(--err); }
.step.missed .label { color: var(--err); font-weight: 600; }
/* Orga-Schritte: nur Info, zählen nicht mit */
.step.orga { padding-top: 4px; padding-bottom: 4px; font-size: 14px; }
.step.orga .icon { width: 18px; height: 18px; font-size: 11px; background: none; border-color: var(--border); color: var(--muted); margin: 0 2px; }
.step.orga .label { color: var(--muted); }

.booking { margin: 8px 0 0; padding: 10px 12px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border)); background: var(--card); }
.booking p { margin: 0 0 6px; }
.booking p:last-child { margin: 0; }
.code-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.code { font-size: 1.15em; padding: 2px 8px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); user-select: all; }
.booked-form { margin-top: 8px; align-items: flex-end; }

.account { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--border); }
.account summary { cursor: pointer; }

/* Handy: Zeitleiste einzeilig, Fenster nur mit Datum */
@media (max-width: 600px) {
  .seg { padding: 3px 4px; text-align: center; font-size: 11.5px; }
  .seg .name { display: none; }
  .summary .long { display: none; }
  .summary .short { display: inline; }
}
</style>
