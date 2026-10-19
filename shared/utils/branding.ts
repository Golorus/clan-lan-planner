/** Name der App und der Event-Rolle, per NUXT_PUBLIC_APP_NAME / NUXT_PUBLIC_EVENT_ROLE_NAME änderbar; leer = Standard */
export const DEFAULT_APP_NAME = 'Clan LAN Planner'
export const DEFAULT_EVENT_ROLE_NAME = 'Event-Rolle'

/** pub ist useRuntimeConfig().public */
export function resolveBranding(pub: object) {
  const { appName, eventRoleName } = pub as { appName?: unknown, eventRoleName?: unknown }
  const text = (v: unknown, fallback: string) => typeof v === 'string' && v.trim() ? v.trim() : fallback
  return {
    appName: text(appName, DEFAULT_APP_NAME),
    eventRoleName: text(eventRoleName, DEFAULT_EVENT_ROLE_NAME),
  }
}
