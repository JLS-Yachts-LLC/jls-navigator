/**
 * Lightspeed (Vend) → QuickBooks retail sync — native port of the n8n
 * "Lightspeed -> Quickbooks Webhook Sync" workflow. No n8n.
 *
 * Four Vend webhooks (form-encoded, `payload` is a JSON string) drive four flows
 * against the Superyacht ME retail QBO company (realm 9341456599242940 — a
 * SEPARATE QuickBooks company from JLS; connect it once via /api/qb/connect):
 *
 *   customer.update → upsert QBO Customer by DisplayName (skips "Walk in Customer")
 *   product.update  → upsert QBO Inventory Item by SKU (accounts 80/267/224)
 *   sale.update (credit)  → returns → QBO CreditMemo (linked -CR copy, or rebuilt
 *                            from line items), deduped by DocNumber
 *   sale.update (invoice) → closed/on-account sales → QBO Invoice, deduped by
 *                            DocNumber (previously forwarded to a second n8n flow)
 *
 * Config lives in integration_settings 'lightspeed':
 *   { api_token, domain_prefix ('superyachtme'), retailer_id?, webhook_key?, qbo_realm? }
 * Each flow has its own Automations toggle (default OFF).
 */
import { createClient } from '@supabase/supabase-js'
import { qboRequest, qboQuery } from '@/lib/qb/qbo.server'
import { logAutomationRun } from '@/lib/automations.server'

export const LS_RETAIL_REALM_DEFAULT = '9341456599242940'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

export type LsConfig = {
  enabled: boolean
  apiToken: string
  domainPrefix: string
  retailerId: string
  webhookKey: string
  realm: string
}

export async function lsConfig(): Promise<LsConfig> {
  const sb = admin() as any
  const { data } = await sb.from('integration_settings').select('enabled, config').eq('integration_name', 'lightspeed').maybeSingle()
  const c = data?.config ?? {}
  return {
    enabled: !!data?.enabled,
    apiToken: String(c.api_token ?? ''),
    domainPrefix: String(c.domain_prefix ?? 'superyachtme'),
    retailerId: String(c.retailer_id ?? ''),
    webhookKey: String(c.webhook_key ?? ''),
    realm: String(c.qbo_realm ?? LS_RETAIL_REALM_DEFAULT),
  }
}

/** Lazily-seeded per-flow toggle (default OFF). */
async function flowEnabled(key: string, name: string, description: string): Promise<boolean> {
  const sb = admin() as any
  const { data } = await sb.from('automations').select('enabled').eq('key', key).maybeSingle()
  if (!data) {
    await sb.from('automations').insert({ key, name, description, category: 'Lightspeed', department: 'Lightspeed', source: 'worker', trigger_type: 'webhook', enabled: false })
    return false
  }
  return !!data.enabled
}

