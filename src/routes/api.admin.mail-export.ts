/**
 * TEMPORARY admin-only export: external email recipients (last 90 days) → CSV.
 * GET /api/admin/mail-export  (Bearer, global_admin). Delete after the one-off run.
 */
import { requireAdminAccess } from '@/lib/admin/access'

export async function mailExportHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request)
  if (!session.ok) return session.response

  try {
    const days = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('days') || '90', 10) || 90, 1), 365)
    const { exportExternalRecipients } = await import('@/lib/mail-export.server')
    const { csv, count, mailboxes, capped } = await exportExternalRecipients(days)
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="external-recipients-${days}d.csv"`,
        'Cache-Control': 'no-store',
        'X-Recipient-Count': String(count),
        'X-Mailboxes-Scanned': String(mailboxes),
        'X-Capped': String(capped),
      },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
