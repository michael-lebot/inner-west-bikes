// Security headers on every page and API response, with a fresh CSP nonce per request (§6).
import { NextResponse, type NextRequest } from 'next/server'
import { isDev } from '@/lib/env'
import { TILES_URL } from '@/lib/public-env'

const tilesOrigin = URL.canParse(TILES_URL) ? new URL(TILES_URL).origin : ''

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID())
  const csp = [
    "default-src 'self'",
    // React needs eval in development only, for its debugging tools.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${tilesOrigin}`.trim(),
    // MapLibre runs its worker from a blob: URL.
    'worker-src blob:',
    'child-src blob:',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')

  // Next reads the nonce from the request's CSP header and adds it to every script it renders.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })

  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'geolocation=(self)')
  return response
}

export const config = {
  matcher: '/((?!_next/static|fonts|glyphs|tiles|preview.webp).*)',
}
