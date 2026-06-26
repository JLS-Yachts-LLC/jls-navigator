/**
 * QBO invoicing API (authenticated, bearer).
 *   GET  /api/qb/invoice            -> { configured, catalog: [...] }  (UI bootstrap)
 *   POST /api/qb/invoice {source:'visa', yachtId, lines:[{itemName, visaIds, unitPrice?, taxCode?}], placeOfSupply?}
 *        -> creates ONE QBO invoice, writes back, returns { docNumber, invoiceId, total, lines }
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { qboConfigured } from '@/lib/qb/qbo.server'
import { generateVisaInvoice, InvoiceError } from '@/lib/qb/invoice.server'

const db = () => supabaseAdmin as any
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function qbInvoiceHandler(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const { data: { user }, error: authErr } = await db().auth.getUser(auth.slice(7))
  if (authErr || !user) return json({ ok: false, error: 'Unauthorized' }, 401)

  if (request.method === 'GET') {
    const { data: catalog } = await db()
      .from('qbo_item_map').select('qbo_item_name, unit_price, tax_code, sort_order')
      .eq('scope', 'visa').eq('active', true).order('sort_order', { ascending: true })
    return json({ ok: true, configured: qboConfigured(), catalog: catalog ?? [] })
  }

  if (request.method === 'POST') {
    let body: any = {}
    try { body = await request.json() } catch { /* empty */ }
    if (body.source !== 'visa') return json({ ok: false, error: 'Unsupported source' }, 400)
    try {
      const result = await generateVisaInvoice(
        { yachtId: body.yachtId, lines: body.lines ?? [], placeOfSupply: body.placeOfSupply },
        user.id,
      )
      return json({ ok: true, ...result })
    } catch (e: any) {
      const code = e instanceof InvoiceError ? e.code : 'error'
      const status = code === 'not_configured' ? 503 : ['empty', 'mixed_vessel', 'no_customer', 'item_not_found', 'no_price'].includes(code) ? 422 : 500
      return json({ ok: false, error: String(e?.message ?? e), code }, status)
    }
  }

  return json({ ok: false, error: 'Method not allowed' }, 405)
}
