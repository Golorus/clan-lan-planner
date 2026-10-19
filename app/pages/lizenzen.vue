<script setup lang="ts">
useHead({ title: 'Datenschutz & Lizenzen' })

/** Text der MIT-Lizenz ohne Copyright-Zeile (gilt für den Planner und für den Seat-Planner) */
const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
const license = (holder: string) => `MIT License\n\nCopyright (c) 2026 ${holder}\n\n${MIT}`
</script>

<template>
  <div class="wrap">
    <h1>Datenschutz &amp; Lizenzen</h1>

    <section class="card">
      <h2>Datenschutz</h2>
      <p>
        Für den Sitzplan meldest du dich mit Discord an. Wir speichern dabei nur deine <strong>Discord-ID</strong>,
        deinen <strong>Discord-Benutzernamen</strong> und deinen Anzeigenamen – keine E-Mail-Adresse.
        Bei der Registrierung kommen dein <strong>Nickname</strong>, deine <strong>Kontaktperson</strong> und dein <strong>Platz</strong> dazu.
      </p>
      <p>
        Wofür: um dir einen Platz zuzuordnen und dich per Discord-Direktnachricht über unseren Bot zu informieren
        (z. B. „Dein Platz ist A-12“). Öffentlich sichtbar sind nur Nickname, Platz und Kontaktperson (als Farbe).
        Discord-ID und Discord-Name sehen nur die Organisatoren. Unserem Discord-Server wirst du nur hinzugefügt,
        wenn du das selbst anklickst und bei Discord bestätigst.
      </p>
      <p>
        Deine Registrierungen bleiben gespeichert, auch über das Event hinaus. Du kannst deine Zusage jederzeit zurücknehmen
        und unter <NuxtLink to="/">Registrierung › Meine Daten</NuxtLink> alle deine Daten selbst löschen
        (Registrierungen aller Events, Plätze und Nachrichten). Kontaktpersonen entfernt die Orga.
      </p>
    </section>

    <section class="card">
      <h2>Lizenzen</h2>
      <h3>Dieser Planner</h3>
      <p>Der Planner selbst steht unter der MIT-Lizenz und wird ohne Support veröffentlicht:</p>
      <pre class="license">{{ license('Golorus') }}</pre>

      <h3>Seat-Planner</h3>
      <p>
        Der Sitzplan ist funktional nachgebaut nach dem
        <a href="https://github.com/d3molite/Seat-Planner" target="_blank" rel="noopener">Seat-Planner von Tobias Brinke</a>
        (Reihen à 40 Plätze, Tische zu zweit, doppelt breite Plätze). Er steht unter der MIT-Lizenz:
      </p>
      <pre class="license">{{ license('Tobias Brinke') }}</pre>
      <p class="muted small">Weitere verwendete Bibliotheken (Nuxt, Vue, Drizzle ORM, better-sqlite3, zod, nuxt-auth-utils) stehen unter der MIT-Lizenz.</p>
    </section>
  </div>
</template>

<style scoped>
h3 { margin: 18px 0 6px; font-size: 16px; }
.license { white-space: pre-wrap; font-size: 12.5px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); overflow-x: auto; }
</style>
