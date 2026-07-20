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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } })

/** The extension token lives in integration_settings ('qbo_extension' → config.token,
 *  manageable from Finance → QB Extension) with the POLARIS_EXT_TOKEN Wrangler
 *  secret accepted as an alternative. */
async function validToken(sb: any, provided: string): Promise<boolean> {
  if (!provided) return false
  const envSecret = (process.env.POLARIS_EXT_TOKEN ?? '').trim()
  if (envSecret && provided === envSecret) return true
  const { data } = await sb.from('integration_settings').select('config').eq('integration_name', 'qbo_extension').maybeSingle()
  const dbToken = String(data?.config?.token ?? '').trim()
  return !!dbToken && provided === dbToken
}

export async function qbProfinvHandler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const sb = db()
  const provided = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!(await validToken(sb, provided))) return json({ error: 'Unauthorized — set the token in Polaris → Finance → QB Extension and paste it into the extension options' }, 401)

  // ── Telemetry (POST): installs, heartbeats, attach results, errors ──────────
  if (request.method === 'POST') {
    let body: any = {}
    try { body = await request.json() } catch { /* empty */ }
    const name = String(body.name ?? 'unknown').slice(0, 120)
    const version = String(body.version ?? '').slice(0, 20)
    const event = String(body.event ?? '').slice(0, 30)
    const ua = String(request.headers.get('user-agent') ?? '').slice(0, 300)
    if (!event) return json({ error: 'event required' }, 400)
    await sb.from('qb_ext_installs').upsert({
      name, version, ua, last_seen: new Date().toISOString(),
    }, { onConflict: 'name', ignoreDuplicates: false })
    if (event !== 'heartbeat') {
      await sb.from('qb_ext_events').insert({
        name, version, event,
        message: body.message ? String(body.message).slice(0, 1000) : null,
        page: body.page ? String(body.page).slice(0, 300) : null,
      })
    }
    return json({ ok: true })
  }

  const url = new URL(request.url)

  // ── Regenerate one Prof Inv on the CURRENT template (same number) ────────────
  // Re-renders from the quotation, replaces the stored copy AND swaps the
  // attachments on the quotation. (The Sales Order copy must be re-attached via
  // the extension — the QBO API cannot address Sales Orders.)
  const regen = url.searchParams.get('regenerate')
  if (regen) {
    const { data: row } = await sb.from('qb_proforma_docs').select('*').eq('doc_number', regen).maybeSingle()
    if (!row) return json({ error: `No Prof Inv ${regen}` }, 404)

    const { qboRequest, qboQuery, qboUpload } = await import('@/lib/qb/qbo.server')
    const { transformProforma, buildProformaPdf } = await import('@/lib/qb/proforma-docgen.server')
    const { buildDocXlsx } = await import('@/lib/qb/doc-common.server')

    const estId = String(row.estimate_qbo_id)
    const est = (await qboRequest('GET', `/estimate/${estId}?include=enhancedAllCustomFields&minorversion=73`))?.Estimate
    if (!est) return json({ error: 'Quotation no longer exists in QuickBooks' }, 404)
    let trnNo = ''
    const custId = est.CustomerRef?.value
    if (custId) {
      const cust = await qboRequest('GET', `/customer/${custId}?minorversion=73`).catch(() => null)
      trnNo = String(cust?.Customer?.PrimaryTaxIdentifier ?? '')
    }
    const data = transformProforma(est, { trnNo })
    data.party.docNumber = row.doc_number
    const fileName = `Prof Inv ${row.doc_number} ${row.client_name ?? ''}`.trim()
    const pdfBytes = await buildProformaPdf(data)
    const xlsxBytes = buildDocXlsx(data, { title: 'PROFORMA INVOICE', partyLabel: 'TO' })

    // Snapshot the superseded attachments BEFORE uploading the fresh ones.
    const existing = await qboQuery(
      `SELECT * FROM Attachable WHERE AttachableRef.EntityRef.Type = 'Estimate' AND AttachableRef.EntityRef.value = '${estId.replace(/'/g, "''")}'`,
    )
    const old = ((existing?.QueryResponse?.Attachable ?? []) as any[])
      .filter((a) => String(a.FileName ?? '').startsWith(`Prof Inv ${row.doc_number}`))

    const newPdf = await qboUpload(`${fileName}.pdf`, pdfBytes, 'application/pdf', 'Estimate', estId)
    const newXlsx = await qboUpload(`${fileName}.xlsx`, xlsxBytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Estimate', estId)
    const keep = new Set([newPdf?.Id, newXlsx?.Id].filter(Boolean).map(String))
    let removed = 0
    for (const a of old) {
      if (keep.has(String(a.Id))) continue
      try {
        await qboRequest('POST', '/attachable?operation=delete&minorversion=73', {
          Id: String(a.Id), SyncToken: String(a.SyncToken), domain: 'QBO', AttachableRef: a.AttachableRef,
        })
        removed++
      } catch { /* best-effort */ }
    }

    const storagePath = `qbo/profinv/${row.doc_number}.pdf`
    await sb.storage.from('esign-documents').upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })
    await sb.from('qb_proforma_docs').update({ pdf_path: storagePath }).eq('estimate_qbo_id', estId)
    return json({ ok: true, regenerated: fileName, quotationAttachmentsReplaced: true, oldRemoved: removed })
  }

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