const esc = (s: string) => String(s ?? '').replace(/'/g, "\\'")

// ── Flow 1: customer.update ────────────────────────────────────────────────────
export async function syncCustomer(payload: any, realm: string): Promise<string> {
  const contact = payload.contact ?? {}
  const first = String(payload.contact_first_name ?? contact.first_name ?? '').trim()
  const last = String(payload.contact_last_name ?? contact.last_name ?? '').trim()

  // Walk-in customers are explicitly excluded (n8n If1).
  if ((contact.first_name ?? first) === 'Walk in Customer') return 'skip-walk-in'

  const displayName = `${first} ${last}`.trim()
  if (!displayName) return 'skip-no-name'

  const found = await qboQuery(`SELECT * FROM Customer WHERE DisplayName = '${esc(displayName)}'`, realm)
  const existing = found?.QueryResponse?.Customer?.[0]

  if (existing) {
    // Sparse update: email + country (n8n "UpdateCustomer in QBO").
    await qboRequest('POST', '/customer?minorversion=73', {
      sparse: true,
      Id: existing.Id,
      SyncToken: existing.SyncToken,
      DisplayName: displayName,
      ...(payload.email ? { PrimaryEmailAddr: { Address: payload.email } } : {}),
      ...(contact.physical_country_id ? { BillAddr: { Country: contact.physical_country_id } } : {}),
    }, realm)
    return `customer-updated ${displayName}`
  }

  await qboRequest('POST', '/customer?minorversion=73', {
    DisplayName: displayName,
    ...(payload.company_name ? { CompanyName: payload.company_name } : {}),
    ...(payload.email ? { PrimaryEmailAddr: { Address: payload.email } } : {}),
    ...(payload.phone ?? contact.phone ? { PrimaryPhone: { FreeFormNumber: payload.phone ?? contact.phone } } : {}),
    BillAddr: {
      ...(contact.physical_city ? { City: contact.physical_city } : {}),
      ...(contact.physical_country_id ? { Country: contact.physical_country_id } : {}),
      ...(contact.physical_postcode ? { PostalCode: contact.physical_postcode } : {}),
    },
  }, realm)
  return `customer-created ${displayName}`
}

// ── Flow 2: product.update ─────────────────────────────────────────────────────
export async function syncProduct(payload: any, realm: string): Promise<string> {
  const sku = payload?.sku != null ? String(payload.sku) : ''
  if (!sku) return 'skip-no-sku'
  const description = String(payload?.name ?? '')

  const found = await qboQuery(`SELECT * FROM Item WHERE Name = '${esc(sku)}'`, realm)
  const existing = found?.QueryResponse?.Item?.[0]

  if (existing) {
    await qboRequest('POST', '/item?operation=update&minorversion=73', {
      Id: existing.Id,
      SyncToken: existing.SyncToken,
      sparse: true,
      Name: sku,
      Description: description,
      IncomeAccountRef: { value: '80' },
      ExpenseAccountRef: { value: '267' },
      AssetAccountRef: { value: '224' },
    }, realm)
    return `item-updated ${sku}`
  }

  await qboRequest('POST', '/item?minorversion=73', {
    Name: sku,
    Sku: sku,
    Description: description,
    Type: 'Inventory',
    TrackQtyOnHand: true,
    IncomeAccountRef: { value: '80' },
    ExpenseAccountRef: { value: '267' },
    AssetAccountRef: { value: '224', name: 'Inventory' },
    InvStartDate: '2026-01-01',
    QtyOnHand: 0,
  }, realm)
  return `item-created ${sku}`
}

// ── Shared sale parsing (n8n "Code in JavaScript2") ────────────────────────────
export type ParsedSale = {
  saleId: string; invoiceNumber: string; customerName: string; email: string | null
  lineItems: Array<{ id: string; is_return: boolean; price: number; price_total: number; product_id: string; quantity: number; tax_total: number }>
  returnFor: string | null; hasLinkedInvoice: boolean; state: string; status: string
}

export function parseSale(payload: any): ParsedSale {
  const cust = payload.customer ?? {}
  const customerName = cust.company_name
    || `${cust.first_name ?? cust.contact_first_name ?? ''} ${cust.last_name ?? cust.contact_last_name ?? ''}`.trim()
  return {
    saleId: String(payload.id ?? ''),
    invoiceNumber: String(payload.invoice_number ?? ''),
    customerName,
    email: cust.email ?? null,
    lineItems: (payload.register_sale_products ?? []).map((i: any) => ({
      id: i.id, is_return: !!i.is_return,
      price: parseFloat(i.price ?? 0), price_total: parseFloat(i.price_total ?? 0),
      product_id: i.product_id, quantity: parseFloat(i.quantity ?? 0),
      tax_total: parseFloat(i.tax_total ?? 0),
    })),
    returnFor: payload.return_for ?? null,
    hasLinkedInvoice: payload.return_for !== null && payload.return_for !== undefined,
    state: String(payload.state ?? ''),
    status: String(payload.status ?? ''),
  }
}

/** Fetch a Lightspeed product (for its SKU) — API 2.0, bearer token. */
async function fetchLsProduct(cfg: LsConfig, productId: string): Promise<any | null> {
  if (!cfg.apiToken) throw new Error('Lightspeed API token not configured (Settings → Integrations → Lightspeed)')
  const res = await fetch(`https://${cfg.domainPrefix}.retail.lightspeed.app/api/2.0/products/${encodeURIComponent(productId)}`, {
    headers: { accept: 'application/json', Authorization: `Bearer ${cfg.apiToken}` },
  })
  if (!res.ok) return null
  return res.json()
}

/** Resolve each sale line to a QBO item id via the Lightspeed SKU. */
async function resolveLines(cfg: LsConfig, realm: string, sale: ParsedSale) {
  const lines: any[] = []
  let totalTax = 0
  const missing: string[] = []
  for (const li of sale.lineItems) {
    const product = await fetchLsProduct(cfg, li.product_id)
    const sku = product?.data?.sku != null ? String(product.data.sku) : (product?.sku != null ? String(product.sku) : '')
    const qbo = sku ? (await qboQuery(`SELECT * FROM Item WHERE Name = '${esc(sku)}'`, realm))?.QueryResponse?.Item?.[0] : null
    if (!qbo) { missing.push(sku || li.product_id); continue }
    totalTax += Math.abs(li.tax_total)
    lines.push({
      Amount: Math.abs(li.price_total),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: qbo.Id },
        Qty: Math.abs(li.quantity),
        UnitPrice: Math.abs(li.price),
        TaxCodeRef: { value: '13' },
      },
    })
  }
  return { lines, totalTax, missing }
}

