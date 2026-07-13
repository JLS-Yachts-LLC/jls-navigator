/**
 * Sync QBO documents (invoices, pro-formas, estimates) into `qbo_invoices`.
 *
 * - Full sync: everything with TxnDate >= the configured FROM date (default 2026-01-01).
 * - Incremental: only docs changed since the last run (MetaData.LastUpdatedTime).
 * Matches each doc to a vessel via CustomerRef → yachts.qbo_customer_id, extracts line
 * items, computes a payment status, and (best-effort) fetches the QBO-rendered PDF into
 * the esign-documents bucket under qbo/. Runs on a 5-min cron + on Polaris invoice create.
 */
import { createClient } from '@supabase/supabase-js'
import { qboQuery, qboPdf, qboConfigured, qboRealm } from './qbo.server'
import { classifyInvoiceType } from './orchestrator.server'

const FROM_DATE = () => process.env.QBO_SYNC_FROM ?? '2026-01-01'
const BUCKET = 'esign-documents'

// The two QuickBooks companies the Finance module surfaces.
export const JLS_REALM = '9341454112300561'
export const WAYPOINT_REALM = '9341456599242940'
export const SYNC_REALMS = [JLS_REALM, WAYPOINT_REALM]
// qbo_sync_state keeps one row per company (id 1 = JLS, id 2 = Waypoint).
const stateId = (realm: string) => (realm === WAYPOINT_REALM ? 2 : 1)

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

