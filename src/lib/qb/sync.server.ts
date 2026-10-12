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
import { qboQuery, qboRequest, qboPdf, qboConfigured, qboRealm } from './qbo.server'
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

/** QBO keeps a voided invoice as a zero-value document whose private note reads
 *  "Voided" — it would otherwise count as Paid. */
function isVoided(doc: any): boolean {
  return Number(doc.TotalAmt ?? 0) === 0 && /^\s*voided\b/i.test(String(doc.PrivateNote ?? ''))
}

function invoiceStatus(inv: any): string {
  if (isVoided(inv)) return 'Voided'
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
    // The document is live in QBO, so it is not deleted (clears a stale soft-delete).
    deleted_at: null,
    deleted_reason: null,
  }
}

// ── Deletions ────────────────────────────────────────────────────────────────
// QBO deletes are soft-deleted in the mirror (deleted_at), never removed: the
// rows are the audit trail of what disappeared, and every reader filters them.

type DocEntity = 'Invoice' | 'Estimate'
/** The mirror doc_types a QBO entity can be stored under (an Invoice is either). */
const ENTITY_DOC_TYPES: Record<DocEntity, string[]> = { Invoice: ['invoice', 'proforma'], Estimate: ['estimate'] }

/** Soft-delete mirror rows for QBO documents that no longer exist. Returns how
 *  many rows were newly marked. */
async function markQboDeleted(sb: any, realm: string, entity: DocEntity, ids: string[], reason: string): Promise<number> {
  let n = 0
  const now = new Date().toISOString()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('qbo_invoices')
      .update({ deleted_at: now, deleted_reason: reason })
      .eq('realm_id', realm).in('doc_type', ENTITY_DOC_TYPES[entity]).in('qbo_id', ids.slice(i, i + 200))
      .is('deleted_at', null).select('id')
    if (error) throw new Error(`qbo_invoices soft-delete failed: ${error.message}`)
    n += data?.length ?? 0
  }
  return n
}

/** Webhook entry point: a QBO Delete event for an invoice / estimate. */
export async function markEntityDeleted(entity: string, qboId: string, realm: string = qboRealm()): Promise<string> {
  const e: DocEntity | null = entity === 'invoice' ? 'Invoice' : entity === 'estimate' ? 'Estimate' : null
  if (!e) return `${entity}-delete-ignored`
  const n = await markQboDeleted(admin() as any, realm, e, [qboId], 'qbo-webhook')
  return n ? `${entity}-deleted` : `${entity}-delete-noop`
}

/** Change Data Capture pass: QBO's /cdc returns documents deleted since a point in
 *  time (status "Deleted") — the only way to see a delete through the API, since a
 *  query never returns it. Covers deletes whose webhook was lost. CDC looks back at
 *  most 30 days; anything older is left to the daily reconcile. */
async function cdcDeletions(sb: any, realm: string, since: string): Promise<number> {
  const floor = Date.now() - 29 * 86400_000
  const changedSince = new Date(Math.max(new Date(since).getTime(), floor)).toISOString()
  const res = await qboRequest('GET', `/cdc?entities=Invoice,Estimate&changedSince=${encodeURIComponent(changedSince)}&minorversion=73`, undefined, realm)
  let n = 0
  for (const qr of res?.CDCResponse?.[0]?.QueryResponse ?? []) {
    for (const entity of ['Invoice', 'Estimate'] as const) {
      const deleted = (qr?.[entity] ?? []).filter((d: any) => d?.status === 'Deleted' && d?.Id != null).map((d: any) => String(d.Id))
      if (deleted.length) n += await markQboDeleted(sb, realm, entity, deleted, 'qbo-cdc')
    }
  }
  return n
}

/** Page through an entity (200/page) and batch-upsert in chunks of 100 — keeps both the
 *  subrequest count and per-request CPU/payload well within Worker limits. */
async function syncEntity(sb: any, entity: 'Invoice' | 'Estimate', where: string, yachtByCust: Map<string, string>, realm: string, changed?: ChangedDoc[]): Promise<number> {
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
    if (changed) for (const doc of rows) changed.push({ id: String(doc.Id), docType: entity === 'Estimate' ? 'estimate' : (classifyInvoiceType(doc) === 'Pro-Forma' ? 'proforma' : 'invoice') })
    if (rows.length < PAGE) break
  }
  return count
}

// A document the incremental sync saw change — fed to the doc-gen backstop.
type ChangedDoc = { id: string; docType: string }

