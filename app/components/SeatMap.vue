<script setup lang="ts">
import { fitsSeat, occupancy, rowTables, seatLabel, type Carpet, type SeatHolder } from '#shared/utils/seating'

/** ownContactId: die Person ist selbst Kontaktperson und erscheint in ihrer eigenen Farbe */
export interface MapPerson { id: number, nick: string, seat: string | null, double: boolean, contactId: number | null, avatar?: string | null, ownContactId?: number | null, booked?: boolean }
export interface MapRow { id: number, letter: string, start: number, carpet: Carpet }
export interface MapContact { id: number, nick: string, color: string }

const props = withDefaults(defineProps<{
  rows: MapRow[]
  people: MapPerson[]
  contacts: MapContact[]
  /** Darf der Betrachter diese Person ziehen? (geprüft wird trotzdem auf dem Server) */
  movable?: (p: MapPerson) => boolean
  /** eigene Registrierung, wird hervorgehoben */
  mine?: number | null
  /** Leute ohne Platz, die der Betrachter setzen darf */
  pool?: MapPerson[]
  /** Plätze, die gerade jemandem von der Warteliste angeboten sind (reserviert) */
  held?: string[]
  /** gemeldeter Bereich (Sitz-IDs), gestrichelt umrandet */
  area?: string[] | null
  /** Bereich fixiert und der Betrachter ist nicht Orga: außerhalb abgeblendet, nur dort Hinweise */
  limitToArea?: boolean
  /** Orga markiert gerade den Bereich: Klick auf einen Platz schaltet ihn um */
  marking?: boolean
  busy?: boolean
}>(), { movable: () => false, mine: null, pool: () => [], held: () => [], area: null, limitToArea: false, marking: false, busy: false })

const emit = defineEmits<{ move: [id: number, seat: string | null], select: [id: number | null], mark: [seat: string, range: boolean] }>()

const selected = ref<number | null>(null)
const dragging = ref<number | null>(null)
const active = computed(() => dragging.value ?? selected.value)

const heldSet = computed(() => new Set(props.held))
const areaSet = computed(() => new Set(props.area ?? []))
/** im Bereich: der Platz, bei doppelt breiten der ganze Tisch */
const inArea = (seat: string) => areaSet.value.has(seat)
// reservierte Plätze zählen beim Prüfen wie belegt
const holders = computed<SeatHolder[]>(() => [
  ...props.people.map(p => ({ ...p, discordId: null })),
  ...props.held.map((seat, i) => ({ id: -1 - i, seat, double: false, discordId: null, contactId: null })),
])
const occ = computed(() => occupancy(holders.value, props.rows))
const byId = computed(() => new Map(props.people.map(p => [p.id, p])))
const contactById = computed(() => new Map(props.contacts.map(c => [c.id, c])))

function personAt(seat: string) {
  const id = occ.value.get(seat)
  return id === undefined ? null : byId.value.get(id) ?? null
}

/** Farbe der Kontaktperson; Kontaktpersonen selbst in ihrer eigenen Farbe (sonst hätten sie die ihrer eigenen Kontaktperson) */
function color(p: MapPerson) {
  const id = p.ownContactId ?? p.contactId
  return (id && contactById.value.get(id)?.color) || '#8a8f87'
}

/** belegter Platz in der Farbe der Kontaktperson */
function seatStyle(seat: string) {
  const p = personAt(seat)
  return p ? { '--c': color(p) } : undefined
}

function initials(nick: string) {
  const parts = nick.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  const s = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? '?').slice(0, 2)
  return s.toUpperCase()
}

/** Hinweis für den gerade gewählten/gezogenen: passt er hierhin oder wäre es ein Tausch? */
function hint(seat: string) {
  const id = active.value
  if (id === null) return ''
  const me = byId.value.get(id)
  if (!me) return ''
  const other = personAt(seat)
  if (other?.id === me.id) return 'self'
  if (props.limitToArea && !inArea(seat)) return 'no'
  if (fitsSeat(props.rows, holders.value, me, seat).ok) return 'free'
  if (other && me.seat && other.double === me.double && props.movable(other)) return 'swap'
  return 'no'
}

