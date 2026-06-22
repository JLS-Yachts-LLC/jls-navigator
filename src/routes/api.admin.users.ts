import { createClient } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/admin/access'
import { logAuditEvent } from '@/lib/admin/audit'
import type { PolarisRole } from '@/lib/admin/types'

function getAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const ALLOWED_ROLES_FOR_ORG_ADMIN: PolarisRole[] = [
  'captain', 'crew', 'supplier', 'port_agent',
]

const handlers = {
  GET: async ({ request }: { request: Request }) => {
    const session = await requireAdminAccess(request)
    if (!session.ok) return session.response

    const { searchParams } = new URL(request.url)
    const page     = parseInt(searchParams.get('page')     ?? '1')
    const pageSize = parseInt(searchParams.get('pageSize') ?? '25')
    const search   = searchParams.get('search') ?? ''
    const role     = searchParams.get('role')   ?? ''

    const sb = getAdmin()
    let query = sb
      .from('user_roles')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('granted_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (role) query = query.eq('role', role)

    if (session.user.role === 'org_admin' && session.user.org_id) {
      query = query.eq('org_id', session.user.org_id)
    }

    const { data, error, count } = await query
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Filter by email search client-side (auth.users join not available via RLS)
    const users = search
      ? (data ?? []).filter(u => (u as any).email?.toLowerCase().includes(search.toLowerCase()))
      : (data ?? [])

    return new Response(JSON.stringify({ users, total: count ?? 0, page, pageSize }), {
      headers: { 'Content-Type': 'application/json' },
    })
  },

  POST: async ({ request }: { request: Request }) => {
    const session = await requireAdminAccess(request)
    if (!session.ok) return session.response

    const body = await request.json() as {
      email: string
      role: PolarisRole
      org_id?: string
      vessel_id?: string
      location_id?: string
    }
    const { email, role, org_id, vessel_id, location_id } = body

    if (!email || !role) {
      return new Response(JSON.stringify({ error: 'email and role are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    if (session.user.role === 'org_admin' && !ALLOWED_ROLES_FOR_ORG_ADMIN.includes(role)) {
      return new Response(JSON.stringify({ error: 'Insufficient permission to grant this role' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }

    const sb = getAdmin()

    const { data: inviteData, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email, {
      data: { role, org_id, vessel_id, location_id },
      redirectTo: `${process.env.VITE_APP_URL ?? ''}/auth/mfa-setup`,
    })

    if (inviteErr || !inviteData?.user) {
      return new Response(JSON.stringify({ error: inviteErr?.message ?? 'Invite failed' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    await sb.from('user_roles').insert({
      user_id:     inviteData.user.id,
      role,
      org_id:      org_id      ?? null,
      vessel_id:   vessel_id   ?? null,
      location_id: location_id ?? null,
      granted_by:  session.user.id,
      is_active:   false,
    })

    await logAuditEvent({
      event_type:  'PERM',
      actor_id:    session.user.id,
      actor_email: session.user.email,
      actor_role:  session.user.role,
      target_type: 'user',
      target_label: email,
      detail:      `User invited: ${email} — role: ${role}`,
      ip_address:  request.headers.get('x-forwarded-for'),
      result:      'pending',
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
}

/** Worker-entry dispatcher — TanStack API routes aren't served by the CF handler. */
export async function adminUsersHandler(request: Request): Promise<Response> {
  if (request.method === 'GET')  return handlers.GET({ request })
  if (request.method === 'POST') return handlers.POST({ request })
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  })
}
