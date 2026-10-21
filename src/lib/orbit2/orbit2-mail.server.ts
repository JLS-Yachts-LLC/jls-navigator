/**
 * Orbit 2 email thread — client replies to a bunkering request, filed on the record.
 *
 * The request email goes out from polaris@ with the Task ID first in the subject
 * (BUNK26-0007 - BUNKERING REQUEST - …) and Reply-To set to polaris@ and the
 * person who pressed Send. So a client's reply, and any reply-all after it,
 * reaches polaris@. Every 5 minutes (and on "Check for replies") Polaris reads
 * the mailboxes in `orbit2_mail_mailboxes` and:
 *
 *  • files each message whose subject names an Orbit 2 Task ID — or that sits in
 *    a conversation already filed — on that record as an `orbit2_emails` row;
 *  • copies its real attachments (not signature logos) into the record's
 *    Documents (`orbit2_files`, slot 'document', email_id set);
 *  • leaves the mailbox itself alone: nothing is marked read, moved or deleted.
 *
 * Replies typed in Polaris go out as a reply-all on the client's message
 * (`/messages/{id}/replyAll`), so Outlook threads them with the rest. That call
 * needs only Mail.Send; the quoted history is built here from the original,
 * since asking Graph for a draft would need Mail.ReadWrite.
 *
 * Dedupe is by Internet message id, which is the same in every mailbox the
 * message lands in and survives it being moved between folders.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { getMailGraphToken, getMailGraphTokenForRead } from '@/lib/graph-mail.server'
import { guardRecipients, ClientEmailDisabledError } from '@/lib/mail-guard.server'
import { extractReplyText } from '@/lib/ticket-mail-inbound.server'
import { storageRef, parseStorageRef } from '@/lib/signed-url'
import { BUNKER_CC } from '@/components/orbit2/orbit2-constants'

const db = () => supabaseAdmin as any
const GRAPH = 'https://graph.microsoft.com/v1.0'
const BUCKET = 'orbit-documents'

/** Orbit 2 Task IDs: BUNK26-0007, and the other registries' prefixes alike. */
const TASK_REF = /\b[A-Z]{2,6}\d{2}-\d{3,6}\b/g
/** The team writing on the thread from their own Outlook, as opposed to the client. */
const INTERNAL_DOMAIN = /@(?:jlsyachts\.com|newhorizon-it\.co\.uk)$/i
const LOOKBACK_DAYS = 3
/** Attachments copied per tick — the rest wait for the next one (Worker subrequests). */
const MAX_ATTACHMENTS_PER_TICK = 12
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
/** Graph's replyAll is one request, capped at 4 MB once base64'd. */
const MAX_REPLY_ATTACHMENT_BYTES = 2.8 * 1024 * 1024

type Recipient = { emailAddress?: { address?: string; name?: string } }
type GraphMessage = {
  id: string
  internetMessageId?: string
  conversationId?: string
  subject?: string
  from?: Recipient
  toRecipients?: Recipient[]
  ccRecipients?: Recipient[]
  replyTo?: Recipient[]
  receivedDateTime?: string
  sentDateTime?: string
  hasAttachments?: boolean
  isDraft?: boolean
  body?: { contentType?: string; content?: string }
  uniqueBody?: { contentType?: string; content?: string }
}
type GraphAttachment = { id: string; name?: string; contentType?: string; size?: number; isInline?: boolean; '@odata.type'?: string }

const addr = (r?: Recipient) => (r?.emailAddress?.address ?? '').trim().toLowerCase()
const addrs = (list?: Recipient[]) => (list ?? []).map(addr).filter(Boolean)
const safeFileName = (n: string) => (n || 'attachment').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function htmlToText(html: string): string {
  return String(html ?? '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function bodyText(b?: { contentType?: string; content?: string }): string {
  if (!b?.content) return ''
  return b.contentType === 'html' ? htmlToText(b.content) : String(b.content)
}

async function graphJson(token: string, url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300)
    if (res.status === 403 || /AccessDenied/i.test(body)) {
      throw new Error(`Polaris is not allowed to use this mailbox (Graph ${res.status}). The Polaris mail app needs Mail.Read and Mail.Send for it — if an Exchange ApplicationAccessPolicy limits the app to certain mailboxes, add this one to that group.`)
    }
    throw new Error(`Graph ${res.status}: ${body}`)
  }
  return res.status === 202 || res.status === 204 ? null : res.json()
}

// ── Matching ────────────────────────────────────────────────────────────────

