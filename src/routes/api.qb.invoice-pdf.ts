/**
 * Native QB Invoice PDF — preview & manual run (admin only).
 *
 *   GET  /api/qb/invoice-pdf?id=<qboInvoiceId>            → renders the PDF inline
 *        (nothing written to QBO — use this to check the layout on a real invoice)
 *   POST /api/qb/invoice-pdf?id=<qboInvoiceId>[&force=1]  → full cycle: render,
 *        delete old "Invoice - <no>.pdf" attachments, upload + link the new one.
 *        force=1 bypasses the qb-invoice-pdf toggle and the unchanged-guard.
 */
import { requireAdminAccess } from '@/lib/admin/access'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function qbInvoicePdfHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request)
  if (!session.ok) return session.response

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return json({ error: 'Pass ?id=<QuickBooks invoice id>' }, 400)

  try {
    if (request.method === 'GET') {
      const { renderInvoicePdfById } = await import('@/lib/qb/invoice-doc.server')
      const { bytes, fileName } = await renderInvoicePdfById(id)
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Cache-Control': 'no-store',
        },
      })
    }
    if (request.method === 'POST') {
      const { generateAndAttachInvoicePdf } = await import('@/lib/qb/invoice-doc.server')
      const result = await generateAndAttachInvoicePdf(id, { force: url.searchParams.get('force') === '1' })
      return json(result, result.ok ? 200 : 500)
    }
    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500)
  }
}