// ── Flow 3: returns → credit memo ──────────────────────────────────────────────
export async function syncCredit(payload: any, cfg: LsConfig, realm: string): Promise<string> {
  const sale = parseSale(payload)
  const isReturn = sale.lineItems.some((i) => i.is_return)
  if (!isReturn) return 'skip-not-a-return'
  if (!sale.invoiceNumber) return 'skip-no-invoice-number'

  // Dedup: never create two credit memos for the same number.
  const docNumber = sale.hasLinkedInvoice ? `${sale.invoiceNumber}-CR` : sale.invoiceNumber
  const dup = await qboQuery(`SELECT * FROM CreditMemo WHERE DocNumber = '${esc(docNumber)}'`, realm)
  if (dup?.QueryResponse?.CreditMemo?.length) return `skip-creditmemo-exists ${docNumber}`

  if (sale.hasLinkedInvoice) {
    // Path A — linked return: copy the original invoice's sales lines.
    const orig = await qboQuery(`SELECT * FROM Invoice WHERE DocNumber = '${esc(sale.invoiceNumber)}'`, realm)
    const invoice = orig?.QueryResponse?.Invoice?.[0]
    if (!invoice) return `skip-original-invoice-not-found ${sale.invoiceNumber}`
    await qboRequest('POST', '/creditmemo?minorversion=73', {
      CustomerRef: { value: invoice.CustomerRef.value },
      DocNumber: docNumber,
      Line: (invoice.Line ?? [])
        .filter((l: any) => l.DetailType === 'SalesItemLineDetail')
        .map((l: any) => ({
          Description: l.Description,
          Amount: l.Amount,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: {
            ItemRef: l.SalesItemLineDetail.ItemRef,
            Qty: l.SalesItemLineDetail.Qty,
            UnitPrice: l.SalesItemLineDetail.UnitPrice,
          },
        })),
    }, realm)
    return `creditmemo-created ${docNumber} (linked)`
  }

  // Path B — standalone return: rebuild from the sale's line items.
  const cust = await qboQuery(`SELECT * FROM Customer WHERE DisplayName = '${esc(sale.customerName)}'`, realm)
  const customer = cust?.QueryResponse?.Customer?.[0]
  if (!customer) return `skip-customer-not-found "${sale.customerName}"`

  const { lines, totalTax, missing } = await resolveLines(cfg, realm, sale)
  if (!lines.length) return `skip-no-resolvable-items${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`

  await qboRequest('POST', '/creditmemo?minorversion=73', {
    CustomerRef: { value: customer.Id },
    DocNumber: docNumber,
    TxnTaxDetail: { TotalTax: totalTax },
    Line: lines,
  }, realm)
  return `creditmemo-created ${docNumber}${missing.length ? ` (skipped items: ${missing.join(', ')})` : ''}`
}

// ── Flow 4: sales → invoice ────────────────────────────────────────────────────
export async function syncInvoice(payload: any, cfg: LsConfig, realm: string): Promise<string> {
  const sale = parseSale(payload)
  if (sale.lineItems.some((i) => i.is_return) || sale.returnFor) return 'skip-return-sale (credit flow handles it)'
  if (!sale.invoiceNumber) return 'skip-no-invoice-number'
  // Only closed or on-account sales become invoices (voided/pending layaways don't).
  const state = sale.state.toLowerCase()
  const status = sale.status.toUpperCase()
  if (state === 'voided' || status === 'VOIDED') return 'skip-voided'
  if (!(state === 'closed' || status === 'CLOSED' || status === 'ONACCOUNT' || status === 'ONACCOUNT_CLOSED')) {
    return `skip-state ${sale.state || sale.status}`
  }

  const dup = await qboQuery(`SELECT * FROM Invoice WHERE DocNumber = '${esc(sale.invoiceNumber)}'`, realm)
  if (dup?.QueryResponse?.Invoice?.length) return `skip-invoice-exists ${sale.invoiceNumber}`

  const cust = await qboQuery(`SELECT * FROM Customer WHERE DisplayName = '${esc(sale.customerName)}'`, realm)
  const customer = cust?.QueryResponse?.Customer?.[0]
  if (!customer) return `skip-customer-not-found "${sale.customerName}"`

  const { lines, totalTax, missing } = await resolveLines(cfg, realm, sale)
  if (!lines.length) return `skip-no-resolvable-items${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`

  await qboRequest('POST', '/invoice?minorversion=73', {
    CustomerRef: { value: customer.Id },
    DocNumber: sale.invoiceNumber,
    TxnTaxDetail: { TotalTax: totalTax },
    Line: lines,
  }, realm)
  return `invoice-created ${sale.invoiceNumber}${missing.length ? ` (skipped items: ${missing.join(', ')})` : ''}`
}

