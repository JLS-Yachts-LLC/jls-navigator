/**
 * GET /api/qb/profinv — Prof Inv registry for the QuickBooks browser extension.
 *
 * The QBO API cannot see Sales Orders, so a Chrome extension attaches the
 * generated "Prof Inv NNNN-YY Client" PDF to the Sales Order via the team's own
 * logged-in QuickBooks session. This endpoint is what the extension talks to:
 *
 *   ?q=<client or quote number>   → JSON list of matching Prof Invs (newest first)
 *   ?download=<doc_number>        → the PDF bytes (regenerates from the quotation
 *                                    if the stored copy is missing)
 *
 * Auth: Authorization: Bearer <POLARIS_EXT_TOKEN> (Wrangler secret). The token
 * only grants access to this endpoint — nothing else in Polaris.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const db = () => supabaseAdmin as any

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } })

export async function qbProfinvHandler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const secret = (process.env.POLARIS_EXT_TOKEN ?? '').trim()
  if (!secret) return json({ error: 'Extension access is not configured (POLARIS_EXT_TOKEN secret missing)' }, 503)
  const provided = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!provided || provided !== secret) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const sb = db()

  // ── Download one Prof Inv PDF ────────────────────────────────────────────────
  const download = url.searchParams.get('download')
  if (download) {
    const { data: row } = await sb.from('qb_proforma_docs').select('*').eq('doc_number', download).maybeSingle()
    if (!row) return json({ error: `No Prof Inv ${download}` }, 404)

    // Stored copy first; regenerate from the quotation if missing (covers docs
    // generated before storage-keeping existed).
    let bytes: Uint8Array | null = null
    if (row.pdf_path) {
      const { data: file } = await sb.storage.from('esign-documents').download(row.pdf_path)
      if (file) bytes = new Uint8Array(await file.arrayBuffer())
    }
    if (!bytes) {
      const { qboRequest } = await import('@/lib/qb/qbo.server')
      const { transformProforma, buildProformaPdf } = await import('@/lib/qb/proforma-docgen.server')
      const est = (await qboRequest('GET', `/estimate/${row.estimate_qbo_id}?include=enhancedAllCustomFields&minorversion=73`))?.Estimate
      if (!est) return json({ error: 'Quotation no longer exists in QuickBooks' }, 404)
      let trnNo = ''
      const custId = est.CustomerRef?.value
      if (custId) {
        const cust = await qboRequest('GET', `/customer/${custId}?minorversion=73`).catch(() => null)
        trnNo = String(cust?.Customer?.PrimaryTaxIdentifier ?? '')
      }
      const data = transformProforma(est, { trnNo })
      data.party.docNumber = row.doc_number
      bytes = await buildProformaPdf(data)
      const storagePath = `qbo/profinv/${row.doc_number}.pdf`
      await sb.storage.from('esign-documents').upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true })
      await sb.from('qb_proforma_docs').update({ pdf_path: storagePath }).eq('estimate_qbo_id', row.estimate_qbo_id)
    }

    const fileName = `Prof Inv ${row.doc_number} ${row.client_name ?? ''}`.trim()
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}.pdf"`,
        'X-Profinv-Filename': `${fileName}.pdf`,
        ...CORS,
      },
    })
  }

  // ── List / search ────────────────────────────────────────────────────────────
  const q = (url.searchParams.get('q') ?? '').trim()
  let query = sb.from('qb_proforma_docs')
    .select('doc_number, client_name, estimate_doc_number, created_at')
    .order('created_at', { ascending: false }).limit(10)
  if (q) query = query.or(`client_name.ilike.%${q}%,estimate_doc_number.ilike.%${q}%,doc_number.ilike.%${q}%`)
  const { data: rows, error } = await query
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, results: rows ?? [] })
}
