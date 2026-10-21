<script setup lang="ts">
import { DEFAULT_MIN_DAYS, type MemberRule } from '#shared/utils/access'

/**
 * /orga › Teilnehmer: wer ohne Freigabe durchkommt, offene Freigabe-Anfragen entscheiden, Ablehnungen zurücksetzen
 * (server/utils/freigabe.ts)
 */
interface Request { personId: number, nick: string, discordName: string | null, contactNick: string | null, approval: 'wartet' | 'abgelehnt', requestedAt: string, decidedAt: string | null, decidedBy: string | null }
interface Rule { rule: MemberRule, roleId: string | null, minDays: number, source: 'orga' | 'env' }
const { data, refresh } = await useFetch<{ requests: Request[], memberRule: Rule }>('/api/orga/freigaben', { key: 'orga-freigaben' })
const { data: roles } = await useFetch('/api/orga/discord/rollen', { key: 'orga-rollen' })
const emit = defineEmits<{ changed: [] }>()

const RULES: { value: MemberRule, label: string }[] = [
  { value: 'server', label: 'Jedes Mitglied unseres Discord-Servers' },
  { value: 'dauer', label: 'Wer schon eine Weile auf unserem Discord-Server ist' },
  { value: 'rolle', label: 'Nur wer die Clan-Rolle hat' },
  { value: 'keine', label: 'Niemand: jede neue Person fragt an' },
]
const rule = ref<MemberRule>('server')
const roleId = ref('')
const minDays = ref(DEFAULT_MIN_DAYS)
watch(() => data.value?.memberRule, r => {
  rule.value = r?.rule ?? 'server'
  roleId.value = r?.roleId ?? ''
  minDays.value = r?.minDays ?? DEFAULT_MIN_DAYS
}, { immediate: true })
const daysValid = computed(() => Number.isInteger(minDays.value) && minDays.value >= 1 && minDays.value <= 365)
const ruleChanged = computed(() => rule.value !== data.value?.memberRule.rule
  || (rule.value === 'rolle' && roleId.value !== (data.value?.memberRule.roleId ?? ''))
  || (rule.value === 'dauer' && minDays.value !== data.value?.memberRule.minDays))
async function saveRule(reset = false) {
  busy.value = true
  error.value = ''
  try {
    await api('/api/orga/freigaben/regel', { method: 'PUT', body: reset ? { rule: null } : { rule: rule.value, roleId: rule.value === 'rolle' ? roleId.value || null : null, minDays: minDays.value } })
    await refresh()
    emit('changed')
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    busy.value = false
  }
}

const waiting = computed(() => (data.value?.requests ?? []).filter(r => r.approval === 'wartet'))
const rejected = computed(() => (data.value?.requests ?? []).filter(r => r.approval === 'abgelehnt'))
const busy = ref(false)
const error = ref('')
const when = (d: string | null) => d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : ''