/** Doc-gen backstop (JLS only): run the SAME per-document generation the webhook
 *  would, for every document the 5-minute incremental sync saw change. This makes
 *  branded PDFs completely INDEPENDENT of Intuit webhook delivery — even if Intuit
 *  suspends the webhook (as it does after repeated endpoint failures), every
 *  changed document still gets its PDF within ~5 minutes. Loop-safe: each doc-gen
 *  records the post-attach LastUpdatedTime, so re-seeing its own attach echo (or
 *  re-processing after a webhook already handled it) is a cheap no-op skip. */
async function docgenBackstop(changed: ChangedDoc[]): Promise<string[]> {
  const out: string[] = []
  const CAP = 8 // subrequest budget per tick; the 10-min overlap re-offers stragglers
  for (const d of changed.slice(0, CAP)) {
    try {
      if (d.docType === 'invoice') {
        const { generateAndAttachInvoicePdf } = await import('./invoice-doc.server')
        const r = await generateAndAttachInvoicePdf(d.id)
        if (r.action !== 'skipped' && r.action !== 'disabled') out.push(`invoice ${d.id}: ${r.action}`)
      } else if (d.docType === 'proforma') {
        // RETIRED trigger (2026-07-20): custom-field pro-formas no longer generate
        // documents — the Sales Order flow (quotation Accepted) replaced it.
      } else if (d.docType === 'estimate') {
        const { runEstimateDocgen } = await import('./estimate-docgen.server')
        const r = await runEstimateDocgen(d.id, 'qbo.estimate.update.sync-backstop')
        if (!r.startsWith('skip') && !r.startsWith('docgen-disabled')) out.push(`estimate ${d.id}: ${r}`)
      }
    } catch (e: any) {
      out.push(`${d.docType} ${d.id}: ERR ${String(e?.message ?? e).slice(0, 200)}`)
    }
  }
  return out
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

/** Customer id → vessel, for ONE QuickBooks company. Customer ids are only unique
 *  within a company: yachts.qbo_customer_id is the JLS customer, and a vessel's
 *  customers in other companies (Waypoint…) are in yacht_qbo_accounts. Matching
 *  another company's documents against the JLS ids used to file them on whichever
 *  vessel happened to share the number. */
async function yachtMap(sb: any, realm: string): Promise<Map<string, string>> {
  if (realm === qboRealm()) {
    const { data } = await sb.from('yachts').select('id, qbo_customer_id').not('qbo_customer_id', 'is', null)
    return new Map((data ?? []).map((y: any) => [String(y.qbo_customer_id), y.id]))
  }
  const { data } = await sb.from('yacht_qbo_accounts').select('yacht_id, customer_id').eq('realm_id', realm)
  return new Map((data ?? []).map((a: any) => [String(a.customer_id), a.yacht_id]))
}

/** Fetch PDFs for up to `limit` documents that don't have one yet (bounded per run,
 *  so historical PDFs trickle in across cron ticks without blowing subrequest limits). */
async function backfillPdfs(sb: any, realm: string, limit = 15): Promise<number> {
  const { data: missing } = await sb.from('qbo_invoices').select('id, qbo_id, doc_type').eq('realm_id', realm).is('pdf_path', null).is('deleted_at', null).order('txn_date', { ascending: false }).limit(limit)
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

  const { data: state } = await sb.from('qbo_sync_state').select('last_run_at, last_cdc_at').eq('id', sid).maybeSingle()
  const runStartedAt = new Date().toISOString()
  const incremental = !opts.full && !!state?.last_run_at
  // Small overlap so nothing slips between runs.
  const updatedSince = incremental ? new Date(new Date(state.last_run_at).getTime() - 10 * 60_000).toISOString() : null
  const where = updatedSince
    ? `where Metadata.LastUpdatedTime > '${ql(updatedSince)}'`
    : `where TxnDate >= '${ql(FROM_DATE())}'`

  try {
    const yachtByCust = await yachtMap(sb, realm)
    let count = 0
    // Collect what changed (incremental JLS runs only) for the doc-gen backstop.
    const changed: ChangedDoc[] | undefined = incremental && realm === JLS_REALM ? [] : undefined
    // Land document rows without blocking on PDFs.
    count += await syncEntity(sb, 'Invoice', where, yachtByCust, realm, changed)
    count += await syncEntity(sb, 'Estimate', where, yachtByCust, realm, changed)
    count += await syncPayments(sb, where, yachtByCust, realm)
    // Deletions: a query never returns a deleted document, so ask CDC for them.
    // Cursor = last successful CDC pass (minus the overlap), so a failed pass is
    // retried next tick instead of losing its window.
    let deleted = 0
    let cdcOk = false
    if (incremental) {
      const cdcFrom = state?.last_cdc_at ? new Date(new Date(state.last_cdc_at).getTime() - 10 * 60_000).toISOString() : updatedSince!
      try { deleted = await cdcDeletions(sb, realm, cdcFrom); cdcOk = true }
      catch (e: any) { console.error(`[qbo-sync] CDC deletions (${realm}) failed:`, e?.message ?? e) }
    }
    // Doc-gen backstop: branded PDFs no longer depend on webhook delivery.
    let docgen: string[] = []
    if (changed?.length) {
      docgen = await docgenBackstop(changed)
      if (docgen.length) {
        const { logAutomationRun } = await import('@/lib/automations.server')
        await logAutomationRun({
          key: 'qb-docgen-backstop', name: 'QB Doc-Gen Backstop (5-min sync)', source: 'worker', trigger_type: 'schedule', category: 'Finance',
          status: docgen.some(s => s.includes('ERR')) ? 'error' : 'success',
          detail: docgen.join('; ').slice(0, 1900),
        })
      }
    }
    // Skip PDFs on a full backfill (subrequest budget); trickle them in on cron runs.
    const pdfBatch = opts.pdfBatch ?? (opts.full ? 0 : 10)
    const pdfs = pdfBatch > 0 ? await backfillPdfs(sb, realm, pdfBatch) : 0
    await sb.from('qbo_sync_state').upsert({
      id: sid, realm_id: realm, last_run_at: new Date().toISOString(), last_count: count, last_error: null,
      ...(incremental ? {} : { last_full_at: new Date().toISOString() }),
      ...(cdcOk ? { last_cdc_at: runStartedAt } : {}),
    }, { onConflict: 'id' })
    return { ok: true, realm, count, deleted: deleted || undefined, pdfs, docgen: docgen.length || undefined, mode: incremental ? 'incremental' : 'full' }
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

  const yachtByCust = await yachtMap(sb, realm)
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
  const yachtByCust = await yachtMap(sb, realm)
  return { count: await syncPayments(sb, `where TxnDate >= '${ql(FROM_DATE())}'`, yachtByCust, realm) }
}

/** Targeted single-entity ingest for the webhook orchestrator — the changed
 *  document lands in the app seconds after the QBO event instead of waiting for
 *  the 5-minute poll. Purchase orders have no app table yet and are skipped. */
export async function syncOneEntity(entity: string, qboId: string, realm: string = qboRealm()): Promise<string> {
  if (!qboConfigured()) return 'qbo-not-configured'
  const sb = admin() as any
  if (entity === 'invoice') { await syncOneInvoice(qboId, realm); return 'invoice-synced' }
  if (entity === 'estimate') {
    const res = await qboQuery(`select * from Estimate where Id = '${ql(qboId)}'`, realm)
    const doc = res?.QueryResponse?.Estimate?.[0]
    if (!doc) { await markQboDeleted(sb, realm, 'Estimate', [qboId], 'qbo-not-found'); return 'estimate-not-found' }
    await sb.from('qbo_invoices').upsert(buildRow('Estimate', doc, await yachtMap(sb, realm), realm, true), { onConflict: 'qbo_id,doc_type,realm_id' })
    return 'estimate-synced'
  }
  if (entity === 'payment') {
    const res = await qboQuery(`select * from Payment where Id = '${ql(qboId)}'`, realm)
    const doc = res?.QueryResponse?.Payment?.[0]
    if (!doc) return 'payment-not-found'
    await sb.from('qbo_payments').upsert(buildPaymentRow(doc, await yachtMap(sb, realm), realm), { onConflict: 'qbo_id,realm_id' })
    // A payment changes invoice balances — refresh the invoices it applies to.
    for (const a of (buildPaymentRow(doc, new Map(), realm).applied_to as any[]).slice(0, 5)) {
      try { await syncOneInvoice(a.invoice_qbo_id, realm) } catch { /* best-effort */ }
    }
    return 'payment-synced'
  }
  return `${entity}-no-native-ingest`
}

/** Pull a single invoice straight away (used when Polaris creates one). Best-effort,
 *  and fetches its PDF immediately so it appears complete in the Finance module. */
export async function syncOneInvoice(qboId: string, realm: string = qboRealm()) {
  if (!qboConfigured()) return
  const sb = admin() as any
  const res = await qboQuery(`select * from Invoice where Id = '${ql(qboId)}'`, realm)
  const doc = res?.QueryResponse?.Invoice?.[0]
  if (!doc) { await markQboDeleted(sb, realm, 'Invoice', [qboId], 'qbo-not-found'); return }
  const row = buildRow('Invoice', doc, await yachtMap(sb, realm), realm, true)
  await sb.from('qbo_invoices').upsert(row, { onConflict: 'qbo_id,doc_type,realm_id' })
  try {
    const bytes = await qboPdf(`/invoice/${doc.Id}/pdf`, realm)
    const path = `qbo/${row.doc_type}-${doc.Id}.pdf`
    await sb.storage.from(BUCKET).upload(path, new Uint8Array(bytes), { contentType: 'application/pdf', upsert: true })
    await sb.from('qbo_invoices').update({ pdf_path: path, pdf_synced_at: new Date().toISOString() })
      .eq('qbo_id', String(doc.Id)).eq('doc_type', row.doc_type).eq('realm_id', realm)
  } catch { /* PDF best-effort */ }
}

// ── Reconcile ────────────────────────────────────────────────────────────────
// Webhooks and CDC catch deletes as they happen; this pass catches everything
// they missed (deletes before the webhook existed, past CDC's 30-day window, or
// lost events) by comparing the full ID lists of QBO and the mirror.

const DOC_ENTITIES: DocEntity[] = ['Invoice', 'Estimate']

export type ReconcileReport = {
  realm: string
  apply: boolean
  ranAt: string
  live: Record<DocEntity, number>        // documents in QBO
  mirror: number                         // mirror rows not soft-deleted
  stale: number                          // mirror rows whose document no longer exists in QBO
  staleIds: Record<DocEntity, string[]>
  missing: number                        // live documents inside the sync window absent from the mirror
  revived: number                        // soft-deleted rows whose document exists in QBO again
  outOfScope: number                     // live documents older than the sync window, not mirrored (left alone)
  deleted: number                        // rows soft-deleted by this run
  added: number                          // rows fetched + upserted by this run
  remaining: number                      // fetches left over for the next run (per-run cap)
  blocked?: string                       // why deletions were NOT applied
}

/** Every live document id (→ TxnDate) of one entity, plus QBO's own count so a
 *  listing that shifted mid-scan can be detected. */
async function liveDocIds(entity: DocEntity, realm: string): Promise<{ ids: Map<string, string | null>; expected: number }> {
  const countRes = await qboQuery(`select count(*) from ${entity}`, realm)
  const expected = Number(countRes?.QueryResponse?.totalCount ?? -1)
  const ids = new Map<string, string | null>()
  const PAGE = 1000
  for (let start = 1; start <= 500000; start += PAGE) {
    const res = await qboQuery(`select Id, TxnDate from ${entity} startposition ${start} maxresults ${PAGE}`, realm)
    const rows = res?.QueryResponse?.[entity] ?? []
    for (const d of rows) ids.set(String(d.Id), d.TxnDate ?? null)
    if (rows.length < PAGE) break
  }
  return { ids, expected }
}

/** Compare QBO's document IDs with the mirror for one company and fix the drift:
 *  soft-delete rows whose document is gone, and fetch documents (inside the sync
 *  window) the mirror is missing or had wrongly marked deleted. Dry run unless
 *  `apply`. Deletions are refused when the QBO listing looks incomplete, or when
 *  they exceed max(25, 10% of the mirror) unless `force` — a bad QBO response
 *  must never empty the mirror. */
export async function reconcileQboDocuments(opts: { realm?: string; apply?: boolean; force?: boolean; fetchCap?: number } = {}): Promise<ReconcileReport> {
  if (!qboConfigured()) throw new Error('QBO not configured')
  const sb = admin() as any
  const realm = opts.realm ?? qboRealm()
  const apply = !!opts.apply
  const from = FROM_DATE()

  const live = { Invoice: await liveDocIds('Invoice', realm), Estimate: await liveDocIds('Estimate', realm) }

  const rows: { qbo_id: string; doc_type: string; deleted_at: string | null }[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from('qbo_invoices').select('qbo_id, doc_type, deleted_at')
      .eq('realm_id', realm).order('id').range(off, off + 999)
    if (error) throw new Error(`qbo_invoices read failed: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }

  const stale = { Invoice: new Set<string>(), Estimate: new Set<string>() }
  const mirrored = { Invoice: new Set<string>(), Estimate: new Set<string>() }
  const toFetch = { Invoice: new Set<string>(), Estimate: new Set<string>() }
  let mirror = 0
  for (const r of rows) {
    const e: DocEntity = r.doc_type === 'estimate' ? 'Estimate' : 'Invoice'
    const isLive = live[e].ids.has(r.qbo_id)
    if (!r.deleted_at) {
      mirror++
      mirrored[e].add(r.qbo_id)
      if (!isLive) stale[e].add(r.qbo_id)
    } else if (isLive) {
      toFetch[e].add(r.qbo_id)
    }
  }
  let revived = 0
  for (const e of DOC_ENTITIES) for (const id of toFetch[e]) if (!mirrored[e].has(id)) revived++; else toFetch[e].delete(id)
  let missing = 0, outOfScope = 0
  for (const e of DOC_ENTITIES) {
    for (const [id, txn] of live[e].ids) {
      if (mirrored[e].has(id) || toFetch[e].has(id)) continue
      if (txn && txn < from) { outOfScope++; continue }
      missing++
      toFetch[e].add(id)
    }
  }

  const staleCount = stale.Invoice.size + stale.Estimate.size
  let blocked: string | undefined
  for (const e of DOC_ENTITIES) {
    if (live[e].expected < 0 || live[e].ids.size !== live[e].expected) {
      blocked = `QBO ${e} list incomplete (${live[e].ids.size} listed, ${live[e].expected} counted) — documents changed during the scan; retry`
    }
  }
  const limit = Math.max(25, Math.round(mirror * 0.1))
  if (!blocked && staleCount > limit && !opts.force) {
    blocked = `${staleCount} documents to remove is over the safety limit of ${limit} — review the dry run, then re-run with force`
  }

  let deleted = 0, added = 0
  let remaining = toFetch.Invoice.size + toFetch.Estimate.size
  if (apply) {
    if (!blocked) for (const e of DOC_ENTITIES) deleted += await markQboDeleted(sb, realm, e, [...stale[e]], 'qbo-reconcile')
    const yachtByCust = await yachtMap(sb, realm)
    let budget = opts.fetchCap ?? 500
    for (const e of DOC_ENTITIES) {
      const take = [...toFetch[e]].slice(0, Math.max(0, budget))
      budget -= take.length
      for (let i = 0; i < take.length; i += 50) {
        const inList = take.slice(i, i + 50).map((id) => `'${ql(id)}'`).join(',')
        const res = await qboQuery(`select * from ${e} where Id in (${inList}) maxresults 50`, realm)
        const docs = res?.QueryResponse?.[e] ?? []
        if (!docs.length) continue
        const { error } = await sb.from('qbo_invoices').upsert(docs.map((d: any) => buildRow(e, d, yachtByCust, realm)), { onConflict: 'qbo_id,doc_type,realm_id' })
        if (error) throw new Error(`qbo_invoices upsert failed: ${error.message}`)
        added += docs.length
      }
      remaining -= take.length
    }
  }

  const report: ReconcileReport = {
    realm, apply, ranAt: new Date().toISOString(),
    live: { Invoice: live.Invoice.ids.size, Estimate: live.Estimate.ids.size },
    mirror, stale: staleCount,
    staleIds: { Invoice: [...stale.Invoice], Estimate: [...stale.Estimate] },
    missing, revived, outOfScope, deleted, added, remaining, blocked,
  }
  await sb.from('qbo_sync_state').upsert({
    id: stateId(realm), realm_id: realm, last_reconcile_at: report.ranAt,
    last_reconcile: { ...report, staleIds: { Invoice: report.staleIds.Invoice.slice(0, 1000), Estimate: report.staleIds.Estimate.slice(0, 1000) } },
  }, { onConflict: 'id' })
  return report
}

/** Daily cron: reconcile and fix every connected company (guards stay on). */
export async function reconcileAllRealms(): Promise<Record<string, unknown>> {
  const { logAutomationRun } = await import('@/lib/automations.server')
  const results: Record<string, unknown> = {}
  for (const realm of SYNC_REALMS) {
    try {
      const r = await reconcileQboDocuments({ realm, apply: true })
      const { staleIds: _ids, ...summary } = r
      results[realm] = summary
    } catch (e: any) {
      results[realm] = { ok: false, error: String(e?.message ?? e) }
    }
  }
  const failed = Object.values(results).some((r: any) => r?.ok === false || r?.blocked)
  await logAutomationRun({
    key: 'qb-reconcile', name: 'QB Reconcile (daily ID check)', source: 'worker', trigger_type: 'schedule', category: 'Finance',
    status: failed ? 'error' : 'success', detail: JSON.stringify(results).slice(0, 1900),
  })
  return results
}