const ql = (s: string) => s.replace(/'/g, "''")

function invoiceStatus(inv: any): string {
  const bal = Number(inv.Balance ?? 0)
  const total = Number(inv.TotalAmt ?? 0)
  if (bal <= 0.005) return 'Paid'
  const due = inv.DueDate ? new Date(inv.DueDate) : null
  if (due && due.getTime() < Date.now()) return 'Overdue'
  if (bal + 0.005 < total) return 'Partial'
  return 'Unpaid'
}

function mapLines(doc: any) {
  return (doc.Line ?? [])
    .filter((l: any) => l.DetailType === 'SalesItemLineDetail')
    .map((l: any) => ({
      item: l.SalesItemLineDetail?.ItemRef?.name ?? null,
      description: l.Description ?? null,
      qty: l.SalesItemLineDetail?.Qty ?? null,
      unitPrice: l.SalesItemLineDetail?.UnitPrice ?? null,
      amount: l.Amount ?? null,
    }))
}

function buildRow(entity: 'Invoice' | 'Estimate', doc: any, yachtByCust: Map<string, string>, realm: string, includeRaw = false) {
  const isEstimate = entity === 'Estimate'
  const docType = isEstimate ? 'estimate' : (classifyInvoiceType(doc) === 'Pro-Forma' ? 'proforma' : 'invoice')
  const custId = String(doc.CustomerRef?.value ?? '')
  return {
    qbo_id: String(doc.Id),
    realm_id: realm,
    doc_type: docType,
    doc_number: doc.DocNumber ?? null,
    txn_date: doc.TxnDate ?? null,
    due_date: (isEstimate ? doc.ExpirationDate : doc.DueDate) ?? null,
    customer_ref: custId || null,
    customer_name: doc.CustomerRef?.name ?? null,
    yacht_id: yachtByCust.get(custId) ?? null,
    total_amt: doc.TotalAmt ?? null,
    balance: doc.Balance ?? null,
    currency: doc.CurrencyRef?.value ?? null,
    status: isEstimate ? (doc.TxnStatus ?? 'Pending') : invoiceStatus(doc),
    line_items: mapLines(doc),
    raw: includeRaw ? doc : null, // full raw only for single-doc sync (too heavy in bulk)
    synced_at: new Date().toISOString(),
  }
}

/** Page through an entity (200/page) and batch-upsert in chunks of 100 — keeps both the
 *  subrequest count and per-request CPU/payload well within Worker limits. */
async function syncEntity(sb: any, entity: 'Invoice' | 'Estimate', where: string, yachtByCust: Map<string, string>, realm: string): Promise<number> {
  let count = 0
  const PAGE = 200
  for (let start = 1; start <= 100000; start += PAGE) {
    const res = await qboQuery(`select * from ${entity} ${where} startposition ${start} maxresults ${PAGE}`, realm)
    const rows = res?.QueryResponse?.[entity] ?? []
    for (let i = 0; i < rows.length; i += 100) {
      const mapped = rows.slice(i, i + 100).map((doc: any) => buildRow(entity, doc, yachtByCust, realm))
      await sb.from('qbo_invoices').upsert(mapped, { onConflict: 'qbo_id,doc_type,realm_id' })
      count += mapped.length
    }
    if (rows.length < PAGE) break
  }
  return count
}

function buildPaymentRow(doc: any, yachtByCust: Map<string, string>, realm: string) {
  const custId = String(doc.CustomerRef?.value ?? '')
  const applied = (doc.Line ?? []).flatMap((l: any) =>
    (l.LinkedTxn ?? []).filter((t: any) => t.TxnType === 'Invoice').map((t: any) => ({ invoice_qbo_id: String(t.TxnId), amount: l.Amount })))
  return {
    qbo_id: String(doc.Id), realm_id: realm, txn_date: doc.TxnDate ?? null,
    customer_ref: custId || null, customer_name: doc.CustomerRef?.name ?? null,
    yacht_id: yachtByCust.get(custId) ?? null,
    total_amt: doc.TotalAmt ?? null, unapplied_amt: doc.UnappliedAmt ?? null,
    currency: doc.CurrencyRef?.value ?? null, applied_to: applied, synced_at: new Date().toISOString(),
  }
}

async function syncPayments(sb: any, where: string, yachtByCust: Map<string, string>, realm: string): Promise<number> {
  let count = 0
  const PAGE = 200
  for (let start = 1; start <= 100000; start += PAGE) {
    const res = await qboQuery(`select * from Payment ${where} startposition ${start} maxresults ${PAGE}`, realm)
    const rows = res?.QueryResponse?.Payment ?? []
    for (let i = 0; i < rows.length; i += 100) {
      const mapped = rows.slice(i, i + 100).map((d: any) => buildPaymentRow(d, yachtByCust, realm))
      await sb.from('qbo_payments').upsert(mapped, { onConflict: 'qbo_id,realm_id' })
      count += mapped.length
    }
    if (rows.length < PAGE) break
  }
  return count
}

async function yachtMap(sb: any): Promise<Map<string, string>> {
  const { data } = await sb.from('yachts').select('id, qbo_customer_id').not('qbo_customer_id', 'is', null)
  return new Map((data ?? []).map((y: any) => [String(y.qbo_customer_id), y.id]))
}

/** Fetch PDFs for up to `limit` documents that don't have one yet (bounded per run,
 *  so historical PDFs trickle in across cron ticks without blowing subrequest limits). */
async function backfillPdfs(sb: any, realm: string, limit = 15): Promise<number> {
  const { data: missing } = await sb.from('qbo_invoices').select('id, qbo_id, doc_type').eq('realm_id', realm).is('pdf_path', null).order('txn_date', { ascending: false }).limit(limit)
  let done = 0
  for (const d of (missing ?? [])) {
    try {
      const ep = d.doc_type === 'estimate' ? 'estimate' : 'invoice'
      const bytes = await qboPdf(`/${ep}/${d.qbo_id}/pdf`, realm)
      const path = `qbo/${d.doc_type}-${d.qbo_id}.pdf`
      await sb.storage.from(BUCKET).upload(path, new Uint8Array(bytes), { contentType: 'application/pdf', upsert: true })
      await sb.from('qbo_invoices').update({ pdf_path: path, pdf_synced_at: new Date().toISOString() }).eq('id', d.id)
      done++
    } catch { /* best-effort; retried next run */ }
  }
  return done
}

/** Full (since FROM_DATE) or incremental (since last run) sync of invoices + estimates.
 *  Document rows land immediately; PDFs are backfilled a few per run by backfillPdfs(). */
export async function syncQboDocuments(opts: { full?: boolean; pdfBatch?: number; realm?: string } = {}) {
  if (!qboConfigured()) throw new Error('QBO not configured')
  const sb = admin() as any
  const realm = opts.realm ?? qboRealm()
  const sid = stateId(realm)

  const { data: state } = await sb.from('qbo_sync_state').select('last_run_at').eq('id', sid).maybeSingle()
  const incremental = !opts.full && !!state?.last_run_at
  // Small overlap so nothing slips between runs.
  const updatedSince = incremental ? new Date(new Date(state.last_run_at).getTime() - 10 * 60_000).toISOString() : null
  const where = updatedSince
    ? `where Metadata.LastUpdatedTime > '${ql(updatedSince)}'`
    : `where TxnDate >= '${ql(FROM_DATE())}'`

  try {
    const yachtByCust = await yachtMap(sb)
    let count = 0
    // Land document rows without blocking on PDFs.
    count += await syncEntity(sb, 'Invoice', where, yachtByCust, realm)
    count += await syncEntity(sb, 'Estimate', where, yachtByCust, realm)
    count += await syncPayments(sb, where, yachtByCust, realm)
    // Skip PDFs on a full backfill (subrequest budget); trickle them in on cron runs.
    const pdfBatch = opts.pdfBatch ?? (opts.full ? 0 : 10)
    const pdfs = pdfBatch > 0 ? await backfillPdfs(sb, realm, pdfBatch) : 0
    await sb.from('qbo_sync_state').upsert({
      id: sid, realm_id: realm, last_run_at: new Date().toISOString(), last_count: count, last_error: null,
      ...(incremental ? {} : { last_full_at: new Date().toISOString() }),
    }, { onConflict: 'id' })
    return { ok: true, realm, count, pdfs, mode: incremental ? 'incremental' : 'full' }
  } catch (e: any) {
    await sb.from('qbo_sync_state').upsert({ id: sid, realm_id: realm, last_run_at: new Date().toISOString(), last_error: String(e?.message ?? e) }, { onConflict: 'id' })
    throw e
  }
}

/** Sync every connected company in turn — used by the cron.
 *  - A company that has never been fully synced (no last_full_at) is imported
 *    via the resumable backfill (a few pages per tick) so a large first import
 *    can't blow the Worker subrequest limit; it flips to incremental once done.
 *  - A company with no tokens (never connected) throws inside the sync; we
 *    swallow that so one unconnected company can't stop the others. */
export async function syncAllRealms(opts: { full?: boolean; pdfBatch?: number } = {}) {
  const sb = admin() as any
  const results: Record<string, unknown> = {}
  for (const realm of SYNC_REALMS) {
    try {
      const { data: st } = await sb.from('qbo_sync_state').select('last_full_at').eq('id', stateId(realm)).maybeSingle()
      results[realm] = st?.last_full_at
        ? await syncQboDocuments({ ...opts, realm })
        : { ok: true, mode: 'backfill', ...(await backfillChunk(false, realm)) }
    } catch (e: any) {
      results[realm] = { ok: false, error: String(e?.message ?? e) }
    }
  }
  return results
}

/** Resumable full backfill: process a few pages per call (cursor in qbo_sync_state),
 *  so a large year of history lands across several invocations without hitting the
 *  Worker subrequest limit. Loop until { done: true }. PDFs trickle in via the cron. */
export async function backfillChunk(reset = false, realm: string = qboRealm()): Promise<{ done: boolean; count: number; cursor: any }> {
  if (!qboConfigured()) throw new Error('QBO not configured')
  const sb = admin() as any
  const MAX_PAGES = 3
  const PAGE = 200
  const sid = stateId(realm)

  const { data: st } = await sb.from('qbo_sync_state').select('backfill_cursor').eq('id', sid).maybeSingle()
  let cursor = (!reset && st?.backfill_cursor) ? st.backfill_cursor : { entity: 'Invoice', start: 1 }
  if (cursor.entity === 'done') return { done: true, count: 0, cursor }

  const yachtByCust = await yachtMap(sb)
  let count = 0
  for (let p = 0; p < MAX_PAGES && cursor.entity !== 'done'; p++) {
    const entity = cursor.entity as 'Invoice' | 'Estimate' | 'Payment'
    const res = await qboQuery(`select * from ${entity} where TxnDate >= '${ql(FROM_DATE())}' startposition ${cursor.start} maxresults ${PAGE}`, realm)
    const rows = res?.QueryResponse?.[entity] ?? []
    for (let i = 0; i < rows.length; i += 100) {
      const slice = rows.slice(i, i + 100)
      if (entity === 'Payment') {
        await sb.from('qbo_payments').upsert(slice.map((d: any) => buildPaymentRow(d, yachtByCust, realm)), { onConflict: 'qbo_id,realm_id' })
      } else {
        await sb.from('qbo_invoices').upsert(slice.map((d: any) => buildRow(entity, d, yachtByCust, realm)), { onConflict: 'qbo_id,doc_type,realm_id' })
      }
      count += slice.length
    }
    // Chain: Invoice -> Estimate -> Payment -> done.
    cursor = rows.length < PAGE
      ? (entity === 'Invoice' ? { entity: 'Estimate', start: 1 } : entity === 'Estimate' ? { entity: 'Payment', start: 1 } : { entity: 'done', start: 0 })
      : { entity, start: cursor.start + PAGE }
  }

  await sb.from('qbo_sync_state').upsert({
    id: sid, realm_id: realm, backfill_cursor: cursor, last_run_at: new Date().toISOString(),
    ...(cursor.entity === 'done' ? { last_full_at: new Date().toISOString() } : {}),
  }, { onConflict: 'id' })
  return { done: cursor.entity === 'done', count, cursor }
}

/** One-shot full backfill of 2026 payments (chunk if it ever hits limits). */
export async function backfillPaymentsFull(realm: string = qboRealm()): Promise<{ count: number }> {
  if (!qboConfigured()) throw new Error('QBO not configured')
  const sb = admin() as any
  const yachtByCust = await yachtMap(sb)
  return { count: await syncPayments(sb, `where TxnDate >= '${ql(FROM_DATE())}'`, yachtByCust, realm) }
}

/** Targeted single-entity ingest for the webhook orchestrator — the changed
 *  document lands in the app seconds after the QBO event instead of waiting for
 *  the 5-minute poll. Purchase orders have no app table yet and are skipped. */
export async function syncOneEntity(entity: string, qboId: string): Promise<string> {
  if (!qboConfigured()) return 'qbo-not-configured'
  const sb = admin() as any
  if (entity === 'invoice') { await syncOneInvoice(qboId); return 'invoice-synced' }
  if (entity === 'estimate') {
    const res = await qboQuery(`select * from Estimate where Id = '${ql(qboId)}'`)
    const doc = res?.QueryResponse?.Estimate?.[0]
    if (!doc) return 'estimate-not-found'
    await sb.from('qbo_invoices').upsert(buildRow('Estimate', doc, await yachtMap(sb), qboRealm(), true), { onConflict: 'qbo_id,doc_type,realm_id' })
    return 'estimate-synced'
  }
  if (entity === 'payment') {
    const res = await qboQuery(`select * from Payment where Id = '${ql(qboId)}'`)
    const doc = res?.QueryResponse?.Payment?.[0]
    if (!doc) return 'payment-not-found'
    await sb.from('qbo_payments').upsert(buildPaymentRow(doc, await yachtMap(sb), qboRealm()), { onConflict: 'qbo_id,realm_id' })
    // A payment changes invoice balances — refresh the invoices it applies to.
    for (const a of (buildPaymentRow(doc, new Map(), qboRealm()).applied_to as any[]).slice(0, 5)) {
      try { await syncOneInvoice(a.invoice_qbo_id) } catch { /* best-effort */ }
    }
    return 'payment-synced'
  }
  return `${entity}-no-native-ingest`
}

/** Pull a single invoice straight away (used when Polaris creates one). Best-effort,
 *  and fetches its PDF immediately so it appears complete in the Finance module. */
export async function syncOneInvoice(qboId: string) {
  if (!qboConfigured()) return
  const sb = admin() as any
  const res = await qboQuery(`select * from Invoice where Id = '${ql(qboId)}'`)
  const doc = res?.QueryResponse?.Invoice?.[0]
  if (!doc) return
  const row = buildRow('Invoice', doc, await yachtMap(sb), qboRealm(), true)
  await sb.from('qbo_invoices').upsert(row, { onConflict: 'qbo_id,doc_type,realm_id' })
  try {
    const bytes = await qboPdf(`/invoice/${doc.Id}/pdf`)
    const path = `qbo/${row.doc_type}-${doc.Id}.pdf`
    await sb.storage.from(BUCKET).upload(path, new Uint8Array(bytes), { contentType: 'application/pdf', upsert: true })
    await sb.from('qbo_invoices').update({ pdf_path: path, pdf_synced_at: new Date().toISOString() })
      .eq('qbo_id', String(doc.Id)).eq('doc_type', row.doc_type).eq('realm_id', qboRealm())
  } catch { /* PDF best-effort */ }
}
