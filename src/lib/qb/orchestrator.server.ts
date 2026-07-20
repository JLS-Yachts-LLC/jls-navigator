/**
 * QuickBooks webhook orchestrator (native port of the n8n "QB (All)" router).
 *
 * Parses an Intuit CloudEvents batch, classifies each entity (invoice / estimate /
 * purchaseorder / payment), and for invoices fetches the doc, runs the doc-number
 * self-heal, and classifies Invoice vs Pro-Forma. Document generation (PDF/OneDrive)
 * is handled by per-entity handlers — built next; until then the webhook forwards
 * to n8n for that step.
 */
import { qboRequest, qboConfigured, qboRealm } from './qbo.server'
import { type HealResult } from './heal.server'
import { logAutomationRun } from '@/lib/automations.server'

export type QbEvent = { entity: string; entityId: string; accountId?: string; rawType: string }

const ENTITY_KEY: Record<string, { key: string; name: string }> = {
  invoice:       { key: 'qb-invoice',       name: 'QB Invoice' },
  estimate:      { key: 'qb-estimate',      name: 'QB Estimate' },
  purchaseorder: { key: 'qb-purchaseorder', name: 'QB Purchase Order' },
  payment:       { key: 'qb-payment',       name: 'QB Receive Payment' },
}

/** Parse an Intuit CloudEvents batch (handles the {data:"<json>"} wrapper, a bare
 *  array, or the legacy eventNotifications shape). */
export function parseIntuitEvents(raw: string): QbEvent[] {
  let body: any
  try { body = JSON.parse(raw) } catch { return [] }

  let events: any[] = []
  if (typeof body?.data === 'string') { try { events = JSON.parse(body.data) } catch { /* */ } }
  else if (Array.isArray(body)) events = body
  else if (Array.isArray(body?.data)) events = body.data
  else if (Array.isArray(body?.eventNotifications)) {
    for (const n of body.eventNotifications) {
      for (const e of n?.dataChangeEvent?.entities ?? []) {
        events.push({ type: `qbo.${String(e.name ?? '').toLowerCase()}.${String(e.operation ?? '').toLowerCase()}`, intuitentityid: e.id, intuitaccountid: n.realmId })
      }
    }
  }

  const out: QbEvent[] = []
  for (const e of events) {
    const t = String(e?.type ?? '').toLowerCase()      // e.g. "qbo.invoice.updated.v1"
    const m = t.match(/qbo\.([a-z]+)\./)
    const entity = m ? m[1] : (e?.name ? String(e.name).toLowerCase() : 'unknown')
    if (e?.intuitentityid) out.push({ entity, entityId: String(e.intuitentityid), accountId: e.intuitaccountid ? String(e.intuitaccountid) : undefined, rawType: t })
  }
  return out
}

/** Invoice custom field "2" = Pro-Forma, else Invoice (port of the n8n Code node). */
export function classifyInvoiceType(invoice: any): 'Invoice' | 'Pro-Forma' {
  const sv = invoice?.CustomField?.[0]?.StringValue
  return sv === '2' ? 'Pro-Forma' : 'Invoice'
}

export type OrchestrationItem = QbEvent & { invoiceType?: 'Invoice' | 'Pro-Forma'; heal?: HealResult; ingest?: string; docgen?: string; error?: string }

/** QBO returns 400/404 "Object Not Found" (fault code 610) for a deleted or
 *  inactivated entity — e.g. a `.delete`/`.merge` webhook, or a doc removed before
 *  we processed the event. Such an event can NEVER succeed, so it must be skipped,
 *  not errored: otherwise one dead entity fails the whole batch, the handler returns
 *  500, and Intuit re-delivers the same batch forever (re-firing every sibling event
 *  on each retry). */
function isDeletedObjectError(msg: string): boolean {
  return /object not found/i.test(msg) || /"code":\s*"?610"?/.test(msg) || /→\s*40[04]\b/.test(msg)
}

/** Process a batch: track each event, and for invoices fetch + heal + classify.
 *  Requires QBO credentials; callers should guard with qboConfigured(). */
