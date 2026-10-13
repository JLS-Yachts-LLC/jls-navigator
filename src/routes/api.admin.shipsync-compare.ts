/**
 * GET /api/admin/shipsync-compare - sets the Power App's SharePoint lists against Polaris (read-only).
 * Global admins only; it reads SharePoint with the app's own connection, so it never touches the user's login.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { compareShipSyncWithSharePoint } from '@/lib/sharepoint-sync.server'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function shipsyncCompareHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const session = await requireAdminAccess(request, ['global_admin'])
  if (!session.ok) return session.response
  try {
    return json(await compareShipSyncWithSharePoint())
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}
