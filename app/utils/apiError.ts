interface FetchErrorLike {
  data?: { statusMessage?: string, message?: string, data?: { code?: string } }
  statusMessage?: string
}

/** Fehlermeldung aus einer API-Antwort (createError → statusMessage) */
export function apiError(e: unknown, fallback = 'Das hat nicht geklappt.') {
  const err = e as FetchErrorLike
  return err.data?.statusMessage || err.data?.message || err.statusMessage || fallback
}

/** Maschinenlesbarer Fehlercode, z. B. „not_member“ bei der Registrierung */
export function apiErrorCode(e: unknown) {
  return (e as FetchErrorLike).data?.data?.code
}
