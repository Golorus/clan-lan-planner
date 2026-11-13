<script setup lang="ts">
import { renderSVG } from 'uqr'

/**
 * Orga: QR-Etiketten für Kisten/Taschen und Artikel drucken (Ziel: /packen/k/<id> bzw. /packen/a/<id>).
 * Links auswählen und das Format einstellen (Etikettenbogen A4 oder Rolle), rechts die Vorschau so, wie gedruckt wird.
 * Die Einstellungen merkt sich der Browser.
 */
definePageMeta({ middleware: 'leader' })
useHead({ title: 'QR-Etiketten · Inventar · Orga' })
const { data, error, load, box } = usePacken()
await load()
const origin = useRequestURL().origin

interface Settings {
  preset: string
  /** A4-Bogen: Spalten, Zeilen, Ränder und Abstände in mm; Rolle: Breite und Länge eines Etiketts in mm */
  cols: number, rows: number, top: number, left: number, gapX: number, gapY: number
  rollW: number, rollH: number
  /** erstes Etikett auf dem Bogen (angefangene Bögen weiter benutzen) */
  skip: number
  showSub: boolean
  frame: boolean
  perPiece: boolean
}
const PRESETS: Record<string, { label: string, roll?: boolean, set: Partial<Settings> }> = {
  'a4-3x8': { label: 'A4-Bogen 3 × 8 (70 × 37 mm)', set: { cols: 3, rows: 8, top: 0, left: 0, gapX: 0, gapY: 0 } },
  'a4-3x7': { label: 'A4-Bogen 3 × 7 (63,5 × 38,1 mm)', set: { cols: 3, rows: 7, top: 15.1, left: 7.2, gapX: 2.5, gapY: 0 } },
  'a4-2x4': { label: 'A4-Bogen 2 × 4 (105 × 74 mm), groß für Kisten', set: { cols: 2, rows: 4, top: 0, left: 0, gapX: 0, gapY: 0 } },
  'a4-frei': { label: 'A4, eigene Aufteilung (Papier zum Schneiden)', set: {} },
  'rolle-62': { label: 'Rolle 62 mm (z. B. Brother QL)', roll: true, set: { rollW: 62, rollH: 30 } },
  'rolle-frei': { label: 'Rolle, eigene Größe', roll: true, set: {} },
}
const DEFAULTS: Settings = { preset: 'a4-3x8', cols: 3, rows: 8, top: 0, left: 0, gapX: 0, gapY: 0, rollW: 62, rollH: 30, skip: 0, showSub: true, frame: true, perPiece: false }
const SETTINGS_KEY = 'planner-etiketten'
const s = reactive<Settings>({ ...DEFAULTS })
/** was gedruckt wird: Schlüssel „k<id>“ / „a<id>“; leer vor der ersten Auswahl = alle */
const picked = ref<Set<string>>(new Set())
const ready = ref(false)

const allKeys = computed(() => [...(data.value?.containers ?? []).map(c => 'k' + c.id), ...(data.value?.articles ?? []).map(a => 'a' + a.id)])
onMounted(() => {
  try { Object.assign(s, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) }
  catch { /* Vorgaben */ }
  if (!PRESETS[s.preset]) s.preset = DEFAULTS.preset
  picked.value = new Set(allKeys.value)
  ready.value = true
})
watch(s, () => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) }
  catch { /* nur Komfort */ }
})
function applyPreset() { Object.assign(s, PRESETS[s.preset]?.set ?? {}, { skip: 0 }) }

const roll = computed(() => !!PRESETS[s.preset]?.roll)
const custom = computed(() => s.preset.endsWith('-frei'))
const num = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(+v) ? +v : min))
const cols = computed(() => Math.round(num(s.cols, 1, 10)))
const rows = computed(() => Math.round(num(s.rows, 1, 30)))
/** Größe eines Etiketts in mm */
const cell = computed(() => roll.value
  ? { w: num(s.rollW, 15, 150), h: num(s.rollH, 10, 200) }
  : { w: (210 - 2 * num(s.left, 0, 50) - (cols.value - 1) * num(s.gapX, 0, 20)) / cols.value, h: (297 - 2 * num(s.top, 0, 50) - (rows.value - 1) * num(s.gapY, 0, 20)) / rows.value })
