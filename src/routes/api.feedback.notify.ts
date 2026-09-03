/**
 * POST /api/feedback/notify  { feedbackId }
 *
 * Handles an in-app bug report / feature request end to end:
 *   1. Raises a Service Desk ticket (it_tickets, queue 'polaris') so it is a real
 *      tracked item to work on — not just an email. The reporter's text also
 *      becomes the first message on the ticket thread, since the Service Desk is
 *      worked conversation-first.
 *   2. Emails both support mailboxes — itsupport@jlsyachts.com and
 *      support@newhorizon-it.co.uk — with the ticket reference in the subject.
 *
 * Idempotent: the created ticket id is written back to feedback.ticket_id, so
 * re-notifying the same feedback re-sends the email but never duplicates a ticket.
 * Both steps are independent — a mail failure never loses the ticket, and a ticket
 * failure never swallows the email.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendTicketEmail } from '@/lib/graph-mail.server'

/** Both support mailboxes. Internal domains, so the client-email guard allows them. */
const SUPPORT_RECIPIENTS = ['itsupport@jlsyachts.com', 'support@newhorizon-it.co.uk']

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Store whether the notification went out. Never throws: failing to record the
 * outcome must not turn a delivered email into a reported failure, or mask the
 * real send error behind a database one.
 */
async function recordNotifyOutcome(feedbackId: string, error: string | null): Promise<void> {
  try {
    await (supabaseAdmin as any).from('feedback').update({
      notified_at: error ? null : new Date().toISOString(),
      notify_error: error ? error.slice(0, 500) : null,
    }).eq('id', feedbackId)
  } catch (e) {
    console.error('[feedback-notify] could not record the notification outcome:', e)
  }
}

/**
 * Name the person who actually filed the report, in the `Original-Sender:` form
 * the Service Desk's inbound mail already understands.
 *
 * This email is sent from the Polaris system mailbox, which is also the address
 * registered as JLS CRM's error mailbox — so without this the Service Desk reads
 * every report as "the app reporting itself" and files it as an app error under
 * "IT Support", even when it is a feature request from a named person.
 */
function originalSenderBlock(email: string | null, name: string | null): string {
  if (!email) return ''
  // Separate paragraphs, not one with a <br>: each must survive HTML-to-text as
  // its own line, because both are matched at the start of a line.
  return `<p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">Original-Sender: ${esc(email)}</p>${
    name ? `<p style="margin:0;font-size:11px;color:#cbd5e1;">Original-Sender-Name: ${esc(name)}</p>` : ''
  }`
}

