<script setup lang="ts">
import { CONTAINER_KINDS, newId, parseArticleLines, type Article, type Container, type Stock } from '../../../../shared/inventar'

/**
 * Orga: das Inventar pflegen – Artikel (Anzahl, nachgezählt, Kiste/Tasche, Artikelart eines Moduls, Notiz) und
 * Kisten/Taschen. Jede Änderung wird gleich gespeichert (der ganze Bestand mit der gelesenen Fassung; hat inzwischen
 * jemand anderes gespeichert, sagt die Seite das, statt dessen Änderung zu überschreiben).
 */
definePageMeta({ middleware: 'leader' })
useHead({ title: 'Inventar · Orga' })

const { data: loaded, refresh } = await useFetch<Stock & { rev: number }>('/api/orga/inventar', { key: 'orga-inventar' })
const stock = reactive<Stock>({ containers: [], articles: [] })
const rev = ref(0)
function take(s: (Stock & { rev: number }) | null | undefined) {
  stock.containers = (s?.containers ?? []).map(c => ({ ...c }))
  stock.articles = (s?.articles ?? []).map(a => ({ ...a }))
  rev.value = s?.rev ?? 0
}
take(loaded.value)

const error = ref('')
const conflict = ref(false)
const status = ref('')
let timer: ReturnType<typeof setTimeout> | null = null
let saving: Promise<void> | null = null
let again = false
async function send() {
  if (saving) { again = true; return }
  saving = (async () => {
    try {
      const res = await api<Stock & { rev: number }>('/api/orga/inventar', { method: 'PUT', body: { rev: rev.value, containers: stock.containers, articles: stock.articles } })
      rev.value = res.rev
      error.value = ''
      status.value = 'gespeichert'
    }
    catch (e) {
      error.value = apiError(e)
      conflict.value = (e as { statusCode?: number }).statusCode === 409
      status.value = ''
    }
  })()
  await saving
  saving = null
  if (again && !conflict.value) { again = false; await send() }
}
/** nach jeder Änderung: kurz sammeln, dann speichern */
function save() {
  if (conflict.value) return
  status.value = 'speichert …'
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void send() }, 400)
}
async function reload() {
  await refresh()
  take(loaded.value)
  conflict.value = false
  error.value = ''
}

const quellen = useInventarQuellen()
/** Wert des Auswahlfelds „gehört zu“: leer = allgemein, sonst „modul|schlüssel“ */
const kindOf = (a: Article) => a.source ? a.source + '|' + a.key : ''
function setKind(a: Article, v: string) {
  const i = v.indexOf('|')
  a.source = i < 0 ? '' : v.slice(0, i)
  a.key = i < 0 ? '' : v.slice(i + 1)
  save()
}
/** eine Zuordnung, die kein eingeschaltetes Modul (mehr) anmeldet, bleibt wählbar */
const unknownKind = (a: Article) => !!a.source && !quellen.some(q => q.modul === a.source && q.arten.some(k => k.key === a.key))

const byBox = ref(false)
const boxName = (id: string) => stock.containers.find(c => c.id === id)?.name || (stock.containers.some(c => c.id === id) ? '(ohne Namen)' : '')
const rows = computed(() => {
  if (!byBox.value) return stock.articles.map(a => ({ a, head: '' }))
  const list = [...stock.articles].sort((x, y) => Number(!x.container) - Number(!y.container) || boxName(x.container).localeCompare(boxName(y.container), 'de') || x.name.localeCompare(y.name, 'de'))
  return list.map((a, i) => ({ a, head: i === 0 || list[i - 1]!.container !== a.container ? (a.container ? boxName(a.container) : 'Ohne Kiste / Tasche') : '' }))
})
const sum = computed(() => ({
  articles: stock.articles.length,
  pieces: stock.articles.reduce((n, a) => n + a.count, 0),
  unchecked: stock.articles.filter(a => !a.checked).length,
  boxes: stock.containers.length,
  loose: stock.articles.filter(a => !a.container).length,
}))
const inBox = (id: string) => stock.articles.filter(a => a.container === id)

