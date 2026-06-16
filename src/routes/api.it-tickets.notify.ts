/**
 * Service Desk email notifications via Microsoft Graph (from itsupport@jlsyachts.com).
 * POST /api/it-tickets/notify  { ticketId, event: 'created'|'reply'|'resolved', message? }
 * Fire-and-forget from the UI; failures are reported in the JSON but never block.
 */
import { createClient } from '@supabase/supabase-js'
import {
  sendTicketEmail, TICKET_MAIL_SENDER,
  ticketCreatedEmail, ticketReplyEmail, ticketResolvedEmail, ticketStaffNotifyEmail,
} from '@/lib/graph-mail.server'

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function itTicketsNotifyHandler(request: Request): Promise<Response> {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
  let ticketId = '', event = '', message = ''
  try {
    const body: any = await request.json()
    ticketId = body.ticketId ?? ''
    event = body.event ?? ''
    message = body.message ?? ''
  } catch { return json({ ok: false, error: 'bad body' }, 400) }
  if (!ticketId || !event) return json({ ok: false, error: 'missing ticketId/event' }, 400)

  try {
    const db = getAdmin() as any
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
    } else if (event === 'reply') {
      if (!to) return json({ ok: true, skipped: 'no requester email' })
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
