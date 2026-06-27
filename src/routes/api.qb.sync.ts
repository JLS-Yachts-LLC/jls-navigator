/**
 * QBO document sync API (authenticated, bearer).
 *   GET  /api/qb/sync      -> sync state { last_run_at, last_full_at, last_count, last_error }
 *   POST /api/qb/sync {full?:bool} -> run a sync (full = whole year from QBO_SYNC_FROM)
 *   GET  /api/qb/doc-pdf?id=<uuid> -> signed URL for a synced document's PDF
 *
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { syncQboDocuments, backfillChunk, backfillPaymentsFull } from '@/lib/qb/sync.server'
import { qboPdf, qboConfigured } from '@/lib/qb/qbo.server'

const db = () => supabaseAdmin as any
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

async function authed(request: Request): Promise<boolean> {
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return false
  const { data: { user } } = await db().auth.getUser(auth.slice(7))
  return !!user
}

export async function qbSyncHandler(request: Request): Promise<Response> {
  if (!(await authed(request))) return json({ ok: false, error: 'Unauthorized' }, 401)

  if (request.method === 'GET') {
    const { data } = await db().from('qbo_sync_state').select('*').eq('id', 1).maybeSingle()
    return json({ ok: true, state: data ?? null })
  }
  if (request.method === 'POST') {
    let body: any = {}
    try { body = await request.json() } catch { /* empty */ }
    try {
      if (body.paymentsBackfill) {
        const r = await backfillPaymentsFull()
        return json({ ok: true, ...r })
      }
      // Resumable full backfill (loop until done); else an incremental sync.
      if (body.backfill || body.full) {
        const r = await backfillChunk(!!body.full || !!body.reset)
        return json({ ok: true, ...r })
      }
      const r = await syncQboDocuments({})
      return json(r)
    } catch (e: any) {
      return json({ ok: false, error: String(e?.message ?? e) }, 502)
    }
  }
  return json({ ok: false, error: 'Method not allowed' }, 405)
}

export async function qbDocPdfHandler(request: Request): Promise<Response> {
  if (!(await authed(request))) return json({ ok: false, error: 'Unauthorized' }, 401)
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return json({ ok: false, error: 'id required' }, 400)
  const sb = db()
  const { data: doc } = await sb.from('qbo_invoices').select('id, qbo_id, doc_type, doc_number, pdf_path').eq('id', id).maybeSingle()
  if (!doc) return json({ ok: false, error: 'Document not found' }, 404)

  let path = doc.pdf_path as string | null
  // Fetch-on-demand: most historical PDFs aren't pre-fetched — grab it from QBO now.
  if (!path) {
    if (!qboConfigured()) return json({ ok: false, error: 'QuickBooks not connected' }, 503)
    try {
      const ep = doc.doc_type === 'estimate' ? 'estimate' : 'invoice'
      const bytes = await qboPdf(`/${ep}/${doc.qbo_id}/pdf`)
      path = `qbo/${doc.doc_type}-${doc.qbo_id}.pdf`
      await sb.storage.from('esign-documents').upload(path, new Uint8Array(bytes), { contentType: 'application/pdf', upsert: true })
      await sb.from('qbo_invoices').update({ pdf_path: path, pdf_synced_at: new Date().toISOString() }).eq('id', doc.id)
    } catch (e: any) {
      return json({ ok: false, error: `Could not fetch PDF: ${String(e?.message ?? e)}` }, 502)
    }
  }
  // Download with the invoice number as the filename (matches the JLS format).
  const fileName = `${doc.doc_number ?? doc.qbo_id}.pdf`
  const { data: signed } = await sb.storage.from('esign-documents').createSignedUrl(path, 60 * 60, { download: fileName })
  return json({ ok: true, url: signed?.signedUrl ?? null })
}