export async function feedbackNotifyHandler(request: Request): Promise<Response> {
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
  let feedbackId = ''
  try { feedbackId = (await request.json())?.feedbackId ?? '' } catch { return json({ ok: false, error: 'bad body' }, 400) }
  if (!feedbackId) return json({ ok: false, error: 'missing feedbackId' }, 400)

  const db = supabaseAdmin as any
  const { data: f } = await db.from('feedback').select('*').eq('id', feedbackId).maybeSingle()
  if (!f) return json({ ok: false, error: 'not found' }, 404)

  const isBug = f.type === 'bug'
  const summary = (f.title || String(f.message ?? '').slice(0, 60) || 'Untitled').trim()

  // ── 1. Service Desk ticket ──────────────────────────────────────────────────
  let ticketId: string | null = f.ticket_id ?? null
  let ticketNo: string | null = null
  let ticketError: string | null = null

  if (ticketId) {
    const { data: existing } = await db.from('it_tickets').select('ticket_no').eq('id', ticketId).maybeSingle()
    ticketNo = existing?.ticket_no ?? null
  } else {
    try {
      const { data: t, error } = await db.from('it_tickets').insert([{
        subject:     `${isBug ? 'Bug' : 'Feature request'}: ${summary}`,
        description: ticketDescription(f),
        // 'polaris' is the app queue and 'software' the app category — this is what
        // makes it show up as a Polaris item to work on rather than IT hardware.
        queue:       'polaris',
        category:    'software',
        priority:    priorityFor(f),
        status:      'open',
        requested_by:    f.created_by_email ?? null,
        requester_email: f.created_by_email ?? null,
        created_by:      f.created_by ?? null,
      }]).select('id, ticket_no').single()
      if (error) throw error
      ticketId = t?.id ?? null
      ticketNo = t?.ticket_no ?? null

      // Start the thread with the reporter's own words.
      if (ticketId && f.message) {
        await db.from('it_ticket_messages').insert([{
          ticket_id:   ticketId,
          body:        String(f.message),
          internal:    false,
          author_id:   f.created_by ?? null,
          author_name: f.created_by_email ?? 'Polaris user',
        }]).then(() => {}, () => {})
      }
      if (ticketId) await db.from('feedback').update({ ticket_id: ticketId }).eq('id', f.id)
    } catch (e) {
      ticketError = e instanceof Error ? e.message : String(e)
      console.error('[feedback-notify] ticket creation failed:', ticketError)
    }
  }

  // ── 2. Email both support mailboxes, CC the reporter ────────────────────────
  // The reporter is CC'd so that replying to the thread reaches them without
  // anyone having to look their address up — previously they were only in
  // Reply-To, which a "Reply All" from the support mailbox would miss.
  const reporterEmail: string | null = f.created_by_email ?? null
  let reporterName: string | null = null
  if (f.created_by) {
    const { data: prof } = await db.from('user_profiles')
      .select('display_name').eq('user_id', f.created_by).maybeSingle()
    reporterName = prof?.display_name ?? null
  }
  const reporterLabel = reporterName && reporterEmail
    ? `${reporterName} (${reporterEmail})`
    : reporterName ?? reporterEmail ?? 'unknown'
  // Don't CC an address that is already a recipient (staff often report from the
  // shared support mailbox, which is one of the two To: addresses).
  const ccReporter = reporterEmail && !SUPPORT_RECIPIENTS.some(r => r.toLowerCase() === reporterEmail.toLowerCase())
    ? reporterEmail
    : null

  const ref = ticketNo ? `[${ticketNo}] ` : ''
  const log = f.log
    ? `<h3 style="margin:18px 0 6px;font-size:13px;">Activity log</h3>
       <p style="margin:0;font-size:12px;color:#64748b;">URL: ${esc(log_url(f.log))}</p>
       <p style="margin:0 0 6px;font-size:12px;color:#64748b;">${esc(log_ua(f.log))}</p>
       ${f.log.lastError ? `<p style="margin:0 0 6px;font-size:12px;color:#b91c1c;"><strong>Last error:</strong> ${esc(String(f.log.lastError))}</p>` : ''}
       <pre style="background:#f1f5f9;border-radius:6px;padding:10px;font-size:11px;white-space:pre-wrap;">${esc((f.log.actions ?? []).map((a: any) => `${a.t}  ${a.msg}`).join('\n'))}</pre>`
    : ''

  const ticketLine = ticketNo
    ? `<p style="margin:0 0 12px;font-size:13px;"><strong>Service Desk:</strong> ${esc(ticketNo)} · queue <strong>Polaris</strong> · priority <strong>${esc(priorityFor(f))}</strong></p>`
    : `<p style="margin:0 0 12px;font-size:13px;color:#b91c1c;"><strong>Service Desk ticket was NOT created${ticketError ? `: ${esc(ticketError)}` : ''}</strong> — please raise it manually.</p>`

  const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:640px;">
    <h2 style="font-size:18px;margin:0 0 4px;">${isBug ? '🐞 Bug report' : '💡 Feature request'}${f.title ? `: ${esc(f.title)}` : ''}</h2>
    <p style="margin:0 0 10px;font-size:13px;">
      <strong>Reported by:</strong> ${esc(reporterLabel)}
      ${ccReporter ? '<span style="color:#64748b;font-size:12px;"> · CC\'d on this email</span>' : ''}
    </p>
    <p style="margin:0 0 12px;font-size:12px;color:#64748b;">${new Date(f.created_at).toLocaleString('en-GB')}</p>
    ${ticketLine}
    <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${esc(f.message)}</p>
    ${f.screenshot_url ? `<p style="margin:14px 0;"><a href="${esc(f.screenshot_url)}">📎 View screenshot</a></p>` : ''}
    ${log}
    <p style="margin-top:18px;font-size:11px;color:#94a3b8;">Logged in Polaris → Feedback${ticketNo ? ` and tracked as ${esc(ticketNo)} in the Service Desk (Polaris queue)` : ''}. Reply to the submitter to follow up.</p>
    ${originalSenderBlock(reporterEmail, reporterName)}
  </div>`

  try {
    await sendTicketEmail({
      to: SUPPORT_RECIPIENTS,
      cc: ccReporter,
      subject: `${ref}${isBug ? '[Bug]' : '[Feature]'} ${summary}`,
      html,
      replyTo: reporterEmail,
    })
    await recordNotifyOutcome(feedbackId, null)
    return json({ ok: true, ticketId, ticketNo, ticketError })
  } catch (e) {
    // The ticket is the durable record — report the mail failure without losing
    // it. Write the failure down too: returning it to the browser alone meant a
    // report could sit in Polaris while nothing ever reached New Horizon, with
    // no trace of why.
    const error = e instanceof Error ? e.message : 'mail failed'
    await recordNotifyOutcome(feedbackId, error)
    return json({ ok: false, ticketId, ticketNo, ticketError, error }, 502)
  }
}

/**
 * Bugs that captured a real JS error are triaged higher than a reported oddity;
 * feature requests are backlog by default. Adjust here if triage policy changes.
 */
function priorityFor(f: any): 'high' | 'normal' | 'low' {
  if (f.type !== 'bug') return 'low'
  return f.log?.lastError ? 'high' : 'normal'
}

/** Everything an engineer needs on the ticket itself, not just in the email. */
function ticketDescription(f: any): string {
  const lines: string[] = [String(f.message ?? '').trim()]
  lines.push('', '— Reported via Polaris → Feedback —')
  lines.push(`Type: ${f.type === 'bug' ? 'Bug report' : 'Feature request'}`)
  if (f.created_by_email) lines.push(`Reported by: ${f.created_by_email}`)
  lines.push(`Submitted: ${new Date(f.created_at).toISOString()}`)
  if (f.log?.url) lines.push(`URL: ${log_url(f.log)}`)
  if (f.log?.userAgent) lines.push(`Browser: ${log_ua(f.log)}`)
  if (f.log?.lastError) lines.push(`Last error: ${String(f.log.lastError)}`)
  if (f.screenshot_url) lines.push(`Screenshot: ${f.screenshot_url}`)
  const actions = (f.log?.actions ?? []) as any[]
  if (actions.length) {
    lines.push('', 'Activity log:')
    for (const a of actions) lines.push(`  ${a.t}  ${a.msg}`)
  }
  lines.push('', `Feedback id: ${f.id}`)
  return lines.join('\n')
}

function log_url(log: any): string { return String(log?.url ?? '') }
function log_ua(log: any): string { return String(log?.userAgent ?? '') }
