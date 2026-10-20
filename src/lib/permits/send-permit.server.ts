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
import { loadPermitForEmail, renderPermitEmail, PERMIT_LABELS } from '@/lib/permits/permit-email.server'
import { createDocumentShare, documentButtonHtml, portalPointerHtml } from '@/lib/document-share.server'
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
