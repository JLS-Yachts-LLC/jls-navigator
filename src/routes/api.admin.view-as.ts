/**
 * "View as" a staff member — GET /api/admin/view-as?user_id=…   (admin only)
 *
 * Returns that person's POLARIS claims (department defaults + per-person module
 * overrides, role, vessels) exactly as deriveClaims() would build them for them.
 * The app swaps these in for the admin's own while previewing, so the sidebar,
 * module screens and tab limits (e.g. Orbit 2 Bunkering only) look the way they
 * do for that person.
 *
 * It is a preview of what they can SEE, not a session swap: every request still
 * runs as the admin. Their claims can only be read through the service role
 * (RLS lets a user read only their own access rows), hence this endpoint.
 */
import { createClient, type User } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/admin/access'
import { deriveClaims } from '@/lib/auth/claims'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function adminViewAsHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request)
  if (!session.ok) return session.response
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const userId = new URL(request.url).searchParams.get('user_id') ?? ''
  if (!UUID_RE.test(userId)) return json({ error: 'user_id is required' }, 400)

  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data, error } = await sb.auth.admin.getUserById(userId)
  if (error || !data?.user) return json({ error: 'User not found' }, 404)

  const claims = await deriveClaims(sb, data.user as User)
  return json({ claims })
}
