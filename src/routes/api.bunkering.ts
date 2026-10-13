/**
 * POST /api/bunkering/notify — emails the Agency team about something that has just happened on a bunkering enquiry.
 * Any signed-in staff member (never a client-portal captain), but only for something that REALLY just happened: the caller must
 * be the person who did it, with a matching entry in the enquiry's log from the last 15 minutes — so it can't send arbitrary email.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendBunkeringNotification, type BunkeringEmailEvent } from '@/lib/bunkering/email.server'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const db = () => supabaseAdmin as any
const LOG_KIND: Record<BunkeringEmailEvent, string[]> = { created: ['created'], status: ['status'], approved: ['approved'], delivered: ['delivered'], comment: ['comment'] }
const RECENT_MS = 15 * 60_000

export async function bunkeringNotifyHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  const authHeader = request.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (error || !user) return json({ ok: false, error: 'Invalid token' }, 401)

  const body = await request.json().catch(() => null) as { enquiryId?: string; event?: string; note?: string } | null
  const enquiryId = body?.enquiryId ?? ''
  const event = body?.event as BunkeringEmailEvent | undefined
  if (!enquiryId || !event || !(event in LOG_KIND)) return json({ ok: false, error: 'enquiryId and a valid event are required' }, 400)

  const [{ data: profile }, { data: captain }] = await Promise.all([
    db().from('user_profiles').select('display_name, email').eq('user_id', user.id).maybeSingle(),
    db().from('captain_accounts').select('user_id').eq('user_id', user.id).eq('active', true).limit(1),
  ])
  if (!profile || (captain ?? []).length) return json({ ok: false, error: 'Not allowed' }, 403)

  const since = new Date(Date.now() - RECENT_MS).toISOString()
  const { data: recent } = await db().from('bunker_enquiry_events').select('id')
    .eq('enquiry_id', enquiryId).in('kind', LOG_KIND[event]).eq('actor_id', user.id).gte('created_at', since).limit(1)
  if (!(recent ?? []).length) return json({ ok: false, error: 'Nothing recent to send for' }, 409)

  try {
    const to = await sendBunkeringNotification(enquiryId, event, typeof body?.note === 'string' ? body.note.slice(0, 2000) : undefined,
      { email: profile.email ?? user.email ?? null, name: profile.display_name ?? user.email ?? '' })
    return json({ ok: true, ...to })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Could not send' }, 500)
  }
}
