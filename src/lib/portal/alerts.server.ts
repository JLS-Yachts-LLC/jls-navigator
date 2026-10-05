/**
 * Client Portal → staff alerts: the email half.
 *
 * The database raises every alert (portal_alert_raise, called by triggers on
 * captain_requests, captain_request_messages and portal_chat_messages) and rings
 * the in-app bell straight away. This runs on the worker's 5-minute tick, emails
 * each alert that hasn't been emailed yet to the alert recipients (and the
 * vessel's responsible agent), and stamps it.
 *
 * Gated by the automations toggle "Client Portal — staff alerts by email"
 * (key portal-client-alerts), created switched ON the first time this runs,
 * so it can be paused from Automations without a deploy.
 */
import { createClient } from '@supabase/supabase-js'
import { sendGraphEmail } from '@/lib/graph-mail.server'
import { logAutomationRun } from '@/lib/automations.server'
import { outboundEmailEnabled } from '@/lib/mail-guard.server'
import { appBaseUrl } from '@/lib/app-url.server'

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

const KEY = 'portal-client-alerts'
const BATCH = 40

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

const KIND_LABEL: Record<string, string> = {
  request: 'New request',
  request_message: 'Reply on a request',
  chat: 'Live chat',
}

function emailHtml(a: any): string {
  const link = `${appBaseUrl()}/polaris-redesign?screen=client-requests`
  const more = a.message_count > 1 ? `<p style="margin:0 0 12px;color:#64748b;font-size:13px">${a.message_count} messages — the latest is below.</p>` : ''
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#0a1838;color:#e9cc72;padding:14px 20px;border-radius:12px 12px 0 0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:600">
      Client Portal · ${esc(KIND_LABEL[a.kind] ?? 'Client activity')}
    </div>
    <div style="background:#ffffff;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:0">
      <h1 style="margin:0 0 12px;font-size:18px;line-height:1.35">${esc(a.title)}</h1>
      ${more}
      ${a.body ? `<div style="white-space:pre-line;font-size:14px;line-height:1.55;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px">${esc(a.body)}</div>` : ''}
      <p style="margin:18px 0 0"><a href="${link}" style="display:inline-block;background:#c9a227;color:#0a1838;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px">Open Client Requests</a></p>
    </div>
    <p style="margin:12px 4px 0;color:#94a3b8;font-size:11px">You get these because you're on the Client Portal alert list (Settings → Manage Users → Client Portal) or are this vessel's agent.</p>
  </div></body></html>`
}

/** Email every waiting alert. Safe to run concurrently-ish: rows are claimed before sending. */
export async function sendPortalAlerts(): Promise<{ sent: number; failed: number; skipped?: string }> {
  const sb = admin() as any

  const { data: auto } = await sb.from('automations').select('enabled').eq('key', KEY).maybeSingle()
  if (!auto) {
    await sb.from('automations').insert({
      key: KEY,
      name: 'Client Portal — staff alerts by email',
      description: 'Emails the Client Portal alert list (and each vessel\'s agent) whenever a client raises a request, replies on one, or sends a chat message. In-app bell alerts are always on; this switch only controls the emails.',
      category: 'Client Portal', source: 'worker', trigger_type: 'schedule', schedule: 'Every 5 minutes', enabled: true,
    })
  } else if (!auto.enabled) {
    return { sent: 0, failed: 0, skipped: 'disabled' }
  }

  // With outbound email switched off on the Worker, the bell has already told
  // staff; mark waiting alerts as not emailed rather than build a stale backlog
  // that would all go out the moment email is switched back on.
  if (!outboundEmailEnabled()) {
    await sb.from('portal_alert_outbox')
      .update({ emailed_at: new Date().toISOString(), email_error: 'Not emailed — outbound email is switched off' })
      .is('emailed_at', null)
    return { sent: 0, failed: 0, skipped: 'email off' }
  }

  // Leave the newest alerts a minute, so a quick burst of messages folds into one email.
  const settle = new Date(Date.now() - 60_000).toISOString()
  const { data: pending, error } = await sb.from('portal_alert_outbox')
    .select('id, yacht_id, kind, title, body, message_count, updated_at')
    .is('emailed_at', null).lt('updated_at', settle)
    .order('created_at').limit(BATCH)
  if (error) throw error
  if (!pending?.length) return { sent: 0, failed: 0 }

  // Claim them first so an overlapping tick can't send the same alert twice.
  const ids = pending.map((p: any) => p.id)
  const { data: claimed } = await sb.from('portal_alert_outbox')
    .update({ emailed_at: new Date().toISOString() }).in('id', ids).is('emailed_at', null).select('id')
  const mine = new Set((claimed ?? []).map((c: any) => c.id))
  const rows = pending.filter((p: any) => mine.has(p.id))
  if (!rows.length) return { sent: 0, failed: 0 }

  // Recipients: the alert list, plus each vessel's agent.
  const [{ data: listed }, { data: agents }] = await Promise.all([
    sb.from('portal_alert_recipients').select('user_id'),
    sb.from('yachts').select('id, agent_user_id').in('id', [...new Set(rows.map((r: any) => r.yacht_id).filter(Boolean))]),
  ])
  const agentOf = new Map<string, string>((agents ?? []).filter((a: any) => a.agent_user_id).map((a: any) => [a.id, a.agent_user_id]))
  const userIds = [...new Set([...(listed ?? []).map((l: any) => l.user_id), ...agentOf.values()])]
  const { data: profiles } = userIds.length
    ? await sb.from('user_profiles').select('user_id, email, active').in('user_id', userIds)
    : { data: [] }
  const emailOf = new Map<string, string>((profiles ?? []).filter((p: any) => p.email && p.active !== false).map((p: any) => [p.user_id, p.email]))
  const listEmails = (listed ?? []).map((l: any) => emailOf.get(l.user_id)).filter(Boolean) as string[]

  let sent = 0
  let failed = 0
  for (const a of rows) {
    const agentEmail = a.yacht_id ? emailOf.get(agentOf.get(a.yacht_id) ?? '') : undefined
    const to = [...new Set([...listEmails, ...(agentEmail ? [agentEmail] : [])])]
    if (!to.length) {
      await sb.from('portal_alert_outbox').update({ email_error: 'No alert recipients set' }).eq('id', a.id)
      continue
    }
    try {
      await sendGraphEmail({ to, subject: `[Client Portal] ${a.title}`.slice(0, 200), html: emailHtml(a), text: `${a.title}\n\n${a.body ?? ''}` })
      sent++
    } catch (e: any) {
      failed++
      // Put it back in the queue for the next tick, with the reason.
      await sb.from('portal_alert_outbox').update({ emailed_at: null, email_error: String(e?.message ?? e).slice(0, 500) }).eq('id', a.id)
    }
  }

  await logAutomationRun({
    key: KEY, name: 'Client Portal — staff alerts by email', source: 'worker', trigger_type: 'schedule', category: 'Client Portal',
    status: failed ? 'error' : 'success', detail: `${sent} sent${failed ? `, ${failed} failed` : ''}`,
  }).catch(() => {})
  return { sent, failed }
}