// ── Tooltip: Maus drüber oder antippen ──
const tip = ref<{ person: MapPerson, x: number, y: number } | null>(null)
const root = ref<HTMLElement | null>(null)
function showTip(e: Event, p: MapPerson) {
  const el = e.currentTarget as HTMLElement
  const box = root.value?.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  if (!box) return
  tip.value = { person: p, x: r.left - box.left + r.width / 2, y: r.top - box.top }
}
function hideTip() {
  tip.value = null
}
function tipText(p: MapPerson) {
  const c = p.contactId ? contactById.value.get(p.contactId)?.nick : null
  const contact = p.ownContactId ? 'ist Kontaktperson' : c ?? 'keine Kontaktperson'
  return { nick: p.nick, seat: (p.seat ? (p.double ? `${p.seat} (doppelt)` : p.seat) : 'ohne Platz') + (p.booked ? ' · gebucht' : ''), contact }
}

function pick(e: Event, p: MapPerson) {
  if (props.busy) return
  if (props.marking) {
    if (p.seat) emit('mark', p.seat, (e as MouseEvent).shiftKey)
    return
  }
  // jemand anderes ist gewählt: auf dessen Platz = Tausch versuchen
  if (selected.value !== null && selected.value !== p.id && p.seat) {
    drop(p.seat)
    return
  }
  // antippen zeigt immer, wer das ist (ein Tipp daneben schließt es wieder)
  showTip(e, p)
  if (!props.movable(p)) return
  selected.value = selected.value === p.id ? null : p.id
  emit('select', selected.value)
}

function drop(seat: string | null) {
  const id = active.value
  dragging.value = null
  selected.value = null
  hideTip()
  emit('select', null)
  if (id === null) return
  const p = byId.value.get(id)
  if (!p || p.seat === seat) return
  emit('move', id, seat)
}

function onDragStart(e: DragEvent, p: MapPerson) {
  if (!props.movable(p) || props.busy) {
    e.preventDefault()
    return
  }
  hideTip()
  dragging.value = p.id
  e.dataTransfer?.setData('text/plain', String(p.id))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(e: DragEvent) {
  if (dragging.value !== null) e.preventDefault()
}

function clickSeat(seat: string, e?: MouseEvent) {
  if (props.marking) {
    emit('mark', seat, !!e?.shiftKey)
    return
  }
  if (selected.value !== null) drop(seat)
  else hideTip()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    hideTip()
    if (selected.value !== null) {
      selected.value = null
      emit('select', null)
    }
  }
}
/** Tipp oder Klick irgendwo anders schließt den Tooltip */
function onPointerDownAnywhere(e: PointerEvent) {
  if (tip.value && !(e.target as HTMLElement | null)?.closest?.('.avatar')) hideTip()
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('pointerdown', onPointerDownAnywhere)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointerdown', onPointerDownAnywhere)
})

// ── Abstände wie in der Halle, in Metern (ein Platz ist SEAT_M breit) ──
/** Breite eines Platzes in Metern (Tisch 1,2 m für zwei); daraus der Maßstab der Abstände */
const SEAT_M = 0.9
/** ohne Teppich: so viel Platz auf dieser Seite der Reihe; mit Teppich: erst Abstand, dann der Teppich */
const AISLE_M = 0.7
const CARPET_GAP_M = 1
const CARPET_M = 2
const front = (r: MapRow) => r.carpet === 'front' || r.carpet === 'both'
const back = (r: MapRow) => r.carpet === 'back' || r.carpet === 'both'
/** Abstand zur vorigen Reihe in Metern: je Seite ohne Teppich 1,5 m (mit Teppich steckt der Abstand im Teppichblock) */
function gapBefore(i: number) {
  const prev = props.rows[i - 1], cur = props.rows[i]
  return prev && cur ? (back(prev) ? 0 : AISLE_M) + (front(cur) ? 0 : AISLE_M) : 0
}

/** je Reihe zwei Zeilen à 20 Plätze ab der Startnummer, Tische links nach rechts aufsteigend */
const tables = computed(() => props.rows.map((row) => {
  const toTable = (t: { left: number, right: number }) => {
    const left = seatLabel(row.letter, t.left)
    const right = seatLabel(row.letter, t.right)
    const leftPerson = personAt(left)
    return { left, right, leftNo: t.left, rightNo: t.right, wide: !!leftPerson?.double && leftPerson.seat === left }
  }
  return { row, lines: rowTables(row).map(line => line.map(toTable)) }
}))

