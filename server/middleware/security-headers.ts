/**
 * Security-Header für alle Antworten; im Dev-Server keine CSP/HSTS wegen Vite. Module erlauben
 * weitere Skript-Quellen über runtimeConfig.csp.scriptSrc (z. B. eine Bibliothek von cdnjs).
 */
let csp: string | null = null
function contentSecurityPolicy() {
  csp ??= [
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
    'frame-ancestors \'none\'',
  ].join('; ')
  return csp
}

export default defineEventHandler((event) => {
  setHeaders(event, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...(import.meta.dev ? {} : { 'Content-Security-Policy': contentSecurityPolicy(), 'Strict-Transport-Security': 'max-age=31536000' }),
  })
})
