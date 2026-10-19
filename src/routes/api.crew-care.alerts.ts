/**
 * POST /api/crew-care/alerts — Crew Care job-card alerts.
 *
 *   { action: 'run' }                        send email / Teams for any job card not yet alerted
 *                                            (called straight after staff raise one, so the team
 *                                            doesn't wait for the 5-minute tick)
 *   { action: 'test', channel: 'email' }     a sample job card to the caller's own address
 *   { action: 'test', channel: 'teams', url } a sample job card to that Teams webhook (the URL
 *                                            being typed in, so it can be tried before saving)
 *
 * Signed-in Polaris staff only; a client-portal login is refused. 'run' only ever sends job
 * cards that exist and haven't been alerted, to the team configured in crew_care_settings.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendEmail } from '@/lib/ses.server'
import { outboundEmailEnabled } from '@/lib/mail-guard.server'
import {
  buildJobEmail, buildTeamsPayload, isTeamsWebhookUrl, postToTeams, sampleJob, sendCrewCareJobAlerts,
} from '@/lib/crew-care/job-alerts.server'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const db = () => supabaseAdmin as any

export async function crewCareAlertsHandler(request: Request): Promise<Response> {
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

  const body = await request.json().catch(() => null) as { action?: string; channel?: string; url?: string } | null

  try {
    if (body?.action === 'run') return json({ ok: true, ...(await sendCrewCareJobAlerts()) })

    if (body?.action === 'test' && body.channel === 'email') {
      const to = profile.email ?? user.email
      if (!to) return json({ ok: false, error: 'Your account has no email address' }, 400)
      if (!outboundEmailEnabled()) return json({ ok: false, error: 'Outbound email is switched off on the server' }, 409)
      const m = buildJobEmail(sampleJob())
      await sendEmail({ to: [to], subject: m.subject, html: m.html, text: m.text })
      return json({ ok: true, to })
    }

    if (body?.action === 'test' && body.channel === 'teams') {
      const url = (body.url ?? '').trim()
      if (!isTeamsWebhookUrl(url)) return json({ ok: false, error: 'That is not a Microsoft Teams webhook address' }, 400)
      await postToTeams(url, buildTeamsPayload(sampleJob()))
      return json({ ok: true })
    }

    return json({ ok: false, error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Could not send' }, 500)
  }
}
