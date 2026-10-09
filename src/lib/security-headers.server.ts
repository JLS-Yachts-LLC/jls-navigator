/**
 * Security headers (ConnectSecure scan 2026-10-09, polaris.jlsyachts.com).
 * Applied to every response rendered by the TanStack Start SSR handler
 * ('/' and all app routes). Static assets under /assets/* and other
 * public/ files (JS, CSS, favicon.svg, etc.) are covered separately and
 * declaratively by public/_headers, Cloudflare's native static-asset
 * headers mechanism — that path never reaches this function.
 *
 * CSP ships as Report-Only so nothing can break in production; promote to
 * an enforcing Content-Security-Policy header once a reporting period has
 * shown no unexpected violations.
 *
 * Deliberately NOT set here (needs manual verification first, per the
 * 2026-10-09 scan triage): X-Frame-Options / frame-ancestors beyond the
 * report-only CSP value above, Cross-Origin-Resource-Policy, and the
 * jsdelivr <script> integrity attribute.
 */
export function withSecurityHeaders(response: Response, pathname: string): Response {
  const headers = new Headers(response.headers)

  headers.set(
    'Content-Security-Policy-Report-Only',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://cqzdroabjcdyncfqwawy.supabase.co wss://cqzdroabjcdyncfqwawy.supabase.co; worker-src 'self' blob:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  )
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  headers.set(
    'Permissions-Policy',
    'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()',
  )
  headers.set('Strict-Transport-Security', 'max-age=15552000')
  headers.set('X-Content-Type-Options', 'nosniff')

  // /assets/* long-lived immutable caching is set declaratively in
  // public/_headers — don't fight it here with no-store.
  if (!pathname.startsWith('/assets/')) {
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
