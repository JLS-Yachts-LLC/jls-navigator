/**
 * QuickBooks webhook orchestrator (native port of the n8n "QB (All)" router).
 *
 * Parses an Intuit CloudEvents batch, classifies each entity (invoice / estimate /
 * purchaseorder / payment), and for invoices fetches the doc, runs the doc-number
 * self-heal, and classifies Invoice vs Pro-Forma. Document generation (PDF/OneDrive)
 * is handled by per-entity handlers — built next; until then the webhook forwards
 * to n8n for that step.
 */
import { qboRequest, qboConfigured } from './qbo.server'
import { healInvoiceDocNumber, type HealResult } from './heal.server'
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

/** Process a batch: track each event, and for invoices fetch + heal + classify.
 *  Requires QBO credentials; callers should guard with qboConfigured(). */
export async function orchestrate(raw: string): Promise<OrchestrationItem[]> {
  const events = parseIntuitEvents(raw)
  const results: OrchestrationItem[] = []

  for (const ev of events) {
    const meta = ENTITY_KEY[ev.entity] ?? { key: `qb-${ev.entity}`, name: `QB ${ev.entity}` }
    await logAutomationRun({ key: meta.key, name: meta.name, source: 'worker', trigger_type: 'webhook', category: 'Finance', status: 'hit' })

    const item: OrchestrationItem = { ...ev }
    try {
      if (ev.entity === 'invoice' && qboConfigured()) {
        const fetched = await qboRequest('GET', `/invoice/${ev.entityId}?include=enhancedAllCustomFields&minorversion=73`)
        const invoice = fetched?.Invoice
        if (invoice) {
          item.heal = await healInvoiceDocNumber(invoice)
          // Re-fetch after a heal so downstream classification sees the new number.
          const fresh = item.heal?.action === 'bumped'
            ? (await qboRequest('GET', `/invoice/${ev.entityId}?include=enhancedAllCustomFields&minorversion=73`))?.Invoice ?? invoice
            : invoice
          item.invoiceType = classifyInvoiceType(fresh)

          // Native doc-gen (port of the n8n "QB Invoice" workflow): render the
          // branded PDF and attach it to the QBO invoice. Gated by its own
          // qb-invoice-pdf toggle (default OFF), with an internal attach-echo
          // guard so our own upload never loops the webhook.
          if (item.invoiceType === 'Invoice') {
            const { generateAndAttachInvoicePdf } = await import('./invoice-doc.server')
            const pdfRes = await generateAndAttachInvoicePdf(ev.entityId)
            item.docgen = `${pdfRes.action}${pdfRes.action === 'attached' ? ` (${pdfRes.ms}ms)` : ''}`
            if (pdfRes.action === 'error') item.error = `docgen: ${pdfRes.detail}`
          }
        }
      }
      // Native doc-gen (port of the n8n "QB (Quotation/Estimate)" workflow):
      // render the Quotation PDF + XLSX and attach both to the QBO estimate.
      // Gated by its own qb-estimate-doc toggle (default OFF) with a loop-guard
      // in qbo_doc_logs so our own attachment echoes never re-trigger it.
      if (ev.entity === 'estimate' && qboConfigured()) {
        const { runEstimateDocgen } = await import('./estimate-docgen.server')
        item.docgen = await runEstimateDocgen(ev.entityId, ev.rawType)
      }
      // Pro-Forma doc-gen (port of the n8n "QB (PRO-FORMA)" workflow): a
      // Pro-Forma is an Invoice classified type "2" above. Gated by qb-proforma-doc.
      if (ev.entity === 'invoice' && item.invoiceType === 'Pro-Forma' && qboConfigured()) {
        const { runProformaDocgen } = await import('./proforma-docgen.server')
        item.docgen = await runProformaDocgen(ev.entityId, ev.rawType)
      }
      // Purchase Order doc-gen (port of the n8n "QB (Purchase Order)" workflow).
      // Gated by qb-po-doc.
      if (ev.entity === 'purchaseorder' && qboConfigured()) {
        const { runPurchaseOrderDocgen } = await import('./purchase-order-docgen.server')
        item.docgen = await runPurchaseOrderDocgen(ev.entityId, ev.rawType)
      }
      // Receive Payment → Sales Receipt PDF (port of the n8n "QB (Receive
      // Payment)" workflow). Gated by qb-payment-doc.
      if (ev.entity === 'payment' && qboConfigured()) {
        const { runReceivePaymentDocgen } = await import('./receive-payment-docgen.server')
        item.docgen = await runReceivePaymentDocgen(ev.entityId, ev.rawType)
      }
      // Native ingest: land the changed document in the app's qbo_* tables now,
      // instead of waiting for the 5-minute poll. (Dynamic import — sync.server
      // imports classifyInvoiceType from this module.)
      if (qboConfigured()) {
        const { syncOneEntity } = await import('./sync.server')
        item.ingest = await syncOneEntity(ev.entity, ev.entityId)
      }
    } catch (e: any) {
      item.error = e?.message ?? String(e)
      await logAutomationRun({ key: meta.key, name: meta.name, source: 'worker', trigger_type: 'webhook', category: 'Finance', status: 'error', detail: item.error })
    }
    results.push(item)
  }
  return results
}
