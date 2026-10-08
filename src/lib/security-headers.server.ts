// Baseline security headers applied to every document (page) response
// served by the Worker. Added in response to the ConnectSecure scan of
// polaris.jlsyachts.com on 2026-10-07.
//
// Deliberately conservative / Report-Only where enforcing could break the
// app:
//   - Content-Security-Policy is Report-Only until violation reports from
//     real traffic have been reviewed (the app loads fonts, SVG icons as
//     data: URIs, and talks to Supabase over https/wss).
//   - Cross-Origin-Embedder-Policy is Report-Only at 'credentialless'
//     (not enforced 'require-corp', which can silently break cross-origin
//     iframes/images that don't send CORP/CORS headers).
//   - Cross-Origin-Opener-Policy is 'same-origin-allow-popups', not
//     'same-origin', because the QuickBooks OAuth connect flow
//     (src/routes/api.qb.connect.ts) opens a popup that posts a message
//     back to this origin's window.opener â 'same-origin' would sever
//     that reference and break the popup flow.
//   - Strict-Transport-Security is max-age only (no includeSubDomains or
//     preload yet) to avoid accidentally affecting other *.jlsyachts.com
//     subdomains that haven't been audited for HTTPS-only readiness.

const PERMISSIONS_POLICY =
  "payment=(), usb=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=(), interest-cohort=()"

const CSP_REPORT_ONLY =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://cqzdroabjcdyncfqwawy.supabase.co wss://cqzdroabjcdyncfqwawy.supabase.co; frame-src https://react.dev"

export function applySecurityHeaders(response: Response, opts?: { isDocument?: boolean }): Response {
  const headers = new Headers(response.headers)

  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  headers.set('Strict-Transport-Security', 'max-age=31536000')
  headers.set('Permissions-Policy', PERMISSIONS_POLICY)
  headers.set('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY)
  headers.set('Cross-Origin-Embedder-Policy-Report-Only', 'credentialless')

  // Only the HTML document response should refuse caching outright â
  // hashed /assets/* files are meant to be cached forever and already set
  // their own Cache-Control via public/_headers.
  if (opts?.isDocument) {
    headers.set('Cache-Control', 'no-store')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