async function decide(r: Request, decision: 'frei' | 'abgelehnt' | 'zurück') {
  if (decision === 'abgelehnt' && !confirm(`${r.nick} ablehnen? Die Person kann dann nicht mitmachen.`)) return
  busy.value = true
  error.value = ''
  try {
    await api(`/api/orga/freigaben/${r.personId}`, { method: 'POST', body: { decision } })
    await refresh()
    emit('changed')
  }
  catch (e) {
    error.value = apiError(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="card">
    <h2>Freigaben<span v-if="waiting.length" class="muted"> · {{ waiting.length }} offen</span></h2>
    <details class="rule-box" :open="!!error">
      <summary>Ohne Freigabe rein: <strong>{{ RULES.find(r => r.value === data?.memberRule.rule)?.label }}<template v-if="data?.memberRule.rule === 'dauer'"> ({{ data.memberRule.minDays }} Tage)</template></strong></summary>
      <p class="muted small">Orga, Kontaktpersonen und wer schon bei uns ist, kommen immer rein. Wer sonst ohne Freigabe durchkommt:</p>
      <div class="rules">
        <label v-for="r in RULES" :key="r.value" class="rule">
          <input v-model="rule" type="radio" name="member-rule" :value="r.value"> {{ r.label }}
          <span v-if="r.value === 'dauer' && rule === 'dauer'" class="days">
            seit mindestens <input v-model.number="minDays" type="number" min="1" max="365" step="1"> Tagen
          </span>
          <select v-if="r.value === 'rolle' && rule === 'rolle'" v-model="roleId" class="role">
            <option value="">Rolle wählen …</option>
            <option v-for="o in roles?.roles" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select>
        </label>
      </div>
      <div class="row">
        <button class="btn small" type="button" :disabled="busy || !ruleChanged || (rule === 'rolle' && !roleId) || (rule === 'dauer' && !daysValid)" @click="saveRule()">Speichern</button>
        <span class="muted small">
          <template v-if="data?.memberRule.source === 'orga'">Hier gesetzt. <a href="#" @click.prevent="saveRule(true)">Zurück zur .env</a></template>
          <template v-else>Aus der .env (NUXT_DISCORD_MEMBER_ROLE_ID).</template>
        </span>
      </div>
      <p v-if="rule === 'server'" class="muted small">
        Passt, wenn auf euren Discord nur kommt, wen ihr kennt: Ein offener Einladungslink lässt sonst jeden durch.
        Über den Planner tritt niemand vor der Freigabe dem Server bei.
      </p>
      <p v-if="rule === 'dauer'" class="muted small">
        Wer gerade erst über einen Einladungslink gekommen ist, fragt eine Freigabe an. Wer länger dabei ist, merkt nichts.
      </p>
    </details>
    <p v-if="error" class="notice err">{{ error }}</p>
    <p v-if="!waiting.length && !rejected.length" class="muted small">Keine offenen Anfragen.</p>
    <p v-else class="muted small">Die Kontaktperson kann per Discord-Knopf entscheiden, du hier.</p>
    <div v-if="waiting.length || rejected.length" class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>Nick</th><th>Kontaktperson</th><th>Stand</th><th /></tr></thead>
        <tbody>
          <tr v-for="r in [...waiting, ...rejected]" :key="r.personId">
            <td>{{ r.nick }}<span v-if="r.discordName" class="sub">{{ r.discordName }}</span></td>
            <td>{{ r.contactNick ?? '–' }}</td>
            <td>
              <span class="badge" :class="{ bad: r.approval === 'abgelehnt' }">{{ r.approval === 'wartet' ? 'wartet' : 'abgelehnt' }}</span>
              <span class="sub">{{ r.approval === 'wartet' ? `seit ${when(r.requestedAt)}` : `${when(r.decidedAt)}${r.decidedBy ? ` von ${r.decidedBy}` : ''}` }}</span>
            </td>
            <td><div class="row acts">
              <template v-if="r.approval === 'wartet'">
                <button class="btn small primary" type="button" :disabled="busy" @click="decide(r, 'frei')">Freigeben</button>
                <button class="btn small danger" type="button" :disabled="busy" @click="decide(r, 'abgelehnt')">Ablehnen</button>
              </template>
              <template v-else>
                <button class="btn small" type="button" :disabled="busy" @click="decide(r, 'frei')">Doch freigeben</button>
                <button class="btn small" type="button" :disabled="busy" title="Die Person kann neu anfragen" @click="decide(r, 'zurück')">Zurücksetzen</button>
              </template>
            </div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.rule-box { margin-bottom: 10px; }
.rule-box summary { cursor: pointer; }
.rules { display: grid; gap: 4px; margin: 6px 0 10px; }
.rule { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.role { max-width: 100%; }
.days input { width: 4.5em; }
.acts { gap: 6px; flex-wrap: nowrap; justify-content: flex-end; }
</style>
