import { framableBy } from '#shared/utils/moduleFrames'

/**
 * Security-Header für alle Antworten; im Dev-Server keine CSP/HSTS wegen Vite. Module erlauben
 * weitere Skript-Quellen über runtimeConfig.csp.scriptSrc (z. B. eine Bibliothek von cdnjs) und
 * Seiten, die der Planner selbst in einen Rahmen setzen darf, über runtimeConfig.csp.frameSelf.
 */
const csp: Record<'none' | 'self', string | undefined> = { none: undefined, self: undefined }
function contentSecurityPolicy(frame: 'none' | 'self') {
  csp[frame] ??= [
    'default-src \'self\'',
    ['script-src \'self\' \'unsafe-inline\'', ...useRuntimeConfig().csp.scriptSrc].join(' '),
    'style-src \'self\' \'unsafe-inline\'',
    'font-src \'self\' data:',
    'img-src \'self\' data: blob:',
    'connect-src \'self\' data: blob:',
    'worker-src \'self\' blob:',
    'object-src \'none\'',
    'base-uri \'self\'',
    'form-action \'self\'',
    `frame-ancestors '${frame}'`,
  ].join('; ')
  return csp[frame]
}

export default defineEventHandler((event) => {
  const frame = framableBy(event.path, useRuntimeConfig(event).csp.frameSelf) ? 'self' : 'none'
  setHeaders(event, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': frame === 'self' ? 'SAMEORIGIN' : 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...(import.meta.dev ? {} : { 'Content-Security-Policy': contentSecurityPolicy(frame), 'Strict-Transport-Security': 'max-age=31536000' }),
  })
})
