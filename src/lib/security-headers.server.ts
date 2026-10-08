// Low-risk remediation for ConnectSecure scan 2026-10-08 (polaris.jlsyachts.com).
// Pure, dependency-free helper (Web-standard Headers/Response only) so it can
// be unit tested without pulling in Supabase/Cloudflare bindings, and reused
// by worker-entry.ts to decorate every document response.
//
// Deliberately NOT included here (requires manual verification first, see bug
// analysis): enforcing (non-report-only) CSP, Sub Resource Integrity, COEP
// 'require-corp', COOP 'same-origin', and HSTS includeSubDomains/preload.
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=15552000',
  'Content-Security-Policy-Report-Only':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://cqzdroabjcdyncfqwawy.supabase.co; connect-src 'self' https://cqzdroabjcdyncfqwawy.supabase.co wss://cqzdroabjcdyncfqwawy.supabase.co; frame-ancestors 'self'",
  'Cache-Control': 'no-store',
}

/**
 * Returns a new Response with the security-scan remediation headers merged
 * on top of whatever headers the original response already set. Body,
 * status and statusText are preserved unchanged (including streamed bodies).
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
