/**
 * Inbound ticket mail — the other half of the Service Desk email loop.
 *
 * Every notification we send says "Reply to this email to add to your ticket";
 * this is what makes that true. Polls the itsupport mailbox via Graph, matches
 * the ticket reference in the subject (`[SD-0019]`), and appends the reply to
 * that ticket's thread so it appears in the app like an in-app message.
 *
 * Deliberate choices:
 *  • Dedupe in our own table (ticket_mail_processed), NOT by marking mail read —
 *    the team works this mailbox by hand and we must not touch their unread state.
 *  • Our own outbound notifications are recognised and skipped, so a ticket can
 *    never echo its own emails back into itself.
 *  • The body is reduced to what the person actually wrote (see extractReplyText).
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

// ─── Body cleanup ──────────────────────────────────────────────────────────────
// Real replies arrive wrapped in three kinds of noise, all of which made the
// ticket thread unreadable: the mail gateway's "Trusted Sender" banner ABOVE the
// message, a signature block with no delimiter (name, title, phone, URL, city),
// and a legal disclaimer. The patterns below come from the bodies we actually
// received on SD-0019, not from guesswork.

/** Invisible characters Outlook sprinkles through signatures. */
const ZERO_WIDTH = new RegExp('[​-‏  ﻿]', 'g')
const NBSP = new RegExp(' ', 'g')

/** Security-gateway notices that sit above the real message. */
const GATEWAY_BANNER = [
  /Trusted Sender\s*:/i,
  /^\s*\[?\s*EXTERNAL\s*\]?\s*[:-]/i,
  /^\s*CAUTION\s*[:-]/i,
  /^\s*This (?:message|email) (?:originated|came|was sent) from outside/i,
  /^\s*External (?:email|sender)\s*[:-]/i,
  /^\s*You don't often get email from/i,
]

/** Everything from here down is quoted history, headers or boilerplate. */
const HARD_BOUNDARY = [
  /^-{2,}\s*$/, /^_{4,}\s*$/, /^\*{4,}\s*$/,
  /^-{3,}\s*Original Message/i,
  /^From\s*:\s/i, /^Sent\s*:\s/i, /^To\s*:\s/i, /^Subject\s*:\s/i,
  /^On .{5,160}\bwrote\s*:\s*$/i,
  /^Sent from my /i, /^Get Outlook for /i,
  // Our own notification template, in case it is quoted back unmarked.
  /^Sent by JLS Yachts IT Support/i,
  /^There.s an update on your ticket/i,
  /^The IT support team has added an update/i,
  /^Reply to this email if you need anything further/i,
  /^This (?:e-?mail|message)(?: and any attachments?)?\b.*\b(?:confidential|intended solely|intended recipient)/i,
  /^(?:Confidentiality|Disclaimer|Legal)\b.*\b(?:notice|statement)/i,
  /^If you are not the intended recipient/i,
  /^Please contact the sender if you believe/i,
]

/** Signature lines — a boundary only once real message text has been seen, so a
 *  one-word reply ("Thanks") is never swallowed. */
const SIG_SIGNAL = [
  /^[A-Z][A-Z'’\-. ]{3,40}$/,                    // ALL-CAPS name
  /^(?:Kind regards|Best regards|Warm regards|Regards|Many thanks|Thanks|Thank you|Cheers|Sincerely|Yours (?:sincerely|faithfully))[,.!]?\s*$/i,
  /^\+?[\d][\d\s()\-.]{7,}$/,                         // phone-only line
  /^(?:www\.|https?:\/\/)\S+$/i,                      // bare URL
  /^[\w.+-]+@[\w.-]+\.\w{2,}$/,                       // bare email
  /^(?:Director|Managing Director|Manager|Engineer|Captain|Chief|CEO|CTO|Owner|Partner)$/i,
]

function tidy(lines: string[]): string {
  const out: string[] = []
  for (const l of lines) {
    // Collapse runs of blank lines — signatures leave a dozen behind.
    if (!l.trim() && (!out.length || !out[out.length - 1].trim())) continue
    out.push(l.replace(/[ \t]+$/, ''))
  }
  while (out.length && !out[out.length - 1].trim()) out.pop()
  return out.join('\n').trim()
}

/** Reduce a received email to just what the person actually wrote. */
export function extractReplyText(raw: string): string {
  const norm = String(raw ?? '').replace(/\r/g, '').replace(ZERO_WIDTH, '').replace(NBSP, ' ')
  let lines = norm.split('\n')

  // Drop gateway banners sitting above the message.
  let start = 0
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    if (GATEWAY_BANNER.some(re => re.test(lines[i]))) start = i + 1
  }
  lines = lines.slice(start)

  const kept: string[] = []
  let hasText = false
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('>')) continue
    if (HARD_BOUNDARY.some(re => re.test(t))) break
    if (hasText && SIG_SIGNAL.some(re => re.test(t))) break
    kept.push(line)
    if (t) hasText = true
  }

  const text = tidy(kept)
  if (text) return text.slice(0, 8000)
  // Nothing survived (e.g. the mail was only a signature) — keep the first real
  // line rather than appending an empty message.
  return (lines.map(l => l.trim()).find(Boolean) ?? '').slice(0, 500)
}

// ─── Poller ────────────────────────────────────────────────────────────────────

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
  } catch {
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
