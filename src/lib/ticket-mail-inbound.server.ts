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
 *
 * Mail with no reference used to be left for the team to work by hand in the
 * mailbox, which meant a forwarded problem was tracked nowhere. It now raises a
 * Polaris ticket and is mirrored to New Horizon — subject to the suppression rules
 * in `shouldNotRaiseTicket`, because "every email becomes a ticket" would otherwise
 * include every newsletter and out-of-office the mailbox receives.
 */
import { createClient } from '@supabase/supabase-js'
import { TICKET_MAIL_SENDER, getMailGraphTokenForRead } from '@/lib/graph-mail.server'
import { mirrorTicketToNewHorizon, NH_SUPPORT_MAILBOX } from '@/lib/nh-mirror.server'

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

/** `[SD-0019] …` anywhere in the subject (also matches JLS-0003-style refs). */
const TICKET_REF = /\b[A-Z]{2,5}-\d{2,6}\b/g

/**
 * Find the Polaris ticket a subject line refers to.
 *
 * Every reference in the subject is tried, not just the first. New Horizon replies
 * to a mirrored ticket arrive as `[NH-0123] Re: [SD-0021] …`, and taking the first
 * match alone meant their reply — the record of the work actually being done —
 * matched nothing and was dropped.
 */
async function matchTicket(db: any, subject: string): Promise<{ id: string; ticket_no: string; status: string } | null> {
  const refs = [...new Set((subject.match(TICKET_REF) ?? []).map(r => r.toUpperCase()))]
  for (const ref of refs) {
    const { data } = await db.from('it_tickets')
      .select('id, ticket_no, status').ilike('ticket_no', ref).maybeSingle()
    if (data) return data
  }
  return null
}

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

// ─── Which unreferenced mail deserves a ticket ────────────────────────────────

/** Headers that mark a message as machine-generated rather than written by a person. */
const AUTO_HEADERS = [
  'auto-submitted', 'x-auto-response-suppress', 'x-autoreply', 'x-autorespond',
  'precedence', 'list-unsubscribe', 'list-id',
]

/** Subjects that are never a request for help, whatever the headers say. */
const AUTOMATED_SUBJECT = [
  /^\s*(automatic reply|automatische antwort|out of office)\b/i,
  /^\s*undeliverable\b/i,
  /^\s*(delivery status notification|mail delivery (failed|subsystem)|returned mail)\b/i,
  /^\s*(read receipt|delivery receipt|not read)\b/i,
  /\bunsubscribe\b/i,
]

/**
 * Should this unreferenced email be left alone rather than raising a ticket?
 * Returns the reason to record, or null to go ahead.
 *
 * The New Horizon rule is a loop guard, not tidiness. A mirrored ticket is
 * acknowledged by their desk; if that acknowledgement raised a Polaris ticket it
 * would be mirrored straight back, acknowledged again, and so on. Their mail can
 * still be appended to a ticket it references — this only stops it creating one.
 *
 * It matches the support mailbox address exactly, not the newhorizon-it.co.uk
 * domain. Every automated message from their desk is sent by that one mailbox, so
 * the domain-wide version bought nothing and cost real work: a New Horizon
 * engineer emailing the IT desk from their own address raised no ticket at all.
 */
function shouldNotRaiseTicket(from: string, subject: string, headers: Record<string, string>): string | null {
  if (from.trim().toLowerCase() === NH_SUPPORT_MAILBOX.trim().toLowerCase()) {
    return 'new_horizon_no_ref'
  }
  if (AUTOMATED_SUBJECT.some(re => re.test(subject))) return 'automated'
  for (const name of AUTO_HEADERS) {
    const v = (headers[name] ?? '').toLowerCase()
    if (!v) continue
    // `Auto-Submitted: no` is the explicit "a person sent this" value.
    if (name === 'auto-submitted' && v === 'no') continue
    if (name === 'precedence' && !['bulk', 'junk', 'list', 'auto_reply'].includes(v)) continue
    return 'automated'
  }
  return null
}

/**
 * Read a message's internet headers.
 *
 * Fetched per message rather than added to the list query's $select: only mail
 * that is about to become a ticket needs them, which is rare, and a $select Graph
 * dislikes would take the whole poller down instead of one message. A failure here
 * is not fatal — the subject checks still apply.
 */
