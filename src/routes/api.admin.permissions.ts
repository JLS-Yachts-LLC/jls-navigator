import { createClient } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/admin/access'
import { logAuditEvent } from '@/lib/admin/audit'

function getAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const handlers = {
  GET: async ({ request }: { request: Request }) => {
    const session = await requireAdminAccess(request)
    if (!session.ok) return session.response

    const sb = getAdmin()
    const { data, error } = await sb
      .from('permission_rules')
      .select('*')
      .order('role')
      .order('resource')

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ rules: data ?? [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  },

  PATCH: async ({ request }: { request: Request }) => {
    const session = await requireAdminAccess(request, ['global_admin'])
    if (!session.ok) return session.response

    const body = await request.json() as {
      id: string
      scope: string
      conditions?: Record<string, unknown>
    }

    if (!body.id || !body.scope) {
      return new Response(JSON.stringify({ error: 'id and scope are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const sb = getAdmin()
    const { data: existing } = await sb.from('permission_rules').select('*').eq('id', body.id).single()

    await sb.from('permission_rules').update({
      scope:      body.scope,
      conditions: body.conditions ?? null,
    }).eq('id', body.id)

    await logAuditEvent({
      event_type:  'PERM',
      actor_id:    session.user.id,
      actor_email: session.user.email,
      actor_role:  session.user.role,
      target_type: 'permission_rule',
      target_id:   body.id,
      detail:      `Permission updated: ${existing?.role}/${existing?.resource}/${existing?.action} → scope: ${body.scope}`,
      ip_address:  request.headers.get('x-forwarded-for'),
      result:      'success',
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
}

/** Worker-entry dispatcher for /api/admin/permissions (GET matrix, PATCH rule). */
export async function adminPermissionsHandler(request: Request): Promise<Response> {
  if (request.method === 'GET')   return handlers.GET({ request })
  if (request.method === 'PATCH') return handlers.PATCH({ request })
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  })
}
