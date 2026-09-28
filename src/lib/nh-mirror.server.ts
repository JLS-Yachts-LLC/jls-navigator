/**
 * Raise Polaris Service Desk items on the New Horizon-IT desk as well.
 *
 * JLS runs its own desk (Polaris → Service Desk) and New Horizon-IT runs the desk
 * that actually does the engineering. Until now only in-app bug reports reached
 * New Horizon, so a manual ticket — or an email forwarded to itsupport@jlsyachts.com
 * — was tracked on one platform and invisible on the other. Everything that becomes
 * a Polaris ticket now also becomes a New Horizon ticket.
 *
 * Mechanism: an email from itsupport@jlsyachts.com to support@newhorizon-it.co.uk,
 * which New Horizon's inbound poller turns into a ticket. Two consequences of
 * sending it that way, both deliberate:
 *
 *  • The requester on the New Horizon side is itsupport@jlsyachts.com — the JLS IT
 *    desk, not the individual who reported it. New Horizon's customer is the desk;
 *    the person who raised it is named in the body instead. This is also why no
 *    `Original-Sender:` line is emitted: that line exists to attribute relayed mail
 *    to the real person, which is precisely what we do NOT want here.
 *
 *  • The Polaris reference travels in the subject (`[SD-0021] …`), so when New
 *    Horizon replies, the reply lands back in the itsupport mailbox still carrying
 *    it and the inbound poller appends it to the same Polaris ticket. That is what
 *    closes the loop: work done on New Horizon shows up in Polaris.
 *
 * The marker line below is what stops New Horizon filing these as machine-reported
 * app errors — see NH_MIRROR_MARKER.
 */
import { createClient } from '@supabase/supabase-js'
import { sendTicketEmail } from '@/lib/graph-mail.server'

/** New Horizon-IT's support mailbox. Overridable so a test run can be diverted. */
export const NH_SUPPORT_MAILBOX =
  process.env.NH_SUPPORT_MAILBOX ?? 'support@newhorizon-it.co.uk'

/**
 * The line that tells New Horizon "this is a service-desk mirror — raise an
 * ordinary ticket for it".
 *
 * It is needed because itsupport@jlsyachts.com is registered on the New Horizon
 * side as JLS CRM's *error* mailbox. Without the marker, mail from this address
 * matches that app and is filed as a machine-reported app error on the dev board
 * rather than as a ticket with a requester — the opposite of what a mirror is for.
 *
 * Kept as a body line rather than a real header because New Horizon's poller reads
 * the body (the same route `Original-Sender:` already takes), and because a custom
 * header does not reliably survive Graph's sendMail.
 */
export const NH_MIRROR_MARKER = 'X-Service-Desk-Mirror'

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Where a mirrored item came from — shown on the New Horizon ticket. */
export type MirrorOrigin =
  | 'Polaris Service Desk'
  | 'Polaris feedback'
  | 'Email to itsupport@jlsyachts.com'

export interface MirrorInput {
  /** Polaris ticket reference, e.g. `SD-0021`. Null when no ticket could be raised. */
  ref: string | null
  subject: string
  /** The ticket body — whatever an engineer needs in order to start. */
  body: string
  origin: MirrorOrigin
  priority?: string | null
  category?: string | null
  /** The person behind the item. Named in the body only — never the requester. */
  raisedByEmail?: string | null
  raisedByName?: string | null
  vessel?: string | null
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:2px 14px 2px 0;color:#64748b;">${esc(label)}</td>` +
    `<td style="padding:2px 0;"><strong>${esc(value)}</strong></td></tr>`
}

/**
 * Send one mirror email. Throws on failure — every caller catches it, because a
 * ticket that did not reach New Horizon must never take down the request that
 * created it.
 */
export async function sendNewHorizonMirror(input: MirrorInput): Promise<void> {
  const ref = input.ref?.trim() || null
  const subject = (input.subject || '(no subject)').trim()
  const raisedBy = [input.raisedByName, input.raisedByEmail].filter(Boolean).join(' · ')

  const rows = [
    row('Source', input.origin),
    ref ? row('Polaris ref', ref) : '',
    input.priority ? row('Priority', input.priority) : '',
    input.category ? row('Category', input.category) : '',
    input.vessel ? row('Vessel', input.vessel) : '',
    raisedBy ? row('Raised by', raisedBy) : '',
  ].filter(Boolean)

  const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:640px;">
  <h2 style="font-size:17px;margin:0 0 10px;">${esc(subject)}</h2>
  <table style="border-collapse:collapse;font-size:13px;margin:0 0 16px;">${rows.join('')}</table>
  <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${esc(input.body || '(no detail supplied)')}</div>
  <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;">
    Raised on the JLS Yachts service desk${ref ? ` as ${esc(ref)}` : ''} and mirrored here so it is tracked
    on both platforms. Replying to this email adds your reply to the Polaris ticket${ref ? ` (${esc(ref)})` : ''}.
  </p>
  <p style="margin:8px 0 0;font-size:11px;color:#cbd5e1;">${NH_MIRROR_MARKER}: ${esc(ref ?? 'unreferenced')}</p>
</div>`

  await sendTicketEmail({
    to: NH_SUPPORT_MAILBOX,
    // The reference leads the subject so New Horizon's reply carries it back and
    // the Polaris inbound poller can thread that reply onto the same ticket.
    subject: ref ? `[${ref}] ${subject}` : subject,
    html,
    // No replyTo: replies belong to the IT desk, which is the requester.
  })
}

export interface MirrorResult {
  mirrored: boolean
  /** Set when nothing was sent and that is the correct outcome. */
  skipped?: string
  error?: string
}

/**
 * Mirror a Polaris ticket, exactly once.
 *
 * Never throws. The ticket exists whether or not New Horizon heard about it, and
 * losing the caller's own response would be the worse failure. The reason is
 * written to it_tickets.nh_mirror_error so a missing mirror is visible afterwards
 * rather than living only in a log line nobody reads.
 */
export async function mirrorTicketToNewHorizon(
  ticketId: string,
  origin: MirrorOrigin = 'Polaris Service Desk',
  db?: any,
): Promise<MirrorResult> {
  const sb = (db ?? admin()) as any
  try {
    const { data: t } = await sb
      .from('it_tickets')
      .select('id, ticket_no, subject, description, priority, category, requested_by, requester_email, nh_mirrored_at, yacht:yachts(vessel_name), it_yacht:it_yachts(name)')
      .eq('id', ticketId)
      .maybeSingle()
    if (!t) return { mirrored: false, skipped: 'ticket not found' }
    // Exactly-once. Re-notifying a ticket (which the UI does freely) must not
    // raise a second one on the other desk.
    if (t.nh_mirrored_at) return { mirrored: false, skipped: 'already mirrored' }

    await sendNewHorizonMirror({
      ref: t.ticket_no ?? null,
      subject: t.subject ?? '(no subject)',
      body: t.description ?? '',
      origin,
      priority: t.priority,
      category: t.category,
      raisedByEmail: t.requester_email,
      raisedByName: t.requested_by,
      vessel: t.yacht?.vessel_name ?? t.it_yacht?.name ?? null,
    })

    await sb.from('it_tickets')
      .update({ nh_mirrored_at: new Date().toISOString(), nh_mirror_error: null })
      .eq('id', ticketId)
    return { mirrored: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error(`[nh-mirror] ${ticketId} was not raised on New Horizon:`, error)
    try {
      await sb.from('it_tickets').update({ nh_mirror_error: error.slice(0, 500) }).eq('id', ticketId)
    } catch { /* the send error is the one worth reporting */ }
    return { mirrored: false, error }
  }
}
