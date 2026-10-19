<script setup lang="ts">
/** Übersicht für Kontaktpersonen: ihre Leute mit Status, Platz und Buchung; erinnern und Buchung eintragen */
useHead({ title: 'Meine Leute' })
const { loggedIn } = useUserSession()
if (!loggedIn.value) await navigateTo('/auth/discord?redirect=/kontakt', { external: true })
</script>

<template>
  <div class="wrap orga">
    <h1>Meine Leute</h1>
    <p class="muted">Deine Leute im aktuellen Event: wer zugesagt, abgesagt oder noch nicht geantwortet hat, wer einen Platz hat und wer schon gebucht hat. <NuxtLink to="/">Zum Sitzplan</NuxtLink></p>
    <section class="card">
      <TeamOverview />
    </section>
  </div>
</template>
