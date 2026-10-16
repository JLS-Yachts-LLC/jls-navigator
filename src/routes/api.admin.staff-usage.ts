import { createClient } from '@supabase/supabase-js'
import { requireAccess } from '@/lib/auth/requireAccess.server'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

/**
 * GET /api/admin/staff-usage — the Staff Usage page's figures (admin_staff_usage RPC).
 *
 * Two locks: requireAccess() (a real staff session — never a guest or captain),
 * then the RPC runs AS THE CALLER (their own token, not the service role), so the
 * database's own admin rule applies: a global admin or has_role(admin).
 */
export async function adminStaffUsageHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const access = await requireAccess(request)
  if (!access.ok) return access.response

  const token = (request.headers.get('authorization') ?? '').slice(7)
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await sb.rpc('admin_staff_usage')
  if (error) return json({ error: /not allowed/i.test(error.message) ? 'Admins only' : error.message }, /not allowed/i.test(error.message) ? 403 : 500)
  return json(data)
}
