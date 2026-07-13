/**
 * Lightspeed → QuickBooks item-description sync (admin only, form-triggered).
 *
 *   POST /api/lightspeed/sync   body: { skus: "SKU1, SKU2\nSKU3" }
 *     → looks up each SKU in Lightspeed, then updates or creates the matching
 *       Inventory item in the Superyacht ME retail QuickBooks company.
 *       Returns a per-SKU result list.
 */
import { requireAdminAccess } from '@/lib/admin/access'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function lightspeedSyncHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request)
  if (!session.ok) return session.response
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

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
