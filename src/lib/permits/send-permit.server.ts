/**
 * Send a permit to the client — the one path every permit email takes.
 *
 * Used by POST /api/permits/email (the permit dialogs) and by the Permit Inbox's
 * "Confirm, file & send to yacht". The permit document travels as a secure,
 * expiring link (or a pointer to the portal, if the client asked for that);
 * anything extra the sender adds goes as an ordinary attachment.
 *
 * Every attempt is recorded twice, including a refusal:
 *   - yacht_activity_log, so the Yacht view shows what was tried and what was
 *     delivered (with the full message body);
 *   - audit_log (module 'permits', event 'export'), so "everything this person
 *     sent out" is one query alongside every other audited action.
 * While client email is switched off the mail guard throws, and the attempt is
 * logged as 'blocked' with the reason rather than silently dropped.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendGraphEmailWithAttachments } from '@/lib/graph-mail.server'
import {
  loadPermitForEmail, renderPermitEmail, PERMIT_LABELS,
  loadPermitsForBatchEmail, renderPermitBatchEmail,
} from '@/lib/permits/permit-email.server'
import { createDocumentShare, documentButtonHtml, portalPointerHtml, DEFAULT_SHARE_TTL_DAYS } from '@/lib/document-share.server'
import { logAuditEvent } from '@/lib/admin/audit'

export type PermitAttachment = { filename: string; contentType: string; contentBase64: string; size: number }

export type PermitSendActor = {
  id: string
  email: string
  role: string
  ip?: string | null
  userAgent?: string | null
}

export type PermitSendResult = {
  to: string[]
  subject: string
  label: string
  delivery: 'secure_link' | 'portal'
  secureLink: boolean
  linkExpiresAt: string | null
  attachments: number
}

/** A send that did not go out; `blocked` = refused by the client-email switch. */
export class PermitSendError extends Error {
  constructor(message: string, readonly status: number, readonly blocked = false) { super(message) }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** All valid addresses in a free-text field ("a@x.com; b@y.com"). */
export function parseEmailList(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(/[\s;,]+/)
  return [...new Set(parts.map((e) => e.trim().replace(/^mailto:/i, '').replace(/[<>()]/g, '')).filter((e) => EMAIL_RE.test(e)))]
}

/**
 * @param to   recipients; defaults to the permit's own client contact.
 * @param via  where the send started, for the audit line ("permit dialog", "Permit Inbox").
 */
export async function sendPermitToClient(opts: {
  permitId: string
  to?: string[]
  cc?: string[]
  extra?: PermitAttachment[]
  actor: PermitSendActor
  via: string
}): Promise<PermitSendResult> {
  const { permitId, actor, via } = opts
  const cc = opts.cc ?? []
  const extra = opts.extra ?? []
  const sb = supabaseAdmin as any

  const { permit, vesselName, template, delivery } = await loadPermitForEmail(permitId)
  const to = opts.to?.length ? opts.to : parseEmailList(permit.contact_email)
  if (!to.length) throw new PermitSendError('This permit has no client email address.', 400)

  const label = PERMIT_LABELS[permit.permit_type] ?? 'Permit'
  const reference = String(permit.permit_number ?? permit.license_no ?? '').trim() || null
  const purpose = [
    `Your ${label} for ${vesselName || 'your vessel'}`,
    permit.issuing_authority ? `issued by ${permit.issuing_authority}` : null,
    'is ready. Please keep a copy on board.',
  ].filter(Boolean).join(' ')

  // Secure link rather than an attachment: the document stays in our storage,
  // the link expires, and every open is recorded against the share. A client
  // who asked to be pointed at the portal instead gets no token at all.
  const share = permit.document_url && delivery === 'secure_link'
    ? await createDocumentShare({
        storageRef: permit.document_url,
        title: label,
        reference,
        purpose,
        vesselName,
        recipientEmail: to.join(', '),
        sourceTable: 'permits',
        sourceId: permitId,
        createdBy: actor.id,
      })
    : null

  const documentBlock = share
    ? documentButtonHtml({ url: share.url, title: label, reference, purpose, expiresAt: share.expiresAt })
    : permit.document_url && delivery === 'portal'
      ? portalPointerHtml({ title: label, reference })
      : null
  const { subject, html } = renderPermitEmail({ permit, vesselName }, template, documentBlock)
  const logRow = {
    yacht_id: permit.yacht_id ?? null,
    permit_id: permitId,
    kind: permit.permit_type ?? 'permit',
    channel: 'email',
    subject,
    recipients: to,
    cc,
    body_html: html,
    attachments: [
      ...(share
        ? [{ filename: 'permit document', delivery: 'secure_link', token: share.token, expires_at: share.expiresAt }]
        : permit.document_url ? [{ filename: 'permit document', delivery }] : []),
      ...extra.map(a => ({ filename: a.filename, delivery: 'attachment', content_type: a.contentType, size: a.size })),
    ],
    actor_id: actor.id,
    actor_name: actor.email,
  }

  const what = `${label}${reference ? ` ${reference}` : ''} for ${vesselName || 'the vessel'}`
  const recipients = `${to.join(', ')}${cc.length ? ` (cc ${cc.join(', ')})` : ''}`
  const audit = (result: 'success' | 'blocked' | 'failed', detail: string) => logAuditEvent({
    event_type: 'EXPORT',
    module: 'permits',
    actor_id: actor.id, actor_email: actor.email, actor_role: actor.role,
    target_type: 'permit', target_id: permitId, target_label: what,
    detail, ip_address: actor.ip ?? null, user_agent: actor.userAgent ?? null,
    result,
  })

  try {
    await sendGraphEmailWithAttachments({
      to, cc, subject, html,
      attachments: extra.map(({ filename, contentType, contentBase64 }) => ({ filename, contentType, contentBase64 })),
    })
  } catch (e: any) {
    // A refusal is information, not a dead end — record it against the vessel.
    const msg = String(e?.message ?? e)
    const blocked = /switched off|currently disabled/i.test(msg)
    await sb.from('yacht_activity_log').insert([{ ...logRow, status: blocked ? 'blocked' : 'failed', error: msg.slice(0, 500) }])
    await audit(blocked ? 'blocked' : 'failed', `Tried to email ${what} to ${recipients} from the ${via} — ${blocked ? 'blocked' : 'failed'}: ${msg.slice(0, 300)}`)
    throw new PermitSendError(msg, blocked ? 409 : 502, blocked)
  }

  await sb.from('yacht_activity_log').insert([{ ...logRow, status: 'sent' }])
  await audit('success', `Emailed ${what} to ${recipients} from the ${via}${
    share ? ` — secure link, expires ${share.expiresAt.slice(0, 10)}` : delivery === 'portal' ? ' — pointed to the client portal' : ''
  }${extra.length ? ` + ${extra.length} attachment${extra.length === 1 ? '' : 's'}` : ''}`)

  // Sending the client the permit document means it has been issued, so a
  // pending permit becomes active. Most permit dialogs had no status control,
  // so permits sat at "Pending" after the client already had them and staff
  // re-sent them. Expired/cancelled are never touched.
  const issued = !!permit.document_url && permit.status === 'pending'
  await sb.from('permits').update({
    email_sent_at: new Date().toISOString(),
    email_sent_by: actor.id,
    email_sent_to: to.join(', '),
    // Remember who the vessel's contact is, so the permit dialog's Send works next time.
    ...(!String(permit.contact_email ?? '').trim() ? { contact_email: to[0] } : {}),
    ...(issued ? { status: 'active' } : {}),
  }).eq('id', permitId)

  // The sender's own confirmation, if they want one (My notifications).
  const { notifySentToClient } = await import('@/lib/staff-notifications.server')
  await notifySentToClient({
    userId: actor.id, document: label, reference, vessel: vesselName || null,
    to, cc, secureLinkExpiresAt: share?.expiresAt ?? null,
  })

  return {
    to, subject, label, delivery,
    secureLink: !!share,
    linkExpiresAt: share?.expiresAt ?? null,
    attachments: extra.length,
  }
}

/** Most permits one batch email may carry. */
export const MAX_BATCH_PERMITS = 50

export type PermitBatchResult = {
  to: string[]
  subject: string
  count: number
  delivery: 'secure_link' | 'portal'
  /** How many of the permits went with a secure document link. */
  secureLinks: number
  linkExpiresAt: string | null
  attachments: number
}

/**
 * Several permits for one vessel in one email (SD-0081). Each permit with a
 * document gets its own secure link; every permit is logged against the vessel,
 * audited and stamped as sent exactly as a single send would be.
 */
export async function sendPermitBatchToClient(opts: {
  permitIds: string[]
  to?: string[]
  cc?: string[]
  extra?: PermitAttachment[]
  actor: PermitSendActor
  via: string
}): Promise<PermitBatchResult> {
  const { permitIds, actor, via } = opts
  const cc = opts.cc ?? []
  const extra = opts.extra ?? []
  const sb = supabaseAdmin as any

  const { permits, vesselName, delivery } = await loadPermitsForBatchEmail(permitIds)
  const to = opts.to?.length ? opts.to : parseEmailList(permits.map(p => p.contact_email ?? '').join(';'))
  if (!to.length) throw new PermitSendError('None of these permits has a client email address.', 400)

  const label = PERMIT_LABELS[permits[0].permit_type] ?? 'Permit'
  const items = await Promise.all(permits.map(async (permit) => {
    const reference = String(permit.permit_number ?? permit.license_no ?? '').trim() || null
    const share = permit.document_url && delivery === 'secure_link'
      ? await createDocumentShare({
          storageRef: permit.document_url,
          title: [label, permit.holder_name].filter(Boolean).join(' — '),
          reference,
          purpose: `Your ${label} for ${vesselName}. Please keep a copy on board.`,
          vesselName,
          recipientEmail: to.join(', '),
          sourceTable: 'permits',
          sourceId: permit.id,
          createdBy: actor.id,
        })
      : null
    return { permit, reference, share }
  }))
  const linkExpiresAt = items.find(i => i.share)?.share?.expiresAt ?? null
  const { subject, html } = renderPermitBatchEmail({
    items: items.map(i => ({ permit: i.permit, documentLink: i.share ? { url: i.share.url } : null })),
    vesselName, delivery, linkExpiresAt,
  })

  const logRows = items.map(({ permit, share }) => ({
    yacht_id: permit.yacht_id ?? null,
    permit_id: permit.id,
    kind: permit.permit_type ?? 'permit',
    channel: 'email',
    subject,
    recipients: to,
    cc,
    body_html: html,
    attachments: [
      ...(share
        ? [{ filename: 'permit document', delivery: 'secure_link', token: share.token, expires_at: share.expiresAt }]
        : permit.document_url ? [{ filename: 'permit document', delivery }] : []),
      ...extra.map(a => ({ filename: a.filename, delivery: 'attachment', content_type: a.contentType, size: a.size })),
    ],
    actor_id: actor.id,
    actor_name: actor.email,
  }))

  const recipients = `${to.join(', ')}${cc.length ? ` (cc ${cc.join(', ')})` : ''}`
  const audit = (result: 'success' | 'blocked' | 'failed', detail: (what: string) => string) => Promise.all(items.map(({ permit, reference }) => {
    const what = `${label}${reference ? ` ${reference}` : ''} for ${vesselName}`
    return logAuditEvent({
      event_type: 'EXPORT',
      module: 'permits',
      actor_id: actor.id, actor_email: actor.email, actor_role: actor.role,
      target_type: 'permit', target_id: permit.id, target_label: what,
      detail: detail(what), ip_address: actor.ip ?? null, user_agent: actor.userAgent ?? null,
      result,
    })
  }))
  const batchNote = `as one of ${items.length} in a batch email`

  try {
    await sendGraphEmailWithAttachments({
      to, cc, subject, html,
      attachments: extra.map(({ filename, contentType, contentBase64 }) => ({ filename, contentType, contentBase64 })),
    })
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    const blocked = /switched off|currently disabled/i.test(msg)
    await sb.from('yacht_activity_log').insert(logRows.map(r => ({ ...r, status: blocked ? 'blocked' : 'failed', error: msg.slice(0, 500) })))
    await audit(blocked ? 'blocked' : 'failed', (what) =>
      `Tried to email ${what} to ${recipients} ${batchNote} from the ${via} — ${blocked ? 'blocked' : 'failed'}: ${msg.slice(0, 300)}`)
    throw new PermitSendError(msg, blocked ? 409 : 502, blocked)
  }

  await sb.from('yacht_activity_log').insert(logRows.map(r => ({ ...r, status: 'sent' })))
  await audit('success', (what) => `Emailed ${what} to ${recipients} ${batchNote} from the ${via}${
    linkExpiresAt ? ` — secure links, expire ${linkExpiresAt.slice(0, 10)}` : delivery === 'portal' ? ' — pointed to the client portal' : ''
  }${extra.length ? ` + ${extra.length} attachment${extra.length === 1 ? '' : 's'}` : ''}`)

  // Same stamping as a single send: sent markers, remember the contact, and a
  // pending permit with a document becomes active once the client has it.
  const now = new Date().toISOString()
  await Promise.all(permits.map((permit) => sb.from('permits').update({
    email_sent_at: now,
    email_sent_by: actor.id,
    email_sent_to: to.join(', '),
    ...(!String(permit.contact_email ?? '').trim() ? { contact_email: to[0] } : {}),
    ...(permit.document_url && permit.status === 'pending' ? { status: 'active' } : {}),
  }).eq('id', permit.id)))

  const { notifySentToClient } = await import('@/lib/staff-notifications.server')
  await notifySentToClient({
    userId: actor.id, document: `${items.length} × ${label}`, reference: null, vessel: vesselName,
    to, cc, secureLinkExpiresAt: linkExpiresAt,
  })

  return {
    to, subject, count: items.length, delivery,
    secureLinks: items.filter(i => i.share).length,
    linkExpiresAt,
    attachments: extra.length,
  }
}

/** What a batch send would look like, with placeholder links; sends nothing. */
export async function previewPermitBatch(permitIds: string[]): Promise<{
  subject: string; html: string; to: string; vesselName: string
  delivery: 'secure_link' | 'portal'; count: number; withDocument: number
}> {
  const { permits, vesselName, delivery } = await loadPermitsForBatchEmail(permitIds)
  const { subject, html } = renderPermitBatchEmail({
    items: permits.map(permit => ({ permit, documentLink: permit.document_url ? { url: '#' } : null })),
    vesselName, delivery,
    linkExpiresAt: new Date(Date.now() + DEFAULT_SHARE_TTL_DAYS * 86400000).toISOString(),
  })
  return {
    subject, html, vesselName, delivery,
    to: parseEmailList(permits.map(p => p.contact_email ?? '').join(';')).join(', '),
    count: permits.length,
    withDocument: permits.filter(p => p.document_url).length,
  }
}