// ── Dispatcher ─────────────────────────────────────────────────────────────────
// 'sale' is the single Lightspeed "Sale updated" event — we inspect the payload
// and route returns → credit memo, everything else → invoice (Lightspeed has no
// separate return webhook). 'credit'/'invoice' remain for direct/legacy use.
export type LsKind = 'customer' | 'product' | 'sale' | 'credit' | 'invoice'
type LsFlow = 'customer' | 'product' | 'credit' | 'invoice'

const FLOWS: Record<LsFlow, { key: string; name: string; description: string }> = {
  customer: { key: 'ls-customer-sync', name: 'Lightspeed → QBO Customers', description: 'Native port of the n8n Lightspeed customer sync: on a Lightspeed customer update, creates or updates the matching QuickBooks retail customer (walk-in customers are skipped).' },
  product: { key: 'ls-product-sync', name: 'Lightspeed → QBO Inventory', description: 'Native port of the n8n Lightspeed product sync: on a Lightspeed product update, creates or updates the matching QuickBooks inventory item by SKU (accounts 80/267/224).' },
  credit: { key: 'ls-credit-sync', name: 'Lightspeed → QBO Credit Memos', description: 'Native port of the n8n Lightspeed returns sync: return sales become QuickBooks credit memos — linked returns copy the original invoice (DocNumber-CR), standalone returns are rebuilt from the sale lines. Deduplicated by DocNumber.' },
  invoice: { key: 'ls-invoice-sync', name: 'Lightspeed → QBO Invoices', description: 'Native replacement for the n8n Lightspeed invoice chain: closed/on-account sales become QuickBooks invoices (items matched by SKU, tax code 13). Deduplicated by DocNumber.' },
}

export async function handleLightspeedWebhook(kind: LsKind, body: URLSearchParams): Promise<{ status: number; result: string }> {
  const cfg = await lsConfig()
  const retailerId = body.get('retailer_id') ?? ''
  if (cfg.retailerId && retailerId && cfg.retailerId !== retailerId) {
    return { status: 200, result: 'skip-unknown-retailer' } // 200 so Vend doesn't retry forever
  }

  let payload: any
  try {
    payload = JSON.parse(body.get('payload') ?? '')
  } catch {
    return { status: 400, result: 'bad-payload' }
  }

  // Resolve the single "Sale updated" event to the correct flow.
  let flowKind: LsFlow
  if (kind === 'sale') {
    const sale = parseSale(payload)
    flowKind = (sale.lineItems.some((i) => i.is_return) || sale.returnFor) ? 'credit' : 'invoice'
  } else {
    flowKind = kind
  }

  const flow = FLOWS[flowKind]
  await logAutomationRun({ key: flow.key, name: flow.name, source: 'worker', trigger_type: 'webhook', category: 'Lightspeed', status: 'hit' })

  const enabled = await flowEnabled(flow.key, flow.name, flow.description)
  if (!enabled) return { status: 200, result: 'disabled (toggle in Automations)' }

  try {
    const result = flowKind === 'customer' ? await syncCustomer(payload, cfg.realm)
      : flowKind === 'product' ? await syncProduct(payload, cfg.realm)
      : flowKind === 'credit' ? await syncCredit(payload, cfg, cfg.realm)
      : await syncInvoice(payload, cfg, cfg.realm)
    await logAutomationRun({ key: flow.key, name: flow.name, source: 'worker', trigger_type: 'webhook', category: 'Lightspeed', status: 'success', detail: result })
    return { status: 200, result }
  } catch (e: any) {
    const detail = String(e?.message ?? e).slice(0, 400)
    await logAutomationRun({ key: flow.key, name: flow.name, source: 'worker', trigger_type: 'webhook', category: 'Lightspeed', status: 'error', detail })
    // 500 → Vend retries; our DocNumber dedup makes retries safe.
    return { status: 500, result: detail }
  }
}
