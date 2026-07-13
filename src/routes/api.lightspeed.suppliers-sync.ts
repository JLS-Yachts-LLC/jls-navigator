/**
 * POST /api/lightspeed/suppliers-sync  (authenticated, bearer)
 * Pulls all suppliers from Lightspeed into waypoint_suppliers on demand.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { syncLightspeedSuppliers } from '@/lib/lightspeed/suppliers.server'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function lightspeedSuppliersSyncHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const { data: { user }, error } = await (supabaseAdmin as any).auth.getUser(auth.slice(7))
  if (error || !user) return json({ ok: false, error: 'Unauthorized' }, 401)
  try {
    const r = await syncLightspeedSuppliers('manual')
    return json({ ok: true, ...r })
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e).slice(0, 400) }, 502)
  }
}
