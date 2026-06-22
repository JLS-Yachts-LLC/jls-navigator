import { createClient } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/admin/access'

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

    const { searchParams } = new URL(request.url)
    const page       = parseInt(searchParams.get('page')       ?? '1')
    const pageSize   = parseInt(searchParams.get('pageSize')   ?? '50')
    const eventType  = searchParams.get('event_type') ?? ''
    const result     = searchParams.get('result')     ?? ''
    const actorEmail = searchParams.get('actor')      ?? ''
    const dateFrom   = searchParams.get('from')       ?? ''
    const dateTo     = searchParams.get('to')         ?? ''

    const sb = getAdmin()
    let query = sb
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (eventType)  query = query.eq('event_type', eventType)
    if (result)     query = query.eq('result', result)
    if (actorEmail) query = query.ilike('actor_email', `%${actorEmail}%`)
    if (dateFrom)   query = query.gte('created_at', dateFrom)
    if (dateTo)     query = query.lte('created_at', dateTo)

    if (session.user.role === 'org_admin' && session.user.org_id) {
      const { data: orgUsers } = await sb
        .from('user_roles')
        .select('user_id')
        .eq('org_id', session.user.org_id)
      const userIds = (orgUsers ?? []).map((u: any) => u.user_id)
      if (userIds.length > 0) {
        query = query.in('actor_id', userIds)
      }
    }

    const { data, error, count } = await query

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ events: data ?? [], total: count ?? 0, page, pageSize }), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
}

/** Worker-entry dispatcher for /api/admin/audit (GET log). */
export async function adminAuditHandler(request: Request): Promise<Response> {
  if (request.method === 'GET') return handlers.GET({ request })
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  })
}