const perPage = computed(() => roll.value ? 1 : cols.value * rows.value)

const qr = (path: string) => renderSVG(origin + path, { border: 1, ecc: 'M' })
interface Label { key: string, big: string, small: string, svg: string }
const labels = computed<Label[]>(() => {
  const out: Label[] = []
  for (const c of data.value?.containers ?? []) {
    if (picked.value.has('k' + c.id)) out.push({ key: 'k' + c.id, big: c.name || '(ohne Namen)', small: c.kind, svg: qr('/packen/k/' + c.id) })
  }
  for (const a of data.value?.articles ?? []) {
    if (!picked.value.has('a' + a.id)) continue
    const l = { key: 'a' + a.id, big: a.name, small: box(a.container) ? '→ ' + (box(a.container)!.name || '(ohne Namen)') : '', svg: qr('/packen/a/' + a.id) }
    for (let i = 0; i < (s.perPiece ? Math.min(a.count, 200) : 1); i++) out.push({ ...l, key: l.key + '-' + i })
  }
  return out
})
/** die Etiketten auf Seiten verteilt; auf dem ersten Bogen bleiben die schon verbrauchten Plätze leer */
const pages = computed(() => {
  const skip = roll.value ? 0 : Math.round(num(s.skip, 0, perPage.value - 1))
  const slots: (Label | null)[] = [...Array.from({ length: skip }, () => null), ...labels.value]
  const out: (Label | null)[][] = []
  for (let i = 0; i < slots.length; i += perPage.value) out.push(slots.slice(i, i + perPage.value))
  return out
})
const mm = (v: number) => v.toFixed(2) + 'mm'
const sheetStyle = computed(() => roll.value
  ? { width: mm(cell.value.w), height: mm(cell.value.h) }
  : { width: '210mm', height: '297mm', padding: `${mm(num(s.top, 0, 50))} ${mm(num(s.left, 0, 50))}`, gridTemplateColumns: `repeat(${cols.value}, ${mm(cell.value.w)})`, gridAutoRows: mm(cell.value.h), gap: `${mm(num(s.gapY, 0, 20))} ${mm(num(s.gapX, 0, 20))}` })
/** QR so groß wie die kürzere Seite hergibt, Schrift passend zur Etikettenhöhe */
const labelStyle = computed(() => {
  const pad = Math.min(3, cell.value.h * 0.08)
  const side = Math.min(cell.value.h - 2 * pad, cell.value.w * 0.45)
  return { 'padding': mm(pad), 'gap': mm(pad), 'gridTemplateColumns': `${mm(side)} minmax(0, 1fr)`, '--fs': mm(Math.max(2.4, Math.min(7, cell.value.h * 0.115))) }
})
// die Seitengröße für den Druck: A4 ohne Rand bzw. genau ein Etikett der Rolle
useHead({ style: [{ key: 'etiketten-page', innerHTML: () => `@media print { @page { size: ${roll.value ? `${mm(cell.value.w)} ${mm(cell.value.h)}` : 'A4'}; margin: 0; } }` }] })

function toggle(key: string, on: boolean) {
  const next = new Set(picked.value)
  if (on) next.add(key)
  else next.delete(key)
  picked.value = next
}
function pick(which: 'all' | 'none' | 'boxes' | 'articles') {
  picked.value = new Set(which === 'none' ? [] : allKeys.value.filter(k => which === 'all' || (which === 'boxes') === k.startsWith('k')))
}
const print = () => window.print()
</script>