async function matchProject(subject: string, conversationId?: string): Promise<{ id: string; task_id: string } | null> {
  const refs = [...new Set((subject.toUpperCase().match(TASK_REF) ?? []))]
  if (refs.length) {
    const { data } = await db().from('orbit2_projects').select('id, task_id').in('task_id', refs).limit(1)
    if (data?.[0]) return data[0]
  }
  // A reply whose subject was rewritten still belongs to the thread it is in.
  if (conversationId) {
    const { data } = await db().from('orbit2_emails').select('project_id, orbit2_projects(task_id)')
      .eq('conversation_id', conversationId).limit(1)
    if (data?.[0]) return { id: data[0].project_id, task_id: data[0].orbit2_projects?.task_id ?? '' }
  }
  return null
}

// ── Inbound ─────────────────────────────────────────────────────────────────

async function copyAttachments(token: string, mailbox: string, msg: GraphMessage, projectId: string, emailId: string, budget: { left: number }): Promise<number> {
  const body = await graphJson(token,
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(msg.id)}/attachments?$select=id,name,contentType,size,isInline`)
  const atts = ((body?.value ?? []) as GraphAttachment[]).filter((a) =>
    a['@odata.type'] === '#microsoft.graph.fileAttachment'
    // Inline images are signature logos and pasted screenshots in the body.
    && !a.isInline
    && (a.size ?? 0) <= MAX_ATTACHMENT_BYTES)
  // A tick that ran out of budget part-way leaves some copied already.
  const { data: have } = await db().from('orbit2_files').select('file_name').eq('email_id', emailId)
  const done = new Set(((have ?? []) as { file_name: string }[]).map((f) => f.file_name))
  let copied = 0
  for (const a of atts) {
    if (done.has(a.name || 'attachment')) continue
    if (budget.left <= 0) throw new Error('attachment budget reached')
    budget.left--
    const res = await fetch(
      `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(msg.id)}/attachments/${encodeURIComponent(a.id)}/$value`,
      { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Attachment download → ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const name = a.name || 'attachment'
    const path = `orbit2/email/${crypto.randomUUID()}-${safeFileName(name).replace(/\s+/g, '_')}`
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET)
      .upload(path, bytes, { contentType: a.contentType || 'application/octet-stream', upsert: false })
    if (upErr) throw new Error(`Could not store ${name}: ${upErr.message}`)
    const { error } = await db().from('orbit2_files').insert({
      project_id: projectId, slot: 'document', file_name: name,
      storage_ref: storageRef(BUCKET, path), email_id: emailId,
    })
    if (error) throw new Error(error.message)
    copied++
  }
  return copied
}

export type Orbit2MailResult = { mailbox: string; scanned: number; filed: number; attachments: number; error?: string }

async function pollMailbox(token: string, mailbox: string): Promise<Orbit2MailResult> {
  const out: Orbit2MailResult = { mailbox, scanned: 0, filed: 0, attachments: 0 }
  const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString()
  const list = await graphJson(token,
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages` +
    `?$top=50&$orderby=receivedDateTime desc` +
    `&$select=id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,isDraft` +
    `&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`)
  const messages = (list?.value ?? []) as GraphMessage[]
  out.scanned = messages.length
  if (!messages.length) return out

  const mids = messages.map((m) => m.internetMessageId ?? m.id)
  const { data: seenRows } = await db().from('orbit2_mail_seen').select('internet_message_id').in('internet_message_id', mids)
  const seen = new Set(((seenRows ?? []) as any[]).map((r) => r.internet_message_id))
  const budget = { left: MAX_ATTACHMENTS_PER_TICK }

  // Oldest first, so a thread is filed in the order it was written.
  for (const msg of messages.reverse()) {
    const mid = msg.internetMessageId ?? msg.id
    if (seen.has(mid)) continue
    const from = addr(msg.from)
    const markSeen = (outcome: string, projectId?: string) =>
      db().from('orbit2_mail_seen').upsert({ internet_message_id: mid, outcome, project_id: projectId ?? null })

    if (msg.isDraft || from === mailbox.toLowerCase()) { await markSeen('own'); continue }
    const project = await matchProject(msg.subject ?? '', msg.conversationId)
    if (!project) { await markSeen('unmatched'); continue }

    // The new part of the message only — not the quoted history under it.
    const full = await graphJson(token,
      `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(msg.id)}?$select=uniqueBody,body`)
    const raw = bodyText(full?.uniqueBody) || bodyText(full?.body)
    const text = extractReplyText(raw) || raw.trim().slice(0, 8000)

    // The row may already exist from a tick that ran out of attachment budget.
    let { data: row } = await db().from('orbit2_emails').select('id').eq('internet_message_id', mid).maybeSingle()
    if (!row) {
      const ins = await db().from('orbit2_emails').insert({
        project_id: project.id,
        direction: INTERNAL_DOMAIN.test(from) ? 'out' : 'in',
        mailbox, graph_message_id: msg.id, internet_message_id: mid, conversation_id: msg.conversationId ?? null,
        from_address: from || null, from_name: msg.from?.emailAddress?.name ?? null,
        to_addresses: addrs(msg.toRecipients), cc_addresses: addrs(msg.ccRecipients),
        subject: msg.subject ?? null, body_text: text,
        sent_at: msg.receivedDateTime ?? new Date().toISOString(),
      }).select('id').single()
      if (ins.error) throw new Error(ins.error.message)
      row = ins.data
      out.filed++
    }

    if (msg.hasAttachments) {
      try {
        out.attachments += await copyAttachments(token, mailbox, msg, project.id, row.id, budget)
      } catch (e) {
        // Out of budget (or a download hiccup): leave it unseen so the next tick
        // finishes the attachments; copyAttachments skips the ones already in.
        if (e instanceof Error && e.message === 'attachment budget reached') break
        throw e
      }
    }
    await markSeen('filed', project.id)
  }
  return out
}

