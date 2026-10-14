/**
 * POST /api/warehouse-requests/notify — emails the Warehouse (Logistics copied) about something that has just happened on a
 * warehouse request: it was raised, changed, moved to another status, or commented on.
 *
 * Open to any signed-in Polaris staff member (every department raises requests), but it only sends for something that REALLY
 * just happened: the caller must be the person who did it, with a matching entry in the request's log from the last
 * 15 minutes. So it can't be used to send arbitrary email, and a client-portal captain is refused.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendRequestNotification, type RequestEmailEvent } from '@/lib/warehouse/requests-email.server'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const db = () => supabaseAdmin as any

const LOG_KIND: Record<RequestEmailEvent, string> = { submitted: 'submitted', status: 'status', comment: 'comment', amended: 'amended' }
const RECENT_MS = 15 * 60_000

export async function warehouseRequestsHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const authHeader = request.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (error || !user) return json({ ok: false, error: 'Invalid token' }, 401)

  const body = await request.json().catch(() => null) as { requestId?: string; event?: string; note?: string } | null
  const requestId = body?.requestId ?? ''
  const event = body?.event as RequestEmailEvent | undefined
  if (!requestId || !event || !(event in LOG_KIND)) return json({ ok: false, error: 'requestId and a valid event are required' }, 400)

  // Staff only, and never a client-portal captain.
  const [{ data: profile }, { data: captain }] = await Promise.all([
    db().from('user_profiles').select('display_name, email').eq('user_id', user.id).maybeSingle(),
    db().from('captain_accounts').select('user_id').eq('user_id', user.id).eq('active', true).limit(1),
  ])
  if (!profile || (captain ?? []).length) return json({ ok: false, error: 'Not allowed' }, 403)

  // It must have just happened, done by this person.
  const since = new Date(Date.now() - RECENT_MS).toISOString()
  const { data: recent } = await db().from('warehouse_request_events').select('id')
    .eq('request_id', requestId).eq('kind', LOG_KIND[event]).eq('actor_id', user.id).gte('created_at', since).limit(1)
  if (!(recent ?? []).length) return json({ ok: false, error: 'Nothing recent to send for' }, 409)

  try {
    const to = await sendRequestNotification(requestId, event, typeof body?.note === 'string' ? body.note.slice(0, 2000) : undefined,
      { email: profile.email ?? user.email ?? null, name: profile.display_name ?? user.email ?? '' })
    return json({ ok: true, ...to })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Could not send' }, 500)
  }
}