function addArticle() {
  stock.articles.push({ id: newId('a'), name: '', count: 1, checked: false, container: '', source: '', key: '', note: '' })
  save()
  nextTick(() => (document.querySelector('.articles tbody tr:last-child input') as HTMLInputElement | null)?.focus())
}
function removeArticle(a: Article) {
  if (a.name && !confirm(`„${a.name}“ entfernen? Ein aufgeklebter QR-Code führt danach ins Leere.`)) return
  stock.articles = stock.articles.filter(x => x !== a)
  save()
}
function setCount(a: Article, v: string) {
  const n = parseInt(v, 10)
  if (Number.isInteger(n) && n >= 0) { a.count = n; save() }
}
function addBox() {
  stock.containers.push({ id: newId('k'), name: '', kind: 'Kiste' })
  save()
  nextTick(() => (document.querySelector('.boxes tbody tr:last-child input') as HTMLInputElement | null)?.focus())
}
function removeBox(c: Container) {
  const n = inBox(c.id).length
  if (n && !confirm(`„${c.name || 'Kiste'}“ entfernen? ${n} Artikel stehen danach ohne Kiste / Tasche da, ein aufgeklebter QR-Code führt ins Leere.`)) return
  for (const a of inBox(c.id)) a.container = ''
  stock.containers = stock.containers.filter(x => x !== c)
  save()
}