// ── Zoom: stufenlos mit +/−, Strg+Mausrad oder zwei Fingern; verschoben wird durch normales Scrollen ──
const MIN = 30
const MAX = 96
const seatPx = ref(52)
const clamp = (v: number) => Math.round(Math.min(MAX, Math.max(MIN, v)))
onMounted(() => {
  try {
    const s = Number(localStorage.getItem('lan-planner-seat-px'))
    if (s >= MIN && s <= MAX) seatPx.value = s
    // Handy: erst einmal so, dass eine Zeile (10 Tische) ungefähr in die Breite passt
    else if (window.innerWidth < 700) seatPx.value = clamp((window.innerWidth - 120) / 22)
  }
  catch { /* nur Komfort */ }
})
watch(seatPx, (s) => {
  try {
    localStorage.setItem('lan-planner-seat-px', String(s))
  }
  catch { /* nur Komfort */ }
})
const zoom = (f: number) => (seatPx.value = clamp(seatPx.value * f))

const pointers = new Map<number, { x: number, y: number }>()
let pinch: { dist: number, size: number } | null = null
const dist = () => {
  const [a, b] = [...pointers.values()]
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}
function onPointerDown(e: PointerEvent) {
  if (e.pointerType !== 'touch') return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2) pinch = { dist: dist(), size: seatPx.value }
}
function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pinch && pointers.size === 2 && pinch.dist > 0) seatPx.value = clamp(pinch.size * dist() / pinch.dist)
}
function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinch = null
}
function onWheel(e: WheelEvent) {
  if (!e.ctrlKey) return
  e.preventDefault()
  zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1)
}

defineExpose({ clearSelection: () => (selected.value = null) })
</script>

