/**
 * Create QuickBooks Online invoices from app data (worker / edge runtime).
 *
 * Mirrors the proven n8n recipe (Lightspeed -> QBO - Multiple Invoices): each line is a
 * SalesItemLineDetail that references an EXISTING QBO Item by `ItemRef.value`, resolved
 * live (`SELECT * FROM Item WHERE Name = '...'`). If a service has no matching QBO Item we
 * REFUSE to invoice rather than inventing a line — so generated invoices always adhere to
 * the Item Lines already set up in QuickBooks.
 *
 * Customer is resolved from the yacht's stored `qbo_customer_id`, falling back to a
 * DisplayName lookup by vessel name (and the resolved id is persisted back to the yacht).
 * VAT is applied per line via TaxCodeRef (the JLS realm's codes differ from the retail
 * realm, so they're configurable via env / the catalog `tax_code`).
 *
 * Invoice numbering is left to QBO (no DocNumber sent); the assigned DocNumber is read back
 * as the invoice reference. Creating an invoice fires the Intuit webhook -> existing n8n
 * "QB Invoice" doc-gen flow, which produces the branded PDF — the app needn't render it.
 */
import { createClient } from '@supabase/supabase-js'
import { qboRequest, qboQuery, qboConfigured, qboRealm } from './qbo.server'

// Default VAT codes. NOTE: TaxCode ids are realm-specific — confirm against the JLS realm
// (9341454112300561) and override per-item via qbo_item_map.tax_code or these env vars.
const DEFAULT_VAT_TAXCODE = () => process.env.QBO_VAT_TAXCODE ?? '13' // standard 5% (Dubai)
const ZERO_TAXCODE = () => process.env.QBO_ZERO_TAXCODE ?? '3'        // zero-rated
// Optional custom-field id for "Place of Supply" (DefinitionId on the QBO invoice form).
const PLACE_OF_SUPPLY_FIELD_ID = () => process.env.QBO_PLACE_OF_SUPPLY_FIELD_ID ?? ''

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  })
}

