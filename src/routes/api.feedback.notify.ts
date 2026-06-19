/**
 * POST /api/feedback/notify  { feedbackId }
 * Emails a submitted bug report / feature request to IT support
 * (itsupport@jlsyachts.com) via Microsoft Graph.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendTicketEmail } from '@/lib/graph-mail.server'

const SUPPORT = 'itsupport@jlsyachts.com'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function feedbackNotifyHandler(request: Request): Promise<Response> {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
  let feedbackId = ''
  try { feedbackId = (await request.json())?.feedbackId ?? '' } catch { return json({ ok: false, error: 'bad body' }, 400) }
  if (!feedbackId) return json({ ok: false, error: 'missing feedbackId' }, 400)

  const { data: f } = await (supabaseAdmin as any).from('feedback').select('*').eq('id', feedbackId).maybeSingle()
  if (!f) return json({ ok: false, error: 'not found' }, 404)

  const isBug = f.type === 'bug'
  const log = f.log
    ? `<h3 style="margin:18px 0 6px;font-size:13px;">Activity log</h3>
       <p style="margin:0;font-size:12px;color:#64748b;">URL: ${esc(log_url(f.log))}</p>
       <p style="margin:0 0 6px;font-size:12px;color:#64748b;">${esc(log_ua(f.log))}</p>
       ${f.log.lastError ? `<p style="margin:0 0 6px;font-size:12px;color:#b91c1c;"><strong>Last error:</strong> ${esc(String(f.log.lastError))}</p>` : ''}
       <pre style="background:#f1f5f9;border-radius:6px;padding:10px;font-size:11px;white-space:pre-wrap;">${esc((f.log.actions ?? []).map((a: any) => `${a.t}  ${a.msg}`).join('\n'))}</pre>`
    : ''

  const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:640px;">
    <h2 style="font-size:18px;margin:0 0 4px;">${isBug ? '🐞 Bug report' : '💡 Feature request'}${f.title ? `: ${esc(f.title)}` : ''}</h2>
    <p style="margin:0 0 12px;font-size:12px;color:#64748b;">From ${esc(f.created_by_email ?? 'unknown')} · ${new Date(f.created_at).toLocaleString('en-GB')}</p>
    <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${esc(f.message)}</p>
    ${f.screenshot_url ? `<p style="margin:14px 0;"><a href="${esc(f.screenshot_url)}">📎 View screenshot</a></p>` : ''}
    ${log}
    <p style="margin-top:18px;font-size:11px;color:#94a3b8;">Logged in Polaris → Feedback. Reply to the submitter to follow up.</p>
  </div>`

  try {
    await sendTicketEmail({
      to: SUPPORT,
      subject: `${isBug ? '[Bug]' : '[Feature]'} ${f.title || f.message.slice(0, 60)}`,
      html,
      replyTo: f.created_by_email ?? null,
    })
    return json({ ok: true })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'mail failed' }, 502)
  }
}

function log_url(log: any): string { return String(log?.url ?? '') }
function log_ua(log: any): string { return String(log?.userAgent ?? '') }
