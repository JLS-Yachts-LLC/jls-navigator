import { createClient } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/admin/access'
import { logAuditEvent } from '@/lib/admin/audit'
import type { AuditEvent } from '@/lib/admin/types'

function getAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function toCSV(events: AuditEvent[]): string {
  const headers = ['timestamp', 'event_type', 'actor_email', 'actor_role', 'target_type', 'target_label', 'detail', 'ip_address', 'result']
  const rows = events.map(e => [
    e.created_at,
    e.event_type,
    e.actor_email,
    e.actor_role,
    e.target_type ?? '',
    e.target_label ?? '',
    `"${(e.detail ?? '').replace(/"/g, '""')}"`,
    e.ip_address ?? '',
    e.result,
  ].join(','))
  return [headers.join(','), ...rows].join('\n')
}

const handlers = {
  GET: async ({ request }: { request: Request }) => {
    const session = await requireAdminAccess(request)
    if (!session.ok) return session.response

    const { searchParams } = new URL(request.url)
    const eventType  = searchParams.get('event_type') ?? ''
    const result     = searchParams.get('result')     ?? ''
    const actorEmail = searchParams.get('actor')      ?? ''
    const dateFrom   = searchParams.get('from')       ?? ''
    const dateTo     = searchParams.get('to')         ?? ''

    const sb = getAdmin()
    let query = sb
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10000)

    if (eventType)  query = query.eq('event_type', eventType)
    if (result)     query = query.eq('result', result)
    if (actorEmail) query = query.ilike('actor_email', `%${actorEmail}%`)
    if (dateFrom)   query = query.gte('created_at', dateFrom)
    if (dateTo)     query = query.lte('created_at', dateTo)

    const { data, error } = await query
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    await logAuditEvent({
      event_type:  'EXPORT',
      actor_id:    session.user.id,
      actor_email: session.user.email,
      actor_role:  session.user.role,
      target_type: 'audit_log',
      detail:      `Audit log exported — ${(data ?? []).length} rows`,
      ip_address:  request.headers.get('x-forwarded-for'),
      result:      'success',
    })

    const csv  = toCSV((data ?? []) as AuditEvent[])
    const date = new Date().toISOString().slice(0, 10)

    return new Response(csv, {
      headers: {
        'Content-Type':        'text/csv',
        'Content-Disposition': `attachment; filename="polaris-audit-${date}.csv"`,
      },
    })
  },
}

/** Worker-entry dispatcher for /api/admin/audit/export (GET CSV). */
export async function adminAuditExportHandler(request: Request): Promise<Response> {
  if (request.method === 'GET') return handlers.GET({ request })
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  })
}
