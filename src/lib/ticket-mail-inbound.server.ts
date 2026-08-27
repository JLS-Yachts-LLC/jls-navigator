/**
 * Inbound ticket mail — the other half of the Service Desk email loop.
 *
 * Every notification we send says "Reply to this email to add to your ticket";
 * this is what makes that true. Polls the itsupport mailbox via Graph, matches
 * the ticket reference in the subject (`[SD-0019]`), and appends the reply to
 * that ticket's thread so it appears in the app exactly like an in-app message.
 *
 * Deliberate choices:
 *  • Dedupe in our own table (ticket_mail_processed), NOT by marking mail read —
 *    the team works this mailbox by hand and we must not touch their unread state.
 *  • Our own outbound notifications are recognised and skipped, so a ticket can
 *    never echo its own emails back into itself.
 *  • Quoted history is trimmed, so the thread shows what the person actually
 *    wrote rather than the whole chain each time.
 */
import { createClient } from '@supabase/supabase-js'
import { TICKET_MAIL_SENDER, getMailGraphTokenForRead } from '@/lib/graph-mail.server'

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

/** `[SD-0019] …` anywhere in the subject (also matches JLS-0003-style refs). */
const TICKET_REF = /\[?\b([A-Z]{2,5}-\d{2,6})\b\]?/

/**
 * Strip quoted history and signatures so the appended message is just the new
 * text. Graph gives us the plain-text body; replies pile the whole chain below.
 */
export function extractReplyText(raw: string): string {
  const lines = String(raw ?? '').replace(/\r/g, '').split('\n')
  const out: string[] = []
  for (const line of lines) {
    const t = line.trim()
    // Common reply/forward separators across Outlook, Gmail and mobile clients.
    if (/^-{3,}\s*Original Message/i.test(t)) break
    if (/^_{5,}$/.test(t)) break
    if (/^From:\s/i.test(t) && out.length) break
    if (/^On .{5,80}\bwrote:$/i.test(t)) break
    if (/^Sent from my /i.test(t)) break
    if (/^Sent by JLS Yachts IT Support/i.test(t)) break
    if (t.startsWith('>')) continue
    out.push(line)
  }
  return out.join('\n').trim().slice(0, 8000)
}

type GraphMessage = {
  id: string
  subject?: string
  bodyPreview?: string
  receivedDateTime?: string
  from?: { emailAddress?: { address?: string; name?: string } }
  body?: { content?: string; contentType?: string }
}

export type InboundResult = { scanned: number; appended: number; skipped: number; errors: string[] }

export async function pollTicketMailbox(): Promise<InboundResult | null> {
  const result: InboundResult = { scanned: 0, appended: 0, skipped: 0, errors: [] }
  let token: string
  try {
    token = await getMailGraphTokenForRead()
  } catch (e: any) {
    // No mail credentials configured — stay silent rather than logging every tick.
    return null
  }

  const db = admin() as any
  const mailbox = encodeURIComponent(TICKET_MAIL_SENDER)
  // Last 7 days, newest first: enough to survive a weekend outage, small enough
  // to stay well inside the Worker's subrequest budget.
  const since = new Date(Date.now() - 7 * 864e5).toISOString()
  const url =
    `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/inbox/messages` +
    `?$top=25&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,body` +
    `&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 200)
    // Mail.Read is a separate Graph permission from Mail.Send — say so plainly.
    throw new Error(`Graph inbox read → ${res.status}: ${body}`)
  }
  const messages: GraphMessage[] = ((await res.json()) as any).value ?? []
  result.scanned = messages.length
  if (!messages.length) return result

  // Which of these have we already handled?
  const ids = messages.map(m => m.id)
  const { data: seenRows } = await db.from('ticket_mail_processed').select('message_id').in('message_id', ids)
  const seen = new Set(((seenRows ?? []) as any[]).map(r => r.message_id))

  for (const msg of messages) {
    if (seen.has(msg.id)) continue
    try {
      const from = msg.from?.emailAddress?.address ?? ''
      const subject = msg.subject ?? ''

      // Never ingest our own notifications (they'd loop the thread back on itself).
      if (from.toLowerCase() === TICKET_MAIL_SENDER.toLowerCase()) {
        await db.from('ticket_mail_processed').insert({ message_id: msg.id, outcome: 'own_notification' })
        result.skipped++
        continue
      }

      const ref = subject.match(TICKET_REF)?.[1]?.toUpperCase()
      if (!ref) {
        // A fresh email with no ticket reference — the team handles those in the
        // mailbox; record it so we don't re-examine it every five minutes.
        await db.from('ticket_mail_processed').insert({ message_id: msg.id, outcome: 'no_ticket_ref' })
        result.skipped++
        continue
      }

      const { data: ticket } = await db.from('it_tickets')
        .select('id, ticket_no, status').ilike('ticket_no', ref).maybeSingle()
      if (!ticket) {
        await db.from('ticket_mail_processed').insert({ message_id: msg.id, outcome: 'no_ticket_ref' })
        result.skipped++
        continue
      }

      const plain = msg.body?.contentType === 'html'
        ? String(msg.body?.content ?? '')
            .replace(/<br\s*\/?>(?=\s*)/gi, '\n')
            .replace(/<\/(p|div|tr|li)>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        : String(msg.body?.content ?? '')
      const text = extractReplyText(plain)
      if (!text) {
        await db.from('ticket_mail_processed').insert({ message_id: msg.id, ticket_id: ticket.id, outcome: 'no_ticket_ref' })
        result.skipped++
        continue
      }

      const author = msg.from?.emailAddress?.name || from || 'Email reply'
      const { error: insErr } = await db.from('it_ticket_messages').insert({
        ticket_id: ticket.id,
        body: text,
        internal: false,
        author_name: `${author} (email)`,
        created_at: msg.receivedDateTime ?? new Date().toISOString(),
      })
      if (insErr) throw new Error(insErr.message)

      // A reply on a resolved ticket means it isn't finished — reopen it, the way
      // any service desk does, so it comes back into the queue.
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (ticket.status === 'resolved' || ticket.status === 'closed') {
        patch.status = 'open'
        patch.resolved_at = null
        patch.closed_at = null
      }
      await db.from('it_tickets').update(patch).eq('id', ticket.id)

      await db.from('ticket_mail_processed').insert({ message_id: msg.id, ticket_id: ticket.id, outcome: 'appended' })
      result.appended++
      console.log(`[ticket-mail] appended reply from ${from} to ${ticket.ticket_no}`)
    } catch (e: any) {
      result.errors.push(`${msg.id.slice(0, 12)}: ${e?.message ?? e}`)
    }
  }

  return result
}
