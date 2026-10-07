// Shared security headers for every Response returned via the SSR/app path.
// Applied in worker-entry.ts by wrapping `handleRequest` (createStartHandler /
// defaultStreamHandler). Static assets served through the Worker's `ASSETS`
// binding bypass the Worker entirely, so the equivalent headers for those are
// set separately in public/_headers.
//
// Content-Security-Policy is deployed as Report-Only first: 'unsafe-inline' is
// kept on script-src because the live page currently has inline scripts.
// Switch to a nonce-based policy and drop 'unsafe-inline', then promote this
// to an enforcing Content-Security-Policy header, once CSP reports come back
// clean. Cross-Origin-Embedder-Policy and Cross-Origin-Opener-Policy are
// intentionally NOT set here (risk of breaking font/jsdelivr loads and the
// QuickBooks OAuth popup flow) -- handled separately once verified safe.
const CSP_REPORT_ONLY =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "connect-src 'self' https://cqzdroabjcdyncfqwawy.supabase.co wss://cqzdroabjcdyncfqwawy.supabase.co; " +
  "img-src 'self' data: https:; " +
  "frame-ancestors 'self'; " +
  "report-uri /api/csp-report"

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Frame-Options', 'SAMEORIGIN')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Strict-Transport-Security', 'max-age=31536000')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  )
  headers.set('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