<template>
  <div class="wrap wide orga">
    <div class="no-print">
      <OrgaNav title="QR-Etiketten" />
      <InventarNav />
      <p v-if="error" class="notice err">{{ error }}</p>
    </div>
    <ClientOnly>
      <div class="layout">
        <aside class="side no-print">
          <section class="card">
            <h2>1 · Was</h2>
            <div class="quick">
              <button class="btn small" @click="pick('all')">alle</button>
              <button class="btn small" @click="pick('boxes')">nur Kisten</button>
              <button class="btn small" @click="pick('articles')">nur Artikel</button>
              <button class="btn small" @click="pick('none')">keine</button>
            </div>
            <div class="picklist">
              <b class="small">Kisten &amp; Taschen</b>
              <label v-for="c in data?.containers ?? []" :key="c.id"><input type="checkbox" :checked="picked.has('k' + c.id)" @change="toggle('k' + c.id, ($event.target as HTMLInputElement).checked)"> {{ c.name || '(ohne Namen)' }}</label>
              <span v-if="!data?.containers.length" class="muted small">Noch keine angelegt (Inventar).</span>
              <b class="small">Artikel</b>
              <label v-for="a in data?.articles ?? []" :key="a.id"><input type="checkbox" :checked="picked.has('a' + a.id)" @change="toggle('a' + a.id, ($event.target as HTMLInputElement).checked)"> {{ a.name }} <span class="muted small">× {{ a.count }}</span></label>
            </div>
            <label class="check"><input v-model="s.perPiece" type="checkbox"> ein Etikett je Teil (sonst eins je Artikel, fürs Bündel)</label>
          </section>
          <section class="card">
            <h2>2 · Format</h2>
            <label class="f">Vorlage
              <select v-model="s.preset" @change="applyPreset">
                <option v-for="(p, k) in PRESETS" :key="k" :value="k">{{ p.label }}</option>
              </select>
            </label>
            <div v-if="roll" class="grid2">
              <label class="f">Breite (mm)<input v-model.number="s.rollW" type="number" min="15" max="150" :disabled="!custom"></label>
              <label class="f">Länge je Etikett (mm)<input v-model.number="s.rollH" type="number" min="10" max="200"></label>
            </div>
            <template v-else>
              <div class="grid2">
                <label class="f">Spalten<input v-model.number="s.cols" type="number" min="1" max="10" :disabled="!custom"></label>
                <label class="f">Zeilen<input v-model.number="s.rows" type="number" min="1" max="30" :disabled="!custom"></label>
                <label class="f">Rand oben/unten (mm)<input v-model.number="s.top" type="number" min="0" max="50" step="0.1"></label>
                <label class="f">Rand links/rechts (mm)<input v-model.number="s.left" type="number" min="0" max="50" step="0.1"></label>
                <label class="f">Abstand waagerecht (mm)<input v-model.number="s.gapX" type="number" min="0" max="20" step="0.1"></label>
                <label class="f">Abstand senkrecht (mm)<input v-model.number="s.gapY" type="number" min="0" max="20" step="0.1"></label>
              </div>
              <label class="f">Schon verbrauchte Etiketten auf dem ersten Bogen<input v-model.number="s.skip" type="number" min="0" :max="perPage - 1"></label>
            </template>
            <label class="check"><input v-model="s.showSub" type="checkbox"> zweite Zeile (Art bzw. Zielkiste)</label>
            <label class="check"><input v-model="s.frame" type="checkbox"> Rahmen drucken (Schnittlinie)</label>
            <p class="muted small">Etikett {{ cell.w.toFixed(1) }} × {{ cell.h.toFixed(1) }} mm. Im Druckdialog „Ränder: keine“ und Skalierung 100 % wählen.</p>
          </section>
          <section class="card">
            <h2>3 · Drucken</h2>
            <button class="btn primary big" :disabled="!labels.length" @click="print">{{ labels.length }} {{ labels.length === 1 ? 'Etikett' : 'Etiketten' }} drucken</button>
            <p class="muted small">{{ roll ? 'Ein Etikett je Abschnitt.' : `${pages.length} ${pages.length === 1 ? 'Bogen' : 'Bögen'}.` }} Der Code enthält nur die feste Kennung: umbenennen oder umräumen geht ohne neues Etikett.</p>
          </section>
        </aside>
        <div class="preview" :class="{ roll, frame: s.frame }">
          <p v-if="ready && !labels.length" class="muted no-print">Nichts ausgewählt.</p>
          <div v-for="(page, i) in pages" :key="i" class="sheet" :style="sheetStyle">
            <template v-for="(l, j) in page" :key="l ? l.key : 'leer' + j">
              <div v-if="l" class="label" :style="labelStyle">
                <!-- eslint-disable-next-line vue/no-v-html -- SVG aus uqr, nur aus unserer eigenen URL -->
                <div class="qr" v-html="l.svg" />
                <div class="txt"><b>{{ l.big }}</b><span v-if="s.showSub && l.small">{{ l.small }}</span></div>
              </div>
              <div v-else class="label empty" />
            </template>
          </div>
        </div>
      </div>
    </ClientOnly>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); } }
