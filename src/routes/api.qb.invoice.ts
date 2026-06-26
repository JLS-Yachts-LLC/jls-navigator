/**
 * QBO invoicing API (authenticated, bearer).
 *   GET  /api/qb/invoice            -> { configured, catalog: [...] }  (UI bootstrap)
 *   POST /api/qb/invoice {source:'visa', yachtId, lines:[{itemName, visaIds, unitPrice?, taxCode?}], placeOfSupply?}
 *        -> creates ONE QBO invoice, writes back, returns { docNumber, invoiceId, total, lines }
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { qboConfigured, qboQuery, qboRealm } from '@/lib/qb/qbo.server'
import { generateVisaInvoice, InvoiceError, findQboItem } from '@/lib/qb/invoice.server'

const db = () => supabaseAdmin as any
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

// TEMP setup self-test (key-gated). Confirms the refresh token works, the realm is
// correct, and the seeded visa Items resolve in QBO. Remove after verifying.
const SELFTEST_KEY = 'st_9f3a7c2e1b8d4f60a5e2c7d1'
export async function qbSelftestHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (url.searchParams.get('key') !== SELFTEST_KEY) return json({ ok: false, error: 'forbidden' }, 403)
  if (!qboConfigured()) return json({ ok: false, error: 'QBO_CLIENT_ID/SECRET not set' }, 503)
  const out: any = { realm: qboRealm() }
  try {
    const ci = await qboQuery('select * from CompanyInfo')
    out.company = ci?.QueryResponse?.CompanyInfo?.[0]?.CompanyName ?? null
    out.country = ci?.QueryResponse?.CompanyInfo?.[0]?.Country ?? null
  } catch (e: any) {
    return json({ ok: false, step: 'company_info', error: String(e?.message ?? e) }, 502)
  }
  const { data: catalog } = await db().from('qbo_item_map').select('qbo_item_name').eq('scope', 'visa').eq('active', true)
  out.items = []
  for (const c of (catalog ?? [])) {
    try {
      const item = await findQboItem(c.qbo_item_name)
      out.items.push({ name: c.qbo_item_name, found: !!item, id: item?.Id ?? null, unitPrice: item?.UnitPrice ?? null })
    } catch (e: any) {
      out.items.push({ name: c.qbo_item_name, found: false, error: String(e?.message ?? e) })
    }
  }
  return json({ ok: true, ...out })
}

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