async function headersFor(token: string, mailbox: string, id: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${encodeURIComponent(id)}?$select=internetMessageHeaders`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return {}
    const list = ((await res.json()) as any)?.internetMessageHeaders ?? []
    const out: Record<string, string> = {}
    for (const h of list) if (h?.name) out[String(h.name).toLowerCase()] = String(h.value ?? '')
    return out
  } catch {
    return {}
  }
}

/** Strip the `RE:`/`FW:` chain an email accumulates, so the ticket reads cleanly. */
function cleanSubject(subject: string): string {
  return subject.replace(/^(\s*(re|fw|fwd|tr|aw)\s*:\s*)+/i, '').trim()
}

/**
 * Turn an unreferenced email into a Polaris ticket.
 *
 * The body is kept whole rather than run through extractReplyText. That stripper
 * exists to reduce a reply to what the person typed, and a forward is the opposite
 * case: its content sits below the `From:` line the stripper treats as the end of
 * the message, so reducing it would leave a ticket with nothing in it.
 */
async function raiseTicketFromMail(
  db: any,
  msg: GraphMessage,
  from: string,
  subject: string,
  plain: string,
): Promise<{ id: string; ticket_no: string | null } | null> {
  const body = plain.replace(/\r/g, '').trim().slice(0, 8000)
  const title = cleanSubject(subject).slice(0, 200)
  if (!body && !title) return null

  const senderName = msg.from?.emailAddress?.name || from
  const received = msg.receivedDateTime ?? new Date().toISOString()
  const description = [
    body || '(the email had no body)',
    '',
    '— Raised from email to itsupport@jlsyachts.com —',
    `From: ${senderName} <${from}>`,
    `Received: ${received}`,
    `Subject: ${subject}`,
  ].join('\n')

  const { data: t, error } = await db.from('it_tickets').insert([{
    subject: title || '(no subject)',
    description,
    // The mailbox is the IT desk's, so an emailed problem is general IT work
    // until someone triages it — not an assertion about the Polaris app.
    category: 'general',
    priority: 'normal',
    status: 'open',
    requested_by: senderName,
    requester_email: from,
  }]).select('id, ticket_no').single()
  if (error) throw new Error(error.message)
  if (!t) return null

  // The email itself opens the thread, so the ticket reads as the conversation
  // it already is rather than starting blank.
  await db.from('it_ticket_messages').insert([{
    ticket_id: t.id,
    body: body || '(the email had no body)',
    internal: false,
    author_name: `${senderName} (email)`,
    created_at: received,
  }]).then(() => {}, () => {})

  return t
}

export type InboundResult = {
  scanned: number
  appended: number
  /** Unreferenced mail that became a new Polaris ticket. */
  created: number
  skipped: number
  errors: string[]
}

export async function pollTicketMailbox(): Promise<InboundResult | null> {
  const result: InboundResult = { scanned: 0, appended: 0, created: 0, skipped: 0, errors: [] }
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

      const plain = msg.body?.contentType === 'html'
        ? String(msg.body?.content ?? '')
            .replace(/<br\s*\/?>(?=\s*)/gi, '\n')
            .replace(/<\/(p|div|tr|li)>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        : String(msg.body?.content ?? '')

      const ticket = await matchTicket(db, subject)
      if (!ticket) {
        // No ticket of ours is named — this is something new arriving in the
        // mailbox. Raise it, unless it is the kind of mail nobody works.
        const headers = await headersFor(token, mailbox, msg.id)
        const suppress = shouldNotRaiseTicket(from, subject, headers)
        if (suppress) {
          await db.from('ticket_mail_processed').insert({ message_id: msg.id, outcome: suppress })
          result.skipped++
          continue
        }
        const created = await raiseTicketFromMail(db, msg, from, subject, plain)
        if (!created) {
          await db.from('ticket_mail_processed').insert({ message_id: msg.id, outcome: 'empty_body' })
          result.skipped++
          continue
        }
        await db.from('ticket_mail_processed')
          .insert({ message_id: msg.id, ticket_id: created.id, outcome: 'created' })
        result.created++
        console.log(`[ticket-mail] raised ${created.ticket_no} from mail by ${from}`)
        // Mirrored after the dedupe row is written: if the mirror throws the
        // ticket still exists and the email is never reprocessed into a second one.
        await mirrorTicketToNewHorizon(created.id, 'Email to itsupport@jlsyachts.com', db)
        continue
      }

      const text = extractReplyText(plain)
      if (!text) {
        await db.from('ticket_mail_processed').insert({ message_id: msg.id, ticket_id: ticket.id, outcome: 'empty_body' })
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