/** Every 5 minutes from the Worker cron, and from "Check for replies" on a record. */
export async function pollOrbit2Mail(): Promise<Orbit2MailResult[] | null> {
  const { data: boxes } = await db().from('orbit2_mail_mailboxes').select('mailbox').eq('enabled', true)
  if (!boxes?.length) return null
  let token: string
  try { token = await getMailGraphTokenForRead() } catch { return null } // mail credentials not configured

  const results: Orbit2MailResult[] = []
  for (const { mailbox } of boxes as { mailbox: string }[]) {
    const now = new Date().toISOString()
    try {
      results.push(await pollMailbox(token, mailbox))
      await db().from('orbit2_mail_mailboxes').update({ last_polled_at: now, last_ok_at: now, last_error: null }).eq('mailbox', mailbox)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      results.push({ mailbox, scanned: 0, filed: 0, attachments: 0, error })
      await db().from('orbit2_mail_mailboxes').update({ last_polled_at: now, last_error: error }).eq('mailbox', mailbox)
    }
  }
  // Keep the seen list to what the lookback can still return.
  await db().from('orbit2_mail_seen').delete().lt('seen_at', new Date(Date.now() - 30 * 864e5).toISOString())
  return results
}

// ── Outbound ────────────────────────────────────────────────────────────────

/** The bunkering request itself, recorded so the thread starts where it did. */
export async function logOrbit2Outbound(row: {
  project_id: string; mailbox: string; to: string[]; cc: string[]; subject: string; body_text: string; sent_by: string | null; from_name?: string | null
}): Promise<string | null> {
  const { data } = await db().from('orbit2_emails').insert({
    project_id: row.project_id, direction: 'out', mailbox: row.mailbox,
    from_address: row.mailbox, from_name: row.from_name ?? null,
    to_addresses: row.to, cc_addresses: row.cc, subject: row.subject, body_text: row.body_text,
    sent_by: row.sent_by,
  }).select('id').single()
  return data?.id ?? null
}

