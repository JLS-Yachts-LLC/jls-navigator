/**
 * Lightspeed → QuickBooks item-description sync — native port of the n8n
 * "Update Item and Invoice Descriptions" workflow. No n8n:
 *
 *   For each SKU entered on the form:
 *     1. Look up the product in Lightspeed Retail (X-Series) by SKU.
 *     2. Check whether an Inventory Item with that SKU already exists in the
 *        Superyacht ME retail QuickBooks company.
 *     3. If it exists  → sparse-update its Description to the Lightspeed
 *        variant name.
 *        If it doesn't → create a new Inventory Item (Name = Sku = SKU,
 *        Description = variant name) with the retail company's income / expense
 *        / asset accounts.
 *
 * This targets a SECONDARY QuickBooks company (the retail realm), reached via
 * qboRequest(..., realmOverride). That realm's tokens must be connected once via
 * /api/qb/connect. The Lightspeed bearer token is the LIGHTSPEED_API_TOKEN
 * Wrangler secret. Realm, domain, account refs and the inventory start date are
 * config on the automation row so they can change without a deploy.
 */
import { qboQuery, qboRequest, qboConfigured } from '@/lib/qb/qbo.server'
import { logAutomationRun } from '@/lib/automations.server'
import { createClient } from '@supabase/supabase-js'

export const LIGHTSPEED_SYNC_KEY = 'lightspeed-item-sync'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

type AccountRef = { value: string; name: string }
type SyncConfig = {
  realm: string
  domain: string
  income: AccountRef
  expense: AccountRef
  asset: AccountRef
  invStartDate: string
}

// Defaults ported verbatim from the n8n workflow (Superyacht ME retail company).
const DEFAULTS: SyncConfig = {
  realm: '9341456599242940',
  domain: 'superyachtme.retail.lightspeed.app',
  income: { value: '80', name: 'Sales' },
  expense: { value: '267', name: 'Cost of sales' },
  asset: { value: '224', name: 'Inventory' },
  invStartDate: '2026-01-01',
}

async function loadConfig(): Promise<SyncConfig> {
  const { data } = await admin().from('automations').select('config').eq('key', LIGHTSPEED_SYNC_KEY).maybeSingle()
  const c = (data?.config as any) ?? {}
  const acc = c.accounts ?? {}
  return {
    realm: c.qbo_realm || DEFAULTS.realm,
    domain: c.lightspeed_domain || DEFAULTS.domain,
    income: acc.income ?? DEFAULTS.income,
    expense: acc.expense ?? DEFAULTS.expense,
    asset: acc.asset ?? DEFAULTS.asset,
    invStartDate: c.inv_start_date || DEFAULTS.invStartDate,
  }
}

/** Split the free-text SKU field into a clean, de-duplicated list. */
export function parseSkus(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of String(raw ?? '').split(/[,\n\r]+/)) {
    const sku = s.trim()
    if (sku && !seen.has(sku)) { seen.add(sku); out.push(sku) }
  }
  return out
}

/** Fetch a single Lightspeed product by SKU. Returns null if none found. */
async function fetchLightspeedProduct(domain: string, sku: string): Promise<any | null> {
  const token = process.env.LIGHTSPEED_API_TOKEN
  if (!token) throw new Error('LIGHTSPEED_API_TOKEN secret is not set')
  const res = await fetch(`https://${domain}/api/2.0/products?sku=${encodeURIComponent(sku)}`, {
    headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Lightspeed ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const body: any = await res.json()
  const data = body?.data
  const product = Array.isArray(data) ? data[0] : data
  return product ?? null
}

/** The description written into QBO: the Lightspeed variant name, falling back
 *  to Name/VariantOne/VariantTwo when the variant name is blank. */
function productDescription(p: any): string {
  const variantName = String(p?.variant_name ?? '').trim()
  if (variantName) return variantName.slice(0, 4000)
  const parts = [p?.name, p?.variant_option_one_value, p?.variant_option_two_value]
    .map((x) => String(x ?? '').trim()).filter(Boolean)
  return parts.join('/').slice(0, 4000)
}

export type SkuResult = {
  sku: string
  action: 'created' | 'updated' | 'not-found' | 'error'
  detail: string
  itemId?: string
}
export type LightspeedSyncResult = {
  ok: boolean
  processed: number
  created: number
  updated: number
  notFound: number
  errors: number
  results: SkuResult[]
}

/** Process one SKU end-to-end. */
async function syncOneSku(sku: string, cfg: SyncConfig): Promise<SkuResult> {
  // 1. Lightspeed product
  const product = await fetchLightspeedProduct(cfg.domain, sku)
  if (!product || !product.name) return { sku, action: 'not-found', detail: 'No Lightspeed product for this SKU' }
  const description = productDescription(product)

  // 2. Does the QBO Item already exist? (SKU is escaped for the QBO query string)
  const escaped = sku.replace(/'/g, "\\'")
  const q = await qboQuery(`SELECT * FROM Item WHERE Type = 'Inventory' AND Sku = '${escaped}'`, cfg.realm)
  const existing = q?.QueryResponse?.Item?.[0]

  // 3. Update or create
  if (existing) {
    const updated = await qboRequest('POST', `/item?operation=update&minorversion=73`, {
      Id: existing.Id, SyncToken: existing.SyncToken, Type: 'Inventory',
      Description: description, InvStartDate: cfg.invStartDate, sparse: true,
    }, cfg.realm)
    return { sku, action: 'updated', detail: `Description set to "${description}"`, itemId: updated?.Item?.Id ?? existing.Id }
  }
  const created = await qboRequest('POST', `/item?minorversion=73`, {
    Name: sku, Sku: sku, Description: description, Type: 'Inventory',
    IncomeAccountRef: cfg.income, ExpenseAccountRef: cfg.expense, AssetAccountRef: cfg.asset,
    TrackQtyOnHand: true, QtyOnHand: 0, InvStartDate: cfg.invStartDate,
  }, cfg.realm)
  return { sku, action: 'created', detail: `Created Inventory item "${description}"`, itemId: created?.Item?.Id }
}

/** Run the sync for a batch of SKUs (sequential — the retail realm is rate-limited). */
export async function syncSkuDescriptions(rawSkus: string): Promise<LightspeedSyncResult> {
  if (!qboConfigured()) throw new Error('QBO not configured (QBO_CLIENT_ID/SECRET missing)')
  const skus = parseSkus(rawSkus)
  if (skus.length === 0) throw new Error('No SKUs provided')

  const cfg = await loadConfig()
  const results: SkuResult[] = []
  for (const sku of skus) {
    try {
      results.push(await syncOneSku(sku, cfg))
    } catch (e: any) {
      results.push({ sku, action: 'error', detail: e?.message ?? String(e) })
    }
  }

  const created = results.filter((r) => r.action === 'created').length
  const updated = results.filter((r) => r.action === 'updated').length
  const notFound = results.filter((r) => r.action === 'not-found').length
  const errors = results.filter((r) => r.action === 'error').length

  await logAutomationRun({
    key: LIGHTSPEED_SYNC_KEY, name: 'Lightspeed → QuickBooks Item Descriptions',
    source: 'worker', trigger_type: 'manual', category: 'Retail',
    status: errors ? (created + updated ? 'retry' : 'error') : 'success',
    detail: `${skus.length} SKU(s): ${created} created, ${updated} updated, ${notFound} not found, ${errors} error(s)`,
  })

  return { ok: errors === 0, processed: skus.length, created, updated, notFound, errors, results }
}
