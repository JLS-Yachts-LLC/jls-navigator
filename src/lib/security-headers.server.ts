// ──────────────────────────────────────────────────────────────────────────
// Security response headers — ConnectSecure scan 2026-10-15 (polaris.jlsyachts.com).
//
// Applied to EVERY response the Worker returns (the HTML document from
// createStartHandler, API routes, and static assets served via env.ASSETS).
// CSP is Report-Only this round — not yet enforcing — so a misconfigured
// directive can't break the app; it only gets logged by the browser. Once a
// reporting endpoint is wired up and the policy is proven safe against real
// traffic, it can be promoted to an enforcing Content-Security-Policy header
// in a follow-up change.
//
// Deliberately NOT set here (handled separately / by hand, see bug report):
//   · Cross-Origin-Embedder-Policy / Cross-Origin-Opener-Policy — would break
//     any cross-origin iframe/popup flow (QuickBooks, Facebook/WhatsApp
//     Embedded Signup) if flipped on without testing each one.
//   · Sub-Resource-Integrity attributes on <script>/<style> tags.
//   · Any HTTP→HTTPS redirect — that's the Cloudflare zone's "Always Use
//     HTTPS" setting, not application code.
// ──────────────────────────────────────────────────────────────────────────

const SECURITY_HEADERS: Array<[string, string]> = [
  ['X-Frame-Options', 'SAMEORIGIN'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
  ['Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'],
  ['Strict-Transport-Security', 'max-age=63072000'],
  [
    'Content-Security-Policy-Report-Only',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com; worker-src 'self' blob:; frame-src 'self' https://*.facebook.com https://*.quickbooks.com https://*.intuit.com",
  ],
]

// Static, long-lived assets: the Vite build's hashed bundle files, plus the
// (unhashed, but rarely-changing) favicon.
const ASSET_PATH_RE = /^\/(assets\/|favicon\.svg$)/

/**
 * Clones `response` and adds the security headers agreed for the 2026-10-15
 * ConnectSecure scan. Static assets under /assets/* and /favicon.svg get a
 * long, immutable Cache-Control (they're content-hashed or effectively
 * static); every other response — the HTML document and API routes, which
 * may carry user-specific data — gets Cache-Control: no-store so it is never
 * stored by a shared cache or replayed to another user.
 */
export function applySecurityHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of SECURITY_HEADERS) {
    headers.set(name, value)
  }

  const pathname = new URL(request.url).pathname
  if (ASSET_PATH_RE.test(pathname)) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  } else {
    headers.set('Cache-Control', 'no-store, must-revalidate')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
