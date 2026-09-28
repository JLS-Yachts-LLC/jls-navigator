/**
 * Lightspeed → QuickBooks item-description sync (form-triggered).
 *
 *   POST /api/lightspeed/sync             body: { skus: "SKU1, SKU2\nSKU3" }  — staff (bearer token)
 *   POST /api/lightspeed/sync?token=<t>   same body                           — public link token
 *   GET  /api/lightspeed/sync?token=<t>   → { ok } probe: is this link (still) valid?
 *
 *     → looks up each SKU in Lightspeed, then updates or creates the matching
 *       Inventory item in the Superyacht ME retail (Waypoint) QuickBooks company.
 *       Returns a per-SKU result list.
 *
 * The public link — /sku-sync/<token> — is the login-free replacement for the n8n
 * "Update Item and Invoice Descriptions" form the Waypoint team used to reach
 * without a Polaris account. Same pattern as /qb-upload/<token>: the token IS the
 * authorisation, it lives in integration_settings → lightspeed_sku_link, and
 * rotating it kills a shared URL instantly. Without a valid token the endpoint
 * still requires an admin session, exactly as before.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

/** True when `token` is the current, enabled public-link token. */
async function linkTokenValid(token: string): Promise<boolean> {
  if (!token || token.length < 16) return false
  const { data: row } = await (supabaseAdmin as any)
    .from('integration_settings').select('enabled, config')
    .eq('integration_name', 'lightspeed_sku_link').maybeSingle()
  if (!row || row.enabled === false) return false
  const expected = String(row.config?.token ?? '')
  return expected.length >= 16 && expected === token
}

export async function lightspeedSyncHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const linkToken = url.searchParams.get('token') ?? ''

  // GET: the public page probing whether its link is (still) valid.
  if (request.method === 'GET') {
    if (!(await linkTokenValid(linkToken))) return json({ ok: false, error: 'This link is not valid or has been replaced.' }, 404)
    return json({ ok: true })
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Authorisation: a valid link token, or a signed-in admin session.
  if (!(await linkTokenValid(linkToken))) {
    const session = await requireAdminAccess(request)
    if (!session.ok) return session.response
  }

  let skus = ''
  try {
    const body = (await request.json()) as { skus?: string }
    skus = String(body?.skus ?? '')
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!skus.trim()) return json({ error: 'Pass { skus } — one or more SKUs, comma or newline separated' }, 400)

  try {
    const { syncSkuDescriptions } = await import('@/lib/lightspeed/item-sync.server')
    const result = await syncSkuDescriptions(skus)
    return json(result, result.ok ? 200 : 207)
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500)
  }
}