.side { display: grid; gap: 12px; }
.side h2 { margin: 0 0 8px; font-size: 16px; }
.quick { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.picklist { display: flex; flex-direction: column; gap: 4px; max-height: 280px; overflow: auto; padding: 8px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; }
.picklist b { margin-top: 4px; }
.f { display: flex; flex-direction: column; gap: 3px; font-size: 13px; margin-bottom: 8px; }
.f input, .f select { width: 100%; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 10px; }
.check { display: flex; gap: 6px; align-items: baseline; font-size: 14px; margin: 4px 0; }
.big { width: 100%; min-height: 46px; font-size: 16px; }

/* Vorschau: die Bögen in echter Größe (mm), auf schmalen Bildschirmen seitlich verschiebbar */
.preview { overflow: auto; padding: 12px; background: color-mix(in srgb, var(--muted) 18%, var(--bg)); border-radius: 10px; display: flex; flex-direction: column; align-items: center; gap: 12px; min-height: 200px; }
.preview.roll { flex-direction: row; flex-wrap: wrap; align-items: flex-start; justify-content: flex-start; }
.sheet { flex: none; box-sizing: border-box; display: grid; align-content: start; background: #fff; color: #000; box-shadow: 0 1px 6px rgb(0 0 0 / 25%); overflow: hidden; }
.label { box-sizing: border-box; display: grid; align-items: center; overflow: hidden; outline: 1px dashed #bbb; outline-offset: -0.5px; }
.label.empty { outline-style: dotted; background: repeating-linear-gradient(45deg, #f3f3f3 0 6px, #fff 6px 12px); }
.qr :deep(svg) { width: 100%; height: auto; display: block; }
.txt { display: flex; flex-direction: column; gap: 0.5mm; min-width: 0; font-size: calc(var(--fs) * 0.72); line-height: 1.15; overflow-wrap: break-word; hyphens: auto; }
.txt b { font-size: var(--fs); }

@media print {
  .no-print { display: none !important; }
  .wrap { max-width: none !important; padding: 0 !important; margin: 0 !important; }
  .layout { display: block; }
  .preview { display: block; padding: 0; background: none; overflow: visible; }
  .sheet { box-shadow: none; break-after: page; break-inside: avoid; }
  .sheet:last-child { break-after: auto; }
  .label { outline: none; }
  .label.empty { background: none; }
  .frame .label:not(.empty) { outline: 0.2mm solid #999; outline-offset: -0.2mm; }
}
</style>

<style>
/* Kopf- und Fußzeile des Planners gehören nicht aufs Etikett */
@media print {
  body:has(.preview .sheet) header, body:has(.preview .sheet) footer { display: none !important; }
}
</style>
