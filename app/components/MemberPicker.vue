<script setup lang="ts">
/** Suche in den Mitgliedern unseres Discord-Servers (über den Bot) */
export interface Member { discordId: string, username: string, name: string }

const emit = defineEmits<{ pick: [m: Member] }>()
const props = withDefaults(defineProps<{ exclude?: string[] }>(), { exclude: () => [] })

const q = ref('')
const results = ref<Member[]>([])
const error = ref('')
const loading = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

async function search() {
  const mySeq = ++seq
  loading.value = true
  error.value = ''
  try {
    const res = await api<Member[]>('/api/orga/discord/mitglieder', { query: { q: q.value } })
    if (mySeq === seq) results.value = res
  }
  catch (e) {
    if (mySeq === seq) error.value = apiError(e)
  }
  finally {
    if (mySeq === seq) loading.value = false
  }
}

watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(search, 300)
})

const shown = computed(() => results.value.filter(m => !props.exclude.includes(m.discordId)))
</script>

<template>
  <div class="picker">
    <input v-model="q" type="search" placeholder="Discord-Mitglied suchen (Name beginnt mit …)" @focus="!results.length && search()">
    <p v-if="error" class="err small">{{ error }}</p>
    <ul v-else-if="shown.length" class="results">
      <li v-for="m in shown" :key="m.discordId">
        <button type="button" class="btn small" @click="emit('pick', m)">{{ m.name }} <span class="muted">@{{ m.username }}</span></button>
      </li>
    </ul>
    <p v-else-if="!loading && q" class="muted small">Niemand gefunden.</p>
  </div>
</template>

<style scoped>
.picker input { width: 100%; }
.results { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; max-height: 220px; overflow-y: auto; }
</style>