async function storageBytes(stored: string): Promise<Uint8Array> {
  const ref = parseStorageRef(stored, BUCKET)
  if (!ref) throw new Error('File reference not understood')
  const { data, error } = await supabaseAdmin.storage.from(ref.bucket).download(ref.path)
  if (error || !data) throw new Error(`Could not read the file: ${error?.message ?? 'missing'}`)
  return new Uint8Array(await data.arrayBuffer())
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/**
 * Reply-all on a filed client email, from the mailbox it arrived in.
 * The bunkering team stays copied; the person replying is on Reply-To so the
 * client's answer reaches them as well as Polaris.
 */
export async function replyOnOrbit2Thread(opts: {
  projectId: string
  emailId?: string | null
  text: string
  cc?: string[]
  fileIds?: string[]
  userId: string
  userEmail: string
  senderName: string
}): Promise<{ id: string | null; to: string[]; cc: string[] }> {
  // The message being answered: the one picked, or the client's latest.
  let q = db().from('orbit2_emails').select('*').eq('project_id', opts.projectId).not('graph_message_id', 'is', null)
  q = opts.emailId ? q.eq('id', opts.emailId) : q.eq('direction', 'in').order('sent_at', { ascending: false }).limit(1)
  const { data: rows } = await q
  const target = rows?.[0]
  if (!target) throw new Error('There is no client email on this record to reply to yet.')
  const mailbox: string = target.mailbox

  const token = await getMailGraphToken()
  const base = `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages`
  // Graph's id changes if the message is moved between folders; the Internet id does not.
  let original: GraphMessage | null = null
  try {
    original = await graphJson(token, `${base}/${encodeURIComponent(target.graph_message_id)}?$select=id,from,replyTo,toRecipients,ccRecipients,sentDateTime,subject,body`)
  } catch {
    const found = await graphJson(token,
      `${base}?$filter=${encodeURIComponent(`internetMessageId eq '${String(target.internet_message_id).replace(/'/g, "''")}'`)}&$select=id,from,replyTo,toRecipients,ccRecipients,sentDateTime,subject,body`)
    original = found?.value?.[0] ?? null
  }
  if (!original) throw new Error('The email being answered is no longer in the mailbox.')

  const self = opts.userEmail.toLowerCase()
  const box = mailbox.toLowerCase()
  const replyTo = addrs(original.replyTo)
  const to = [...new Set([...(replyTo.length ? replyTo : [addr(original.from)]), ...addrs(original.toRecipients)])]
    .filter((a) => a && a !== box && a !== self)
  const cc = [...new Set([...addrs(original.ccRecipients), ...BUNKER_CC, ...(opts.cc ?? []).map((a) => a.trim().toLowerCase())])]
    .filter((a) => a && a !== box && a !== self && !to.includes(a))
  const guard = guardRecipients(to, cc, `Orbit 2 reply "${original.subject ?? ''}"`)
  if (guard.suppressed) throw new ClientEmailDisabledError(original.subject ?? '', guard.blocked)
  if (!guard.to.length) throw new Error('Nobody to reply to on that email.')

  // Attachments — from the record's own files, so what was sent is on the record.
  const attachments: any[] = []
  let total = 0
  if (opts.fileIds?.length) {
    const { data: files } = await db().from('orbit2_files').select('id, file_name, storage_ref')
      .eq('project_id', opts.projectId).in('id', opts.fileIds)
    for (const f of (files ?? []) as { file_name: string; storage_ref: string }[]) {
      const bytes = await storageBytes(f.storage_ref)
      total += bytes.length
      if (total > MAX_REPLY_ATTACHMENT_BYTES) throw new Error('Attachments on a reply are limited to about 2.8 MB in total.')
      attachments.push({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: f.file_name, contentBytes: toBase64(bytes),
      })
    }
  }

  const ours = esc(opts.text.trim()).replace(/\n/g, '<br/>')
  const when = original.sentDateTime ? new Date(original.sentDateTime).toUTCString() : ''
  const who = original.from?.emailAddress?.name || addr(original.from)
  const quoted = original.body?.contentType === 'html'
    ? String(original.body.content ?? '').replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '')
    : esc(String(original.body?.content ?? '')).replace(/\n/g, '<br/>')
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">
      <p>${ours}</p>
      <p>Thank you,<br/>${esc(opts.senderName)}</p>
    </div>
    <hr style="border:none;border-top:1px solid #ccc;margin:16px 0"/>
    <div style="font-family:Arial,sans-serif;font-size:13px;color:#555">
      <p><strong>From:</strong> ${esc(who)}${when ? `<br/><strong>Sent:</strong> ${esc(when)}` : ''}<br/><strong>Subject:</strong> ${esc(original.subject ?? '')}</p>
    </div>
    <blockquote style="margin:0 0 0 8px;padding-left:8px;border-left:2px solid #ccc">${quoted}</blockquote>`

  await graphJson(token, `${base}/${encodeURIComponent(original.id)}/replyAll`, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        toRecipients: guard.to.map((a) => ({ emailAddress: { address: a } })),
        ccRecipients: guard.cc.map((a) => ({ emailAddress: { address: a } })),
        replyTo: [mailbox, ...(self ? [self] : [])].map((a) => ({ emailAddress: { address: a } })),
        body: { contentType: 'HTML', content: html },
        ...(attachments.length ? { attachments } : {}),
      },
    }),
  })

  const subject = /^re:/i.test(original.subject ?? '') ? original.subject : `RE: ${original.subject ?? ''}`
  const { data: logged } = await db().from('orbit2_emails').insert({
    project_id: opts.projectId, direction: 'out', mailbox,
    conversation_id: target.conversation_id, from_address: mailbox, from_name: opts.senderName,
    to_addresses: guard.to, cc_addresses: guard.cc, subject, body_text: opts.text.trim(),
    sent_by: opts.userId,
  }).select('id').single()
  if (logged?.id && opts.fileIds?.length) {
    await db().from('orbit2_files').update({ email_id: logged.id })
      .eq('project_id', opts.projectId).in('id', opts.fileIds).is('email_id', null)
  }
  return { id: logged?.id ?? null, to: guard.to, cc: guard.cc }
}
