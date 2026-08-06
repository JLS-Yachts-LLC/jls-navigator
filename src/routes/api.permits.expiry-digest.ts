/**
 * Permit expiry digest — dry run (admin only).
 *
 *   GET /api/permits/expiry-digest            → JSON: what the digest contains
 *   GET /api/permits/expiry-digest?format=html → the rendered email, in the browser
 *
 * Sends nothing. Use this to review the digest before turning the daily cron on
 * with PERMIT_EXPIRY_ALERTS_ENABLED=true.
 */
import { requireAdminAccess } from '@/lib/admin/access'

export async function permitExpiryDigestHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request)
  if (!session.ok) return session.response

  try {
    const { previewExpiryDigest } = await import('@/lib/permit-expiry-cron.server')
    const preview = await previewExpiryDigest()

    if (new URL(request.url).searchParams.get('format') === 'html') {
      return new Response(preview.html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }
    // Drop the HTML from the JSON view — it is long and unreadable in a console.
    const { html: _html, ...rest } = preview
    return new Response(JSON.stringify({ ...rest, note: 'Dry run — no email was sent. Add ?format=html to see the email itself.' }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