<template>
  <div ref="root" class="seatmap" :class="{ busy }" :style="{ '--seat': seatPx + 'px', '--m': seatPx / SEAT_M + 'px', '--carpet': CARPET_M, '--carpet-gap': CARPET_GAP_M }">
    <div class="sm-tools row">
      <span class="sm-size">
        <button class="btn small" aria-label="Kleiner" :disabled="seatPx <= MIN" @click="zoom(1 / 1.2)">−</button>
        <button class="btn small" aria-label="Größer" :disabled="seatPx >= MAX" @click="zoom(1.2)">+</button>
      </span>
    </div>
    <p v-if="selected !== null" class="notice small sm-picked">
      <strong>{{ byId.get(selected)?.nick }}</strong> gewählt – jetzt auf einen Platz tippen
      <template v-if="pool.length || byId.get(selected)?.seat">, oder unten auf „Ohne Platz“</template>.
      <button class="btn small" @click="selected = null; emit('select', null)">Abbrechen</button>
    </p>

    <p v-if="!rows.length" class="muted">Noch keine Reihen angelegt.</p>

    <div
      class="sm-scroll"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
      @scroll.passive="hideTip"
    >
      <template v-for="({ row, lines }, i) in tables" :key="row.id">
      <div v-if="i > 0" class="sm-gap" :style="{ height: `calc(var(--m) * ${gapBefore(i)})` }" aria-hidden="true" />
      <div class="sm-row">
        <div v-if="front(row)" class="carpet front">Teppich</div>
        <div class="sm-line">
          <div class="sm-label">{{ row.letter }}</div>
          <div class="sm-lines">
            <div v-for="(list, li) in lines" :key="li" class="sm-tables">
              <div v-for="t in list" :key="t.left" class="sm-table">
                <template v-for="side in (t.wide ? ['wide'] : ['left', 'right'])" :key="side">
                  <template v-for="seatId in [side === 'right' ? t.right : t.left]" :key="seatId">
                    <div
                      class="seat"
                      :class="[side, hint(seatId), {
                        taken: !!personAt(seatId), held: heldSet.has(seatId), mine: personAt(seatId)?.id === mine,
                        open: !personAt(seatId) && !heldSet.has(seatId) && (!limitToArea || inArea(seatId)),
                        'in-area': inArea(seatId), outside: limitToArea && !inArea(seatId), marking,
                      }]"
                      :data-seat="seatId"
                      :style="seatStyle(seatId)"
                      :title="heldSet.has(seatId) ? `${seatId}: gerade jemandem von der Warteliste angeboten` : undefined"
                      @dragover="onDragOver"
                      @drop.prevent="drop(seatId)"
                      @click="clickSeat(seatId, $event)"
                    >
                      <span class="no">{{ side === 'wide' ? `${t.leftNo}+${t.rightNo}` : side === 'right' ? t.rightNo : t.leftNo }}</span>
                      <template v-for="p in [personAt(seatId)]" :key="p?.id ?? 'frei'">
                        <span
                          v-if="p"
                          class="avatar"
                          :class="{ mine: p.id === mine, movable: movable(p), selected: p.id === selected }"
                          :style="{ '--c': color(p) }"
                          :aria-label="`${p.nick}, ${p.seat}`"
                          role="button"
                          tabindex="0"
                          :draggable="movable(p) && !busy"
                          @dragstart="onDragStart($event, p)"
                          @dragend="dragging = null"
                          @click.stop="pick($event, p)"
                          @keydown.enter.prevent="pick($event, p)"
                          @mouseenter="showTip($event, p)"
                          @mouseleave="hideTip"
                        >
                          <img v-if="p.avatar" :src="p.avatar" alt="" loading="lazy" draggable="false">
                          <span class="ini" :class="{ over: p.avatar }">{{ initials(p.nick) }}</span>
                        </span>
                        <span v-else-if="heldSet.has(seatId)" class="held-mark" aria-hidden="true">⏳</span>
                      </template>
                      <span v-if="personAt(seatId)?.id === mine" class="you">Du</span>
                    </div>
                  </template>
                </template>
              </div>
            </div>
          </div>
          <div class="sm-label">{{ row.letter }}</div>
        </div>
        <div v-if="back(row)" class="carpet back">Teppich</div>
      </div>
      </template>
    </div>

    <div v-if="tip" class="tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }" role="tooltip">
      <strong>{{ tipText(tip.person).nick }}</strong>
      <span>Platz {{ tipText(tip.person).seat }}</span>
      <span><span class="swatch" :style="{ background: color(tip.person) }" />{{ tipText(tip.person).contact }}</span>
    </div>

    <div
      v-if="pool.length || active !== null"
      class="pool"
      :class="{ target: active !== null && byId.get(active)?.seat }"
      @dragover="onDragOver"
      @drop.prevent="drop(null)"
      @click="selected !== null && byId.get(selected)?.seat ? drop(null) : undefined"
    >
      <strong>Ohne Platz</strong>
      <span v-if="!pool.length" class="muted small">Hierher ziehen, um einen Platz freizugeben.</span>
      <span
        v-for="p in pool"
        :key="p.id"
        class="chip"
        :class="{ mine: p.id === mine, movable: movable(p), selected: p.id === selected }"
        :style="{ '--c': color(p) }"
        :draggable="movable(p) && !busy"
        @dragstart="onDragStart($event, p)"
        @dragend="dragging = null"
        @click.stop="pick($event, p)"
      >
        <span class="avatar small-av" :style="{ '--c': color(p) }">
          <img v-if="p.avatar" :src="p.avatar" alt="" loading="lazy" draggable="false">
          <span class="ini" :class="{ over: p.avatar }">{{ initials(p.nick) }}</span>
        </span>
        {{ p.nick }}{{ p.double ? ' (2)' : '' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.seatmap { --gap: 6px; position: relative; }
.seatmap.busy { opacity: .7; pointer-events: none; }
.sm-tools { justify-content: space-between; margin-bottom: 10px; min-height: 34px; }
.sm-size { display: inline-flex; gap: 4px; align-items: center; margin-left: auto; }
.sm-size .btn { min-width: 34px; font-size: 16px; }
.sm-picked { margin: 0 0 10px; }
.sm-scroll { overflow: auto; padding-bottom: 6px; touch-action: pan-x pan-y; -webkit-overflow-scrolling: touch; }
.sm-row { margin: 0 auto; width: max-content; }
.sm-gap { flex: none; }
.sm-line { display: flex; align-items: stretch; gap: 8px; }
.sm-label { display: grid; place-items: center; width: 26px; font-weight: 700; color: var(--muted); }
.sm-lines { display: flex; flex-direction: column; gap: 3px; }
.sm-tables { display: flex; gap: var(--gap); }
.sm-table { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--border); }
.carpet {
  height: calc(var(--m) * var(--carpet)); margin: 0 34px; padding: 2px 10px; box-sizing: border-box; display: grid; place-items: center;
  font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
  border-radius: 4px; background: repeating-linear-gradient(45deg, color-mix(in srgb, #b5543c 22%, var(--card)) 0 6px, color-mix(in srgb, #b5543c 12%, var(--card)) 6px 12px);
}
/* zwischen Reihe und Teppich der Abstand (--carpet-gap Meter, aus dem Skript) */
.carpet.front { margin-bottom: calc(var(--m) * var(--carpet-gap)); }
.carpet.back { margin-top: calc(var(--m) * var(--carpet-gap)); }
.seat {
  position: relative; width: var(--seat); height: var(--seat); border-radius: 6px; background: var(--card);
  display: grid; place-items: center; cursor: default;
}
/* freie Plätze klar erkennbar: grüner Rand und leichter Ton */
.seat.open { background: color-mix(in srgb, var(--accent) 10%, var(--card)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent); }
/* gemeldeter Bereich: gestrichelter Rahmen; bei fixiertem Bereich alles außerhalb abgeblendet */
.seat.in-area:not(.mine):not(.free):not(.swap) { outline: 2px dashed #2e86ab; outline-offset: 1px; }
.seat.outside { opacity: .35; background: var(--card); box-shadow: none; }
.seat.marking { cursor: crosshair; user-select: none; }
.seat.held { background: repeating-linear-gradient(45deg, color-mix(in srgb, #d39b1d 18%, var(--card)) 0 5px, var(--card) 5px 10px); }
/* belegt: der ganze Platz in der Farbe der Kontaktperson */
.seat.taken { background: color-mix(in srgb, var(--c) 60%, var(--card)); }
.seat.taken .no { color: #fff; text-shadow: 0 1px 2px rgb(0 0 0 / .45); }
/* eigener Platz: dicker Rahmen in Textfarbe */
.seat.mine { outline: 3px solid var(--text); outline-offset: 1px; z-index: 1; }
.seat.wide { width: calc(var(--seat) * 2 + 2px); }
.seat .no { position: absolute; top: 1px; left: 4px; font-size: max(9px, calc(var(--seat) * .19)); color: var(--muted); font-variant-numeric: tabular-nums; pointer-events: none; }
.seat.free { outline: 2px dashed var(--accent); outline-offset: -2px; cursor: pointer; }
.seat.swap { outline: 2px dashed #d39b1d; outline-offset: -2px; cursor: pointer; }
.held-mark { font-size: calc(var(--seat) * .35); opacity: .7; }
.avatar {
  --size: calc(var(--seat) * .7);
  position: relative;
  width: var(--size); height: var(--size); border-radius: 50%; display: grid; place-items: center; overflow: hidden;
  border: max(2px, calc(var(--seat) * .06)) solid rgb(255 255 255 / .9); background: var(--c); color: #fff; user-select: none;
  box-shadow: 0 1px 3px rgb(0 0 0 / .3);
  box-sizing: border-box; margin-top: calc(var(--seat) * .1);
}
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
.avatar .ini { font-size: calc(var(--size) * .38); font-weight: 700; letter-spacing: .02em; text-shadow: 0 1px 1px rgb(0 0 0 / .35); }
/* über dem Avatar: die Initialen ganz schwach (halb durchsichtig), zum Zuordnen ohne Tooltip */
.avatar .ini.over { position: absolute; inset: 0; display: grid; place-items: center; opacity: .5; pointer-events: none; }
.avatar.movable { cursor: grab; }
.avatar.selected { outline: 3px solid var(--accent); outline-offset: 2px; }
.you {
  position: absolute; bottom: 1px; right: 3px; font-size: max(9px, calc(var(--seat) * .18)); font-weight: 700; line-height: 1;
  padding: 1px 3px; border-radius: 3px; background: var(--text); color: var(--card); pointer-events: none;
}
.tip {
  position: absolute; z-index: 20; transform: translate(-50%, calc(-100% - 8px)); pointer-events: none;
  display: grid; gap: 2px; padding: 6px 10px; border-radius: 8px; font-size: 13px; white-space: nowrap;
  background: var(--text); color: var(--card); box-shadow: 0 4px 14px rgb(0 0 0 / .25);
}
.tip .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; max-width: 200px; padding: 3px 8px 3px 3px; font-size: 13px; border-radius: 999px;
  background: color-mix(in srgb, var(--c) 22%, var(--card)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; user-select: none;
}
.chip.movable { cursor: grab; }
.chip.mine { box-shadow: 0 0 0 2px var(--text); font-weight: 700; }
.chip.selected { box-shadow: 0 0 0 3px var(--accent); }
.small-av { --size: 24px; margin: 0; border-width: 2px; flex: none; }
.pool {
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 4px; padding: 10px; border-radius: 10px;
  border: 2px dashed var(--border);
}
.pool.target { border-color: var(--accent); cursor: pointer; }
</style>
