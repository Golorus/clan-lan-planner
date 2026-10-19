<script setup lang="ts">
const { appName } = useBranding()
useHead({ titleTemplate: t => t ? `${t} · ${appName}` : appName })
</script>

<template>
  <AppHeader />
  <NuxtPage />
  <AppFooter />
</template>

<style>
/* Farben: public/theme.css */
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 var(--font); }
a { color: var(--accent); }
.wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { margin: 0 0 20px; font-size: 24px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 16px; }
.muted { color: var(--muted); }
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--text); font: inherit; text-decoration: none; cursor: pointer; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.btn.discord { background: var(--discord); border-color: var(--discord); color: #fff; }
.btn:disabled { opacity: .6; cursor: default; }
.err { color: var(--err); }
.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.wrap.wide { max-width: 1440px; }
.wrap.orga { max-width: 1280px; }
.tbl .sub { display: block; font-size: 12.5px; color: var(--muted); }
.badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12.5px; border: 1px solid var(--border); color: var(--muted); white-space: nowrap; }
.badge.ok { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
.badge.bad { color: var(--err); border-color: color-mix(in srgb, var(--err) 45%, var(--border)); }
.ok-text { color: var(--accent); }
h2 { margin: 0 0 12px; font-size: 19px; }
label.field { display: grid; gap: 4px; font-size: 14px; }
label.field > span { color: var(--muted); }
input:not([type=checkbox]):not([type=color]):not([type=file]), select, textarea {
  font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; min-width: 0;
}
textarea { width: 100%; min-height: 110px; resize: vertical; }
input:focus-visible, select:focus-visible, textarea:focus-visible, .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.btn.small { padding: 4px 10px; font-size: 14px; }
.btn.danger { color: var(--err); border-color: color-mix(in srgb, var(--err) 45%, var(--border)); }
.btn.active { border-color: var(--accent); color: var(--accent); }
.form-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); align-items: end; }
.tbl-wrap { overflow-x: auto; }
table.tbl { width: 100%; border-collapse: collapse; font-size: 14px; }
.tbl th, .tbl td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.tbl th { color: var(--muted); font-weight: 600; white-space: nowrap; }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -1px; margin-right: 6px; }
.notice { padding: 10px 14px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 12%, var(--card)); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); }
.notice.err { background: color-mix(in srgb, var(--err) 10%, var(--card)); border-color: color-mix(in srgb, var(--err) 40%, var(--border)); color: var(--text); }
.small { font-size: 14px; }
code { font-size: 0.92em; }
</style>
