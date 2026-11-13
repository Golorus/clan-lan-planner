<script setup lang="ts">
/**
 * Orga: Packliste auf Papier, falls beim Packen kein Netz da ist – je Kiste/Tasche eine Seite zum Reinlegen,
 * mit Feldern für eine Strichliste auf dem Hinweg und dem Rückweg.
 */
definePageMeta({ middleware: 'leader' })
useHead({ title: 'Packliste · Inventar · Orga' })
const { data, error, load, inBox } = usePacken()
await load()
const date = new Date().toLocaleDateString('de-DE')
const pages = computed(() => [
  ...(data.value?.containers ?? []).map(c => ({ id: c.id, name: c.name || '(ohne Namen)', list: inBox(c.id) })),
  { id: '', name: 'Ohne Kiste / Tasche', list: inBox('') },
].filter(p => p.list.length))
const print = () => window.print()
</script>

<template>
  <div class="wrap orga">
    <div class="no-print">
      <OrgaNav title="Packliste (Papier)" />
      <InventarNav />
      <p v-if="error" class="notice err">{{ error }}</p>
      <section class="card">
        <p class="muted small">Für den Fall ohne Netz: je Kiste / Tasche eine Seite zum Reinlegen. Je Teil ein Strich bei „Hinweg“ bzw. „Rückweg“, am Ende mit „Soll“ vergleichen.</p>
        <button class="btn primary" :disabled="!pages.length" @click="print">{{ pages.length }} {{ pages.length === 1 ? 'Seite' : 'Seiten' }} drucken</button>
      </section>
    </div>
    <div class="sheets">
      <div v-for="p in pages" :key="p.id" class="page">
        <h1>{{ p.name }}</h1>
        <p class="meta">Packliste · Stand {{ date }} · {{ p.list.length }} Artikel</p>
        <table>
          <colgroup><col class="c-what"><col class="c-n"><col class="c-tally"><col class="c-tally"></colgroup>
          <thead><tr><th>Artikel</th><th class="num">Soll</th><th>Hinweg (Striche)</th><th>Rückweg (Striche)</th></tr></thead>
          <tbody>
            <tr v-for="a in p.list" :key="a.id">
              <td>{{ a.name }}<div v-if="a.note" class="note">{{ a.note }}</div></td>
              <td class="num">{{ a.count }}</td><td /><td />
            </tr>
          </tbody>
        </table>
        <div class="sign"><span>Hinweg gepackt von / Datum</span><span>Rückweg gepackt von / Datum</span></div>
      </div>
      <p v-if="data && !pages.length" class="muted">Noch keine Artikel im Inventar.</p>
    </div>
  </div>
</template>

<style scoped>
.sheets { display: grid; gap: 16px; }
.page { background: #fff; color: #000; padding: 10mm; border: 1px solid var(--border); border-radius: 6px; }
.page h1 { font-size: 24px; margin: 0 0 2px; }
.meta { font-size: 11px; margin: 0 0 12px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
th, td { border: 1px solid #777; padding: 6px 8px; text-align: left; vertical-align: middle; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; background: #eee; }
td { height: 13mm; }
tr { break-inside: avoid; }
.c-what { width: 40%; }
.c-n { width: 10%; }
.c-tally { width: 25%; }
.num { text-align: center; font-size: 15px; font-weight: 700; }
th.num { font-size: 11px; }
.note { font-size: 11px; color: #444; }
.sign { display: grid; grid-template-columns: 1fr 1fr; gap: 0 10mm; margin-top: 10mm; font-size: 12px; }
.sign span { border-top: 1px solid #000; padding-top: 3px; }
@media print {
  .no-print { display: none !important; }
  .wrap { max-width: none !important; padding: 0 !important; margin: 0 !important; }
  .sheets { display: block; }
  .page { border: 0; border-radius: 0; padding: 0; break-after: page; }
  .page:last-child { break-after: auto; }
}
</style>

<style>
@media print {
  body:has(.sheets .page) header, body:has(.sheets .page) footer { display: none !important; }
}
</style>
