import { orgaHeaders } from '#shared/utils/orgaContext'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * $fetch für unsere API, ohne Nitros Routen-Typinferenz: die läuft bei vielen dynamischen
 * Routen (/api/orga/…/[id]) in „Excessive stack depth“. Rückgabetyp gibt der Aufrufer an.
 * Von Seiten unter /orga aus mit Orga-Kennzeichnung: nur dort gelten Orga-Rechte (shared/utils/orgaContext.ts).
 */
export function api<T = unknown>(url: string, opts: { method?: Method, body?: unknown, query?: Record<string, string | number> } = {}) {
  const headers = import.meta.client ? orgaHeaders(location.pathname) : {}
  return $fetch<T, string>(url, { ...opts, headers } as Parameters<typeof $fetch>[1]) as Promise<T>
}
