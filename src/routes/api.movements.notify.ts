/**
 * POST /api/movements/notify
 *
 * Best-effort email to the ops / visa team when a crew movement is recorded.
 * In-app notifications are raised by the DB trigger (migration 051); this adds
 * the email channel. Recipients are admin-tier users (proxy for ops/visa until
 * dedicated team roles exist). Called fire-and-forget from the sign-on/off page.
 */
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/ses.server'

function getAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// TEMPORARILY DISABLED (2026-06-30): crew sign-on/off notification emails are
// switched off until we're ready to go live. Flip back to `true` to re-enable.
const MOVEMENT_EMAILS_ENABLED = false

export async function movementsNotifyHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Kill-switch: short-circuit before doing any work, but report success so the
  // sign-on/off page's fire-and-forget call stays happy.
  if (!MOVEMENT_EMAILS_ENABLED) return json({ ok: true, sent: 0, disabled: true })

  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const sb = getAdmin()
  const { data: { user } } = await sb.auth.getUser(auth.slice(7))
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const body = await request.json().catch(() => ({})) as {
    crew_ids?: string[]; yacht_id?: string | null; event_type?: string
    event_date?: string | null; port?: string | null; airline?: string | null; flight_number?: string | null
  }
  const crewIds = [...new Set(body.crew_ids ?? [])] // de-dupe repeated ids
  if (crewIds.length === 0) return json({ ok: true, sent: 0 })

  // Crew names — de-duped (guards against duplicate crew records for the same person)
  const { data: crew } = await sb.from('crew_members').select('full_name, first_name, last_name').in('id', crewIds)
  const names = [...new Set(
    (crew ?? []).map((c: any) => (c.full_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim())).filter(Boolean),
  )]

  // Vessel
  let vessel = ''
  if (body.yacht_id) {
    const { data: y } = await sb.from('yachts').select('vessel_name').eq('id', body.yacht_id).maybeSingle()
    vessel = y?.vessel_name ?? ''
  }

  // Recipients — admin-tier users with an email on file.
  const { data: profiles } = await sb.from('user_profiles').select('email, roles:role_id(name)').not('email', 'is', null)
  const recipients = [...new Set(
    (profiles ?? [])
      .filter((p: any) => ['global_admin', 'org_admin'].includes(p.roles?.name))
      .map((p: any) => p.email as string),
  )]
  if (recipients.length === 0) return json({ ok: true, sent: 0 })

  const verb = body.event_type === 'sign_off' ? 'Sign Off' : 'Sign On'
  const dateStr = body.event_date ? new Date(body.event_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const flight = [body.airline, body.flight_number].filter(Boolean).join(' ')
  const meta = [vessel && `Vessel: ${vessel}`, dateStr && `Date: ${dateStr}`, body.port && `Port: ${body.port}`, flight && `Flight: ${flight}`].filter(Boolean)

  const subject = `Crew ${verb}${vessel ? ` — ${vessel}` : ''} (${names.length})`
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
    <h2 style="margin:0 0 8px;font-size:16px">Crew ${verb} recorded</h2>
    ${meta.length ? `<p style="margin:0 0 12px;color:#4b5563">${meta.join(' &nbsp;·&nbsp; ')}</p>` : ''}
    <p style="margin:0 0 6px;font-weight:600">${names.length} crew:</p>
    <ul style="margin:0;padding-left:18px">${names.map((n: string) => `<li>${n}</li>`).join('')}</ul>
  </div>`
  const text = `Crew ${verb} recorded\n${meta.join(' | ')}\n\n${names.map((n: string) => `- ${n}`).join('\n')}`

  try {
    await sendEmail({ to: recipients, subject, html, text })
  } catch {
    return json({ ok: false, sent: 0 })
  }
  return json({ ok: true, sent: recipients.length })
}
