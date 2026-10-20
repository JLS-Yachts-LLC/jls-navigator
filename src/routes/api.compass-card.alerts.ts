/**
 * POST /api/compass-card/alerts — Compass Card notification helpers for staff.
 *
 *   { action: 'test' }   a sample alert email to the caller's own address
 *   { action: 'run' }    send email for any event not yet alerted
 *
 * Signed-in Polaris staff only; a client-portal login is refused.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendEmail } from '@/lib/ses.server'
import { outboundEmailEnabled } from '@/lib/mail-guard.server'
import { buildEventEmail, sampleEvent, sendCompassCardAlerts } from '@/lib/compass-card/alerts.server'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const db = () => supabaseAdmin as any

export async function compassCardAlertsHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const authHeader = request.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (error || !user) return json({ ok: false, error: 'Invalid token' }, 401)

  const [{ data: profile }, { data: captain }] = await Promise.all([
    db().from('user_profiles').select('email').eq('user_id', user.id).maybeSingle(),
    db().from('captain_accounts').select('user_id').eq('user_id', user.id).eq('active', true).limit(1),
  ])
  if (!profile || (captain ?? []).length) return json({ ok: false, error: 'Not allowed' }, 403)

  const body = await request.json().catch(() => null) as { action?: string } | null
  try {
    if (body?.action === 'run') return json({ ok: true, ...(await sendCompassCardAlerts()) })
    if (body?.action === 'test') {
      const to = profile.email ?? user.email
      if (!to) return json({ ok: false, error: 'Your account has no email address' }, 400)
      if (!outboundEmailEnabled()) return json({ ok: false, error: 'Outbound email is switched off on the server' }, 409)
      const m = buildEventEmail(sampleEvent())
      await sendEmail({ to: [to], subject: m.subject, html: m.html, text: m.text })
      return json({ ok: true, to })
    }
    return json({ ok: false, error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Could not send' }, 500)
  }
}
