/**
 * Service Desk email notifications via Microsoft Graph (from itsupport@jlsyachts.com).
 * POST /api/it-tickets/notify  { ticketId, event: 'created'|'reply'|'resolved' }
 * Fire-and-forget from the UI; failures are reported in the JSON but never block.
 *
 * Signed-in staff only, and the email's text always comes from the ticket itself.
 * This endpoint used to do neither: anyone who had a ticket's id could make Polaris
 * email that ticket's requester FROM itsupport@jlsyachts.com with any text they
 * supplied as `message` — a phishing tool on a trusted internal address.
 */
import { createClient } from '@supabase/supabase-js'
import { requireAccess } from '@/lib/auth/requireAccess.server'
import {
  sendTicketEmail, TICKET_MAIL_SENDER,
  ticketCreatedEmail, ticketReplyEmail, ticketResolvedEmail, ticketStaffNotifyEmail,
} from '@/lib/graph-mail.server'
import { mirrorTicketToNewHorizon } from '@/lib/nh-mirror.server'

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function itTicketsNotifyHandler(request: Request): Promise<Response> {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

  // A signed-in Polaris staff member. requireAccess() on its own admits any
  // authenticated user — portal captains included — so also require a staff
  // profile and refuse an active captain account. The Service Desk is open to all
  // staff, so this deliberately is not a role allow-list that could lock one out.
  const access = await requireAccess(request)
  if (!access.ok) return access.response
  const db = getAdmin() as any
  const uid = access.claims.userId
  const [{ data: profile }, { data: captain }] = await Promise.all([
    db.from('user_profiles').select('user_id').eq('user_id', uid).maybeSingle(),
    db.from('captain_accounts').select('user_id').eq('user_id', uid).eq('active', true).limit(1).maybeSingle(),
  ])
  if (!profile || captain) return json({ ok: false, error: 'Forbidden' }, 403)

  let ticketId = '', event = ''
  try {
    const body: any = await request.json()
    ticketId = body.ticketId ?? ''
    event = body.event ?? ''
    // Any `message` in the body is ignored on purpose — see the 'reply' branch.
  } catch { return json({ ok: false, error: 'bad body' }, 400) }
  if (!ticketId || !event) return json({ ok: false, error: 'missing ticketId/event' }, 400)

  try {
    const { data: t } = await db
      .from('it_tickets')
      .select('ticket_no, subject, description, priority, requested_by, requester_email, resolution, yacht:yachts(vessel_name), it_yacht:it_yachts(name)')
      .eq('id', ticketId)
      .maybeSingle()
    if (!t) return json({ ok: false, error: 'ticket not found' }, 404)

    const ref = t.ticket_no ?? ticketId.slice(0, 8)
    const name = t.requested_by || 'there'
    const vessel = t.yacht?.vessel_name ?? t.it_yacht?.name ?? undefined
    const to = t.requester_email as string | null
    const sent: string[] = []

    if (event === 'created') {
      // Always notify the support mailbox; acknowledge the requester if we have their email.
      const staff = ticketStaffNotifyEmail({ ticket_no: ref, subject: t.subject, name, vessel, description: t.description, priority: t.priority })
      await sendTicketEmail({ to: TICKET_MAIL_SENDER, subject: staff.subject, html: staff.html, replyTo: to })
      sent.push('staff')
      if (to) {
        const ack = ticketCreatedEmail({ ticket_no: ref, subject: t.subject, name, vessel, description: t.description })
        await sendTicketEmail({ to, subject: ack.subject, html: ack.html })
        sent.push('requester')
      }
      // And raise it on the New Horizon desk, so a manual ticket is tracked in
      // both places rather than only here. Its own errors are recorded on the
      // ticket — a mirror that fails must not fail the notification.
      const mirror = await mirrorTicketToNewHorizon(ticketId, 'Polaris Service Desk', db)
      if (mirror.mirrored) sent.push('new-horizon')
    } else if (event === 'reply') {
      if (!to) return json({ ok: true, skipped: 'no requester email' })
      // Send the reply that was actually posted on the ticket — never text from
      // the request, which is how this endpoint could be made to email anything.
      // The UI posts the message before calling here, so it is the latest one.
      const { data: last } = await db
        .from('it_ticket_messages')
        .select('body')
        .eq('ticket_id', ticketId)
        .eq('internal', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const message = String(last?.body ?? '').trim()
      if (!message) return json({ ok: true, skipped: 'no public reply on the ticket to send' })
      const e = ticketReplyEmail({ ticket_no: ref, subject: t.subject, name, message })
      await sendTicketEmail({ to, subject: e.subject, html: e.html })
      sent.push('requester')
    } else if (event === 'resolved') {
      if (!to) return json({ ok: true, skipped: 'no requester email' })
      const e = ticketResolvedEmail({ ticket_no: ref, subject: t.subject, name, resolution: t.resolution })
      await sendTicketEmail({ to, subject: e.subject, html: e.html })
      sent.push('requester')
    } else {
      return json({ ok: false, error: 'unknown event' }, 400)
    }

    return json({ ok: true, sent })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
}