const paste = ref('')
function addPasted() {
  const list = parseArticleLines(paste.value)
  if (!list.length) return
  for (const p of list) stock.articles.push({ id: newId('a'), name: p.name, count: p.count, checked: false, container: '', source: '', key: '', note: '' })
  paste.value = ''
  status.value = `${list.length} Artikel eingefügt`
  save()
}
function csv() {
  const q = (v: string) => /[;"\n]/.test(v) || /^[=+\-@]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
  const kind = (a: Article) => a.source ? (quellen.find(s => s.modul === a.source)?.arten.find(k => k.key === a.key)?.label ?? a.source + ': ' + a.key) : ''
  const lines = [['Artikel', 'Anzahl', 'Geprüft', 'Kiste / Tasche', 'Gehört zu', 'Notiz'], ...rows.value.map(({ a }) => [a.name, String(a.count), a.checked ? 'ja' : 'nein', boxName(a.container), kind(a), a.note])]
  const blob = new Blob(['﻿' + lines.map(r => r.map(q).join(';')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'inventar.csv' })
  link.click()
  URL.revokeObjectURL(link.href)
}
</script>

<template>
  <div class="wrap wide orga">
    <OrgaNav title="Inventar" />
    <InventarNav />
    <p v-if="error" class="notice err">
      {{ error }} <button v-if="conflict" class="btn small" @click="reload">Neu laden</button>
    </p>

    <section class="card">
      <div class="head">
        <div class="sums">
          <span><b>{{ sum.articles }}</b> Artikel</span><span><b>{{ sum.pieces }}</b> Teile</span><span><b>{{ sum.unchecked }}</b> ungeprüft</span>
          <span><b>{{ sum.boxes }}</b> Kisten / Taschen</span><span><b>{{ sum.loose }}</b> ohne Lagerort</span>
        </div>
        <div class="actions">
          <span class="muted small" aria-live="polite">{{ status }}</span>
          <label class="check"><input v-model="byBox" type="checkbox"> nach Kiste / Tasche</label>
          <button class="btn" @click="csv">Als CSV</button>
          <button class="btn primary" :disabled="conflict" @click="addArticle">Artikel hinzufügen</button>
        </div>
      </div>
      <p class="muted small">
        Was wir besitzen. „Geprüft“ heißt: die Anzahl ist nachgezählt. Liegt ein Artikel an zwei Orten, je Ort eine Zeile.
        <template v-if="quellen.length">„Gehört zu“ ordnet einen Artikel der Artikelart eines Moduls zu; das Modul rechnet ihn dann als vorhanden.</template>
      </p>
      <div class="tbl-wrap">
        <table class="tbl articles">
          <thead><tr><th>Artikel</th><th>Anzahl</th><th>Geprüft</th><th>Kiste / Tasche</th><th v-if="quellen.length">Gehört zu</th><th>Notiz</th><th /></tr></thead>
          <tbody>
            <template v-for="{ a, head } in rows" :key="a.id">
              <tr v-if="head" class="grp"><th :colspan="quellen.length ? 7 : 6">{{ head }}</th></tr>
              <tr :class="{ unsure: !a.checked }">
                <td><input v-model.lazy.trim="a.name" maxlength="200" :aria-label="'Name'" :disabled="conflict" @change="save"></td>
                <td><input class="n" type="number" min="0" step="1" :value="a.count" :aria-label="`${a.name}: Anzahl`" :disabled="conflict" @change="setCount(a, ($event.target as HTMLInputElement).value)"></td>
                <td><input v-model="a.checked" type="checkbox" :aria-label="`${a.name}: nachgezählt`" :disabled="conflict" @change="save"></td>
                <td>
                  <select v-model="a.container" :aria-label="`${a.name}: Kiste / Tasche`" :disabled="conflict" @change="save">
                    <option value="">–</option>
                    <option v-for="c in stock.containers" :key="c.id" :value="c.id">{{ c.name || '(ohne Namen)' }} · {{ c.kind }}</option>
                  </select>
                </td>
                <td v-if="quellen.length">
                  <select :value="kindOf(a)" :aria-label="`${a.name}: gehört zu`" :disabled="conflict" @change="setKind(a, ($event.target as HTMLSelectElement).value)">
                    <option value="">Allgemein</option>
                    <optgroup v-for="q in quellen" :key="q.modul" :label="q.label">
                      <option v-for="k in q.arten" :key="k.key" :value="q.modul + '|' + k.key">{{ k.label }}</option>
                    </optgroup>
                    <option v-if="unknownKind(a)" :value="kindOf(a)">{{ a.source }}: {{ a.key }}</option>
                  </select>
                </td>
                <td><input v-model.lazy.trim="a.note" maxlength="300" :aria-label="`${a.name}: Notiz`" :disabled="conflict" @change="save"></td>
                <td><button class="btn small danger" :disabled="conflict" :aria-label="`${a.name} entfernen`" @click="removeArticle(a)">Entfernen</button></td>
              </tr>
            </template>
            <tr v-if="!stock.articles.length"><td :colspan="quellen.length ? 7 : 6" class="muted">Noch keine Artikel.</td></tr>
          </tbody>
        </table>
      </div>
      <details class="paste">
        <summary>Liste einfügen</summary>
        <p class="muted small">Je Zeile ein Artikel: „Name; Anzahl“ oder „10 x Name“. Ohne Zahl zählt 1. Die Artikel kommen ungeprüft dazu.</p>
        <textarea v-model="paste" rows="6" placeholder="Patchkabel 20 m; 10&#10;4 x Fahnenstange" />
        <button class="btn" :disabled="!paste.trim() || conflict" @click="addPasted">Einfügen</button>
      </details>
    </section>

    <section class="card">
      <div class="head">
        <h2>Kisten &amp; Taschen</h2>
        <button class="btn" :disabled="conflict" @click="addBox">Kiste / Tasche hinzufügen</button>
      </div>
      <p class="muted small">Jede Kiste und Tasche hat eine feste Kennung für ihren QR-Code: umbenennen geht, ohne die Etiketten neu zu drucken.</p>
      <div class="tbl-wrap">
        <table class="tbl boxes">
          <thead><tr><th>Name</th><th>Art</th><th>Artikel</th><th>Teile</th><th /></tr></thead>
          <tbody>
            <tr v-for="c in stock.containers" :key="c.id">
              <td><input v-model.lazy.trim="c.name" maxlength="100" placeholder="z. B. Euro-Box 1" aria-label="Name der Kiste / Tasche" :disabled="conflict" @change="save"></td>
              <td><select v-model="c.kind" :aria-label="`${c.name}: Art`" :disabled="conflict" @change="save"><option v-for="k in CONTAINER_KINDS" :key="k" :value="k">{{ k }}</option></select></td>
              <td>{{ inBox(c.id).length }}</td>
              <td>{{ inBox(c.id).reduce((n, a) => n + a.count, 0) }}</td>
              <td><button class="btn small danger" :disabled="conflict" :aria-label="`${c.name} entfernen`" @click="removeBox(c)">Entfernen</button></td>
            </tr>
            <tr v-if="!stock.containers.length"><td colspan="5" class="muted">Noch keine Kisten oder Taschen.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.head h2 { margin: 0; }
.sums { display: flex; flex-wrap: wrap; gap: 4px 18px; }
.sums b { font-size: 20px; margin-right: 4px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.check { display: flex; gap: 6px; align-items: center; font-size: 14px; }
.tbl input:not([type=checkbox]), .tbl select { width: 100%; min-width: 7em; }
.tbl input.n { width: 5.5em; min-width: 0; text-align: right; }
.tbl tr.grp th { text-align: left; padding-top: 14px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
.tbl tr.unsure td:first-child input { border-color: var(--err); }
.paste { margin-top: 12px; }
.paste textarea { width: 100%; margin: 6px 0; font: inherit; }
</style>
