/**
 * Packen per QR-Code (Seiten /packen…, /orga/inventar/packen): Stand vom Server, Zählen mit Zwischenspeicher.
 * Ein Klick wird sofort angezeigt und im Browser gemerkt; ohne Netz bleibt er dort, bis er gesendet ist
 * (beim Zurückkommen des Netzes, alle paar Sekunden, beim nächsten Klick). Der Server zählt jede Kennung nur einmal.
 */
export interface PackContainer { id: string, name: string, kind: string }
export interface PackArticle { id: string, name: string, count: number, container: string, note: string }
export interface PackData {
  containers: PackContainer[]
  articles: PackArticle[]
  round: 'hin' | 'rueck'
  roundId: string
  counts: Record<string, number>
  by: Record<string, string>
  at: Record<string, string>
}
interface PackOp { id: string, article: string, delta: 1 | -1, roundId: string }

const QUEUE_KEY = 'planner-packen-warteschlange'
const POLL_MS = 10000
let started = false

function readQueue(): PackOp[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as PackOp[] }
  catch { return [] }
}
function writeQueue(q: PackOp[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) }
  catch { /* privater Modus: bleibt nur bis zum Neuladen */ }
}
const opId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

export const ROUND_TEXT = { hin: 'Hinweg: einpacken', rueck: 'Rückweg: wieder einpacken' } as const

export function usePacken() {
  const data = useState<PackData | null>('packen', () => null)
  const queue = useState<PackOp[]>('packen-queue', () => [])
  const offline = useState('packen-offline', () => false)
  const error = useState('packen-error', () => '')
  let sending = false
  // beim Rendern auf dem Server mit der Sitzung der Anfrage (Cookie), sonst wäre der Aufruf dort nicht angemeldet
  const requestFetch = useRequestFetch()

  async function load() {
    try {
      data.value = await requestFetch<PackData>('/api/packen')
      offline.value = false
      error.value = ''
    }
    catch (e) {
      if (!data.value) error.value = apiError(e, 'Der Packstand ließ sich nicht laden.')
      offline.value = true
    }
  }

  async function flush() {
    if (sending || !queue.value.length) return
    sending = true
    const batch = queue.value.slice(0, 500)
    try {
      data.value = await $fetch<PackData>('/api/packen/zaehlen', { method: 'POST', body: { ops: batch } })
      // gesendet: aus der Warteschlange; Klicks aus einer alten Runde zählt der Server nicht, die fallen auch weg
      const sent = new Set(batch.map(o => o.id))
      queue.value = queue.value.filter(o => !sent.has(o.id))
      writeQueue(queue.value)
      offline.value = false
    }
    catch (e) {
      offline.value = true
      const status = (e as { statusCode?: number }).statusCode
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        // abgelehnt (abgemeldet, keine Freigabe): nicht endlos wiederholen
        error.value = apiError(e)
        queue.value = []
        writeQueue([])
      }
    }
    finally { sending = false }
  }

  /** ein Teil mehr (+1) oder weniger (−1) in der Kiste */
  function count(article: string, delta: 1 | -1) {
    if (!data.value) return
    queue.value = [...queue.value, { id: opId(), article, delta, roundId: data.value.roundId }]
    writeQueue(queue.value)
    flush()
  }

  /** Zähler mit den noch nicht gesendeten Klicks */
  const counts = computed(() => {
    const out: Record<string, number> = { ...(data.value?.counts ?? {}) }
    for (const op of queue.value) if (op.roundId === data.value?.roundId) out[op.article] = Math.max(0, (out[op.article] ?? 0) + op.delta)
    return out
  })

  function start() {
    if (!import.meta.client || started) return
    started = true
    queue.value = readQueue()
    window.addEventListener('online', () => { flush(); load() })
    setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (queue.value.length) flush()
      else load()
    }, POLL_MS)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load() })
  }

  const box = (id: string) => data.value?.containers.find(c => c.id === id) ?? null
  const article = (id: string) => data.value?.articles.find(a => a.id === id) ?? null
  const inBox = (id: string) => (data.value?.articles ?? []).filter(a => a.container === id).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  /** Fortschritt einer Liste: wie viele Teile sind drin (höchstens Soll je Artikel) von wie vielen */
  const progress = (list: PackArticle[]) => {
    const soll = list.reduce((n, a) => n + a.count, 0)
    const drin = list.reduce((n, a) => n + Math.min(a.count, counts.value[a.id] ?? 0), 0)
    return { soll, drin, done: soll > 0 && drin >= soll }
  }

  return { data, queue, offline, error, counts, load, flush, count, start, box, article, inBox, progress }
}