export async function orchestrate(raw: string): Promise<OrchestrationItem[]> {
  const events = parseIntuitEvents(raw)
  const results: OrchestrationItem[] = []

  for (const ev of events) {
    const meta = ENTITY_KEY[ev.entity] ?? { key: `qb-${ev.entity}`, name: `QB ${ev.entity}` }
    await logAutomationRun({ key: meta.key, name: meta.name, source: 'worker', trigger_type: 'webhook', category: 'Finance', status: 'hit' })

    const item: OrchestrationItem = { ...ev }

    // Thread the event's OWN realm through every QBO call. The single webhook URL
    // receives events for BOTH connected companies (JLS + the Waypoint retail
    // realm); querying a Waypoint invoice id against the default JLS realm returns
    // "Object Not Found" and used to fail the whole batch. `accountId` is the realm
    // Intuit stamped on the event; fall back to the default (JLS) realm.
    const realm = ev.accountId ?? qboRealm()
    // The branded document templates (Invoice/Quotation/Pro-Forma/PO/Receipt) are
    // JLS-specific and attach via the JLS realm — only run doc-gen for the primary
    // realm. Secondary realms (Waypoint retail) get ingest only.
    const isPrimaryRealm = realm === qboRealm()

    // A delete/merge event can't be fetched (the object is gone) and never needs a
    // document generated — skip it cleanly so it can't poison the batch. (Any other
    // "Object Not Found" is caught below.)
    if (/\.(delete|merge)\b/.test(ev.rawType)) {
      item.docgen = 'skipped (deleted)'
      results.push(item)
      continue
    }

    // Per-entity lock: when Intuit dumps a backlog, several concurrent invocations
    // carry events for the SAME document — processing it once is enough (we always
    // fetch its current state), and processing it many times in parallel causes
    // 429 rate-limit storms. Skipping while another invocation holds the lock is
    // safe: the holder does the full job, and the 5-min backstop mops up any gap.
    const { tryEntityLock, releaseEntityLock } = await import('./locks.server')
    const lockKey = `${realm}:${ev.entity}:${ev.entityId}`
    if (!(await tryEntityLock(lockKey))) {
      item.docgen = 'skipped (already processing)'
      results.push(item)
      continue
    }

    try {
      if (ev.entity === 'invoice' && qboConfigured()) {
        const fetched = await qboRequest('GET', `/invoice/${ev.entityId}?include=enhancedAllCustomFields&minorversion=73`, undefined, realm)
        const invoice = fetched?.Invoice
        if (invoice) {
          // TEMP DIAGNOSTIC: record the exact CustomField order/values so we can
          // confirm which field drives Pro-Forma classification (CustomField[0]).
          try {
            const cf = (invoice.CustomField ?? []).map((f: any, i: number) =>
              `[${i}] ${f.Name ?? '?'}(def ${f.DefinitionId ?? '?'})=${JSON.stringify(f.StringValue ?? f.NumberValue ?? null)}`)
            await logAutomationRun({
              key: 'qb-customfield-debug', name: 'QB CustomField (debug)', source: 'worker', trigger_type: 'event', category: 'Finance',
              status: 'success', detail: `Invoice ${invoice.DocNumber ?? ev.entityId}: ${cf.join(' | ') || '(no custom fields)'}`,
            })
          } catch { /* debug only */ }

          // Doc-number self-heal is DISABLED for now: it wrote back to the invoice,
          // which re-triggered the webhook and caused a processing loop. Classify
          // straight from the fetched invoice instead.
          item.invoiceType = classifyInvoiceType(invoice)

          // Native doc-gen (port of the n8n "QB Invoice" workflow): render the
          // branded PDF and attach it to the QBO invoice. Gated by its own
          // qb-invoice-pdf toggle (default OFF), with an internal attach-echo
          // guard so our own upload never loops the webhook.
          if (item.invoiceType === 'Invoice' && isPrimaryRealm) {
            const { generateAndAttachInvoicePdf } = await import('./invoice-doc.server')
            const pdfRes = await generateAndAttachInvoicePdf(ev.entityId)
            item.docgen = `${pdfRes.action}${pdfRes.action === 'attached' ? ` (${pdfRes.ms}ms)` : ''}`
            if (pdfRes.action === 'error') item.error = `docgen: ${pdfRes.detail}`
          } else if (item.invoiceType === 'Invoice') {
            item.docgen = 'skipped (secondary realm)'
          }
        }
      }
      // Native doc-gen (port of the n8n "QB (Quotation/Estimate)" workflow):
      // render the Quotation PDF + XLSX and attach both to the QBO estimate.
      // Gated by its own qb-estimate-doc toggle (default OFF) with a loop-guard
      // in qbo_doc_logs so our own attachment echoes never re-trigger it.
      if (ev.entity === 'estimate' && qboConfigured() && isPrimaryRealm) {
        const { runEstimateDocgen } = await import('./estimate-docgen.server')
        item.docgen = await runEstimateDocgen(ev.entityId, ev.rawType)
      }
      // RETIRED (2026-07-20, Matt's decision): the custom-field Pro-Forma trigger
      // (invoice CustomField='2' → runProformaDocgen) is replaced by the Sales
      // Order flow — a quotation marked Accepted generates "Prof Inv NNNN-YY
      // Client" via maybeSalesOrderProforma in estimate-docgen. Classification
      // (invoiceType/doc_type='proforma') is kept for Finance history.
      // Purchase Order doc-gen (port of the n8n "QB (Purchase Order)" workflow).
      // Gated by qb-po-doc.
      if (ev.entity === 'purchaseorder' && qboConfigured() && isPrimaryRealm) {
        const { runPurchaseOrderDocgen } = await import('./purchase-order-docgen.server')
        item.docgen = await runPurchaseOrderDocgen(ev.entityId, ev.rawType)
      }
      // Receive Payment → Sales Receipt PDF (port of the n8n "QB (Receive
      // Payment)" workflow). Gated by qb-payment-doc.
      if (ev.entity === 'payment' && qboConfigured() && isPrimaryRealm) {
        const { runReceivePaymentDocgen } = await import('./receive-payment-docgen.server')
        item.docgen = await runReceivePaymentDocgen(ev.entityId, ev.rawType)
      }
      // Native ingest: land the changed document in the app's qbo_* tables now,
      // instead of waiting for the 5-minute poll. (Dynamic import — sync.server
      // imports classifyInvoiceType from this module.) Runs for BOTH realms.
      if (qboConfigured()) {
        const { syncOneEntity } = await import('./sync.server')
        item.ingest = await syncOneEntity(ev.entity, ev.entityId, realm)
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      if (isDeletedObjectError(msg)) {
        // Terminal, not a failure — skip so it doesn't force a 500 + retry storm.
        item.docgen = 'skipped (deleted/inactive)'
      } else {
        item.error = msg
        await logAutomationRun({ key: meta.key, name: meta.name, source: 'worker', trigger_type: 'webhook', category: 'Finance', status: 'error', detail: item.error })
      }
    } finally {
      await releaseEntityLock(lockKey).catch(() => { /* stale locks self-expire */ })
    }
    results.push(item)
  }
  return results
}