const round2 = (n: number) => Math.round(n * 100) / 100
/** Escape single quotes for a QBO query string literal. */
const ql = (s: string) => s.replace(/'/g, "''")

export class InvoiceError extends Error {
  code: string
  constructor(code: string, message: string) { super(message); this.code = code }
}

export type LineSpec = {
  /** Exact QBO Item Name to resolve (the source of truth). */
  itemName: string
  /** Quantity (e.g. number of crew on this line). */
  qty: number
  /** Optional unit price override (AED); falls back to catalog then QBO Item.UnitPrice. */
  unitPrice?: number
  /** Optional extra description lines (e.g. crew names). */
  detailLines?: string[]
  /** Optional QBO TaxCodeRef value; falls back to catalog tax_code then the env default. */
  taxCode?: string
}

type ResolvedItem = { Id: string; Name: string; UnitPrice?: number }

/** Resolve a QBO Item by exact name. Returns null if not found. */
export async function findQboItem(name: string): Promise<ResolvedItem | null> {
  const res = await qboQuery(`SELECT Id, Name, UnitPrice, Type FROM Item WHERE Name = '${ql(name)}'`)
  const item = res?.QueryResponse?.Item?.[0]
  return item ? { Id: item.Id, Name: item.Name, UnitPrice: item.UnitPrice } : null
}

/** Resolve a QBO Customer by exact DisplayName. Returns null if not found. */
export async function findQboCustomer(displayName: string): Promise<{ Id: string; DisplayName: string } | null> {
  const res = await qboQuery(`SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${ql(displayName)}'`)
  const c = res?.QueryResponse?.Customer?.[0]
  return c ? { Id: c.Id, DisplayName: c.DisplayName } : null
}

/** Low-level: build + POST a QBO invoice from already-resolved lines. */
export async function createQboInvoice(opts: {
  customerId: string
  lines: Array<{ itemId: string; itemName: string; qty: number; unitPrice: number; description: string; taxCode: string }>
  placeOfSupply?: string
  privateNote?: string
}): Promise<{ invoiceId: string; docNumber: string; total: number }> {
  const Line = opts.lines.map((l) => ({
    DetailType: 'SalesItemLineDetail',
    Amount: round2(l.qty * l.unitPrice),
    Description: l.description,
    SalesItemLineDetail: {
      ItemRef: { value: l.itemId, name: l.itemName },
      Qty: l.qty,
      UnitPrice: l.unitPrice,
      TaxCodeRef: { value: l.taxCode },
    },
  }))

  const body: any = {
    CustomerRef: { value: opts.customerId },
    Line,
    GlobalTaxCalculation: 'TaxExcluded',
  }
  if (opts.privateNote) body.PrivateNote = opts.privateNote
  const posId = PLACE_OF_SUPPLY_FIELD_ID()
  if (posId && opts.placeOfSupply) {
    body.CustomField = [{ DefinitionId: posId, Name: 'Place of Supply', Type: 'StringType', StringValue: opts.placeOfSupply }]
  }

  const res = await qboRequest('POST', `/invoice?minorversion=73`, body)
  const inv = res?.Invoice
  if (!inv?.Id) throw new InvoiceError('qbo_error', 'QBO did not return a created invoice')
  return { invoiceId: inv.Id, docNumber: inv.DocNumber ?? inv.Id, total: Number(inv.TotalAmt ?? 0) }
}

export type VisaInvoiceRequest = {
  yachtId: string
  /** Each line: a QBO service item + the visa-application ids it covers. */
  lines: Array<{ itemName: string; visaIds: string[]; unitPrice?: number; taxCode?: string }>
  placeOfSupply?: string
}

/**
 * High-level: generate one QBO invoice for a vessel from selected visa applications,
 * then write the QBO DocNumber/amount back onto each application and mark it invoiced.
 */
export async function generateVisaInvoice(req: VisaInvoiceRequest, userId: string) {
  if (!qboConfigured()) {
    throw new InvoiceError('not_configured', 'QuickBooks is not connected yet (set QBO_CLIENT_ID / QBO_CLIENT_SECRET / QBO_REFRESH_TOKEN).')
  }
  const sb = admin() as any
  const allIds = Array.from(new Set(req.lines.flatMap((l) => l.visaIds)))
  if (allIds.length === 0) throw new InvoiceError('empty', 'No visa applications selected.')

  // Load the selected applications + their vessel + the QBO customer link.
  const { data: apps, error } = await sb
    .from('visa_applications')
    .select('id, given_name, surname, yacht_id, yacht:yachts(vessel_name, qbo_customer_id)')
    .in('id', allIds)
  if (error) throw new InvoiceError('db', error.message)
  if (!apps?.length) throw new InvoiceError('empty', 'Selected visa applications not found.')

  // All rows must belong to the requested vessel (one invoice per customer).
  const offVessel = apps.filter((a: any) => a.yacht_id !== req.yachtId)
  if (offVessel.length) throw new InvoiceError('mixed_vessel', 'All selected applications must belong to the same vessel.')

  const vesselName: string = apps[0]?.yacht?.vessel_name ?? ''
  let customerId: string | null = apps[0]?.yacht?.qbo_customer_id ?? null

  // Resolve the QBO customer if not already linked, then persist the link.
  if (!customerId) {
    if (!vesselName) throw new InvoiceError('no_customer', 'Vessel has no name to match a QBO customer.')
    const cust = await findQboCustomer(vesselName)
    if (!cust) {
      throw new InvoiceError('no_customer', `No QBO customer matches "${vesselName}". Set the vessel's QBO customer first.`)
    }
    customerId = cust.Id
    await sb.from('yachts').update({ qbo_customer_id: customerId }).eq('id', req.yachtId)
  }

  const nameOf = (a: any) => `${a.given_name ?? ''} ${a.surname ?? ''}`.trim() || a.id
  const appById = new Map(apps.map((a: any) => [a.id, a]))

  // Load catalog defaults (unit price / tax code) for the requested items.
  const itemNames = Array.from(new Set(req.lines.map((l) => l.itemName)))
  const { data: catalog } = await sb
    .from('qbo_item_map').select('qbo_item_name, unit_price, tax_code').eq('scope', 'visa').in('qbo_item_name', itemNames)
  const catBy = new Map((catalog ?? []).map((c: any) => [c.qbo_item_name, c]))

  // Resolve each line to a real QBO Item; refuse if any is missing.
  const resolved: Array<{ itemId: string; itemName: string; qty: number; unitPrice: number; description: string; taxCode: string }> = []
  const missing: string[] = []
  // Track per-application allocated amount (a crew member can appear on multiple lines).
  const allocated = new Map<string, number>()

  for (const line of req.lines) {
    const ids = (line.visaIds ?? []).filter((id) => appById.has(id))
    if (ids.length === 0) continue
    const item = await findQboItem(line.itemName)
    if (!item) { missing.push(line.itemName); continue }
    const cat: any = catBy.get(line.itemName)
    const unitPrice = line.unitPrice ?? cat?.unit_price ?? item.UnitPrice
    if (unitPrice == null) { throw new InvoiceError('no_price', `No unit price for "${line.itemName}".`) }
    const taxCode = line.taxCode ?? cat?.tax_code ?? DEFAULT_VAT_TAXCODE()
    const crewNames = ids.map((id) => nameOf(appById.get(id)))
    const description = [line.itemName, ...crewNames.map((n, i) => `${i + 1}. ${n}`)].join('\n')
    resolved.push({ itemId: item.Id, itemName: item.Name, qty: ids.length, unitPrice: Number(unitPrice), description, taxCode })
    for (const id of ids) allocated.set(id, (allocated.get(id) ?? 0) + Number(unitPrice))
  }

  if (missing.length) {
    throw new InvoiceError('item_not_found', `These services have no matching QuickBooks Item: ${missing.join('; ')}. Create the Item in QBO (or fix the name) and retry.`)
  }
  if (resolved.length === 0) throw new InvoiceError('empty', 'No invoice lines to create.')

  // Create the invoice in QBO.
  let created: { invoiceId: string; docNumber: string; total: number }
  try {
    created = await createQboInvoice({
      customerId: customerId!,
      lines: resolved,
      placeOfSupply: req.placeOfSupply,
      privateNote: `Generated from Polaris — ${vesselName}`,
    })
  } catch (e: any) {
    await sb.from('qbo_invoice_log').insert({
      source: 'visa', source_ids: allIds, customer_ref: customerId, customer_name: vesselName,
      status: 'failed', error: String(e?.message ?? e), created_by: userId,
      detail: { realm: qboRealm(), lines: resolved.map((r) => ({ item: r.itemName, qty: r.qty, unitPrice: r.unitPrice })) },
    })
    throw e
  }

  // Write the QBO ref + amount back onto each application and mark invoiced.
  for (const [id, amount] of allocated) {
    await sb.from('visa_applications').update({
      billing_status: 'invoiced', invoice_ref: created.docNumber, invoice_amount: round2(amount),
    }).eq('id', id)
  }

  await sb.from('qbo_invoice_log').insert({
    source: 'visa', source_ids: allIds, qbo_invoice_id: created.invoiceId, doc_number: created.docNumber,
    customer_ref: customerId, customer_name: vesselName, total_amount: created.total, status: 'created', created_by: userId,
    detail: { realm: qboRealm(), lines: resolved.map((r) => ({ item: r.itemName, qty: r.qty, unitPrice: r.unitPrice })) },
  })

  return {
    docNumber: created.docNumber,
    invoiceId: created.invoiceId,
    total: created.total,
    vessel: vesselName,
    lines: resolved.map((r) => ({ item: r.itemName, qty: r.qty, unitPrice: r.unitPrice, amount: round2(r.qty * r.unitPrice) })),
  }
}
