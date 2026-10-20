// Baseline security-response headers applied Worker-wide.
// Added for the ConnectSecure scan of polaris.jlsyachts.com (2026-10-19):
// CSP (Report-Only, so nothing already working can break), anti-clickjacking,
// HSTS, Permissions-Policy, X-Content-Type-Options, Cross-Origin-Resource-Policy,
// and a no-store Cache-Control on HTML so nothing user-specific gets cached.
//
// Deliberately NOT included here (handled by hand, see bug report):
// Cross-Origin-Embedder-Policy, Cross-Origin-Opener-Policy, and promoting the
// CSP from Report-Only to enforced.

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=15552000',
  'Permissions-Policy':
    'geolocation=(self), camera=(self), microphone=(self), payment=(), usb=(), fullscreen=(self)',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy-Report-Only':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'self'; report-uri /api/csp-report",
}

/**
 * Clones `response` with the baseline security headers applied, adding a
 * no-store Cache-Control for HTML responses (so SSR'd pages that may contain
 * user-specific data are never stored by shared/browser caches).
 *
 * Existing headers on the response are preserved; only the keys above are
 * added or overwritten.
 */
export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value)
  }
  const contentType = headers.get('Content-Type') || ''
  if (contentType.toLowerCase().includes('text/html')) {
    headers.set('Cache-Control', 'no-store, must-revalidate')
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
