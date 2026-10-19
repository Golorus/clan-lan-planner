import { resolveBranding } from '#shared/utils/branding'

/** Name der App und der Event-Rolle aus der Laufzeit-Konfiguration */
export const useBranding = () => resolveBranding(useRuntimeConfig().public)
