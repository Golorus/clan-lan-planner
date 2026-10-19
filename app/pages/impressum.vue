<script setup lang="ts">
/** Impressum (§ 5 DDG); die Angaben kommen aus der .env (NUXT_PUBLIC_IMPRESSUM_…), damit keine Adresse im Repo steht */
useHead({ title: 'Impressum' })
const i = useRuntimeConfig().public.impressum
const filled = computed(() => !!(i.name && i.street && i.city && i.email))
</script>

<template>
  <div class="wrap">
    <h1>Impressum</h1>
    <section class="card">
      <template v-if="filled">
        <h2>Angaben gemäß § 5 DDG</h2>
        <p>
          {{ i.name }}<br>
          {{ i.street }}<br>
          {{ i.city }}
        </p>
        <h2>Kontakt</h2>
        <p>E-Mail: <a :href="`mailto:${i.email}`">{{ i.email }}</a></p>
        <p v-if="i.note" class="note">{{ i.note }}</p>
      </template>
      <p v-else class="muted">Die Angaben zum Impressum sind noch nicht eingetragen.</p>
    </section>
  </div>
</template>

<style scoped>
h2 { font-size: 17px; margin: 18px 0 6px; }
h2:first-child { margin-top: 0; }
p { margin: 0 0 8px; }
.note { white-space: pre-wrap; }
</style>
