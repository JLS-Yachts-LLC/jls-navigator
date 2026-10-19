/**
 * POST /api/permits/email — send a permit to the client from the app.
 *
 *   { permitId, preview: true }  → returns { subject, html, to } and sends nothing
 *   { permitId, cc?: string[], attachments?: [{ filename, contentType, contentBase64 }] }
 *                                → sends, stamps the permit, writes the yacht log
 *
 * The permit document travels as a secure link, not an attachment: the email
 * carries a button to the branded landing page, the link expires, and each open
 * is recorded against the share (see `document-share.server.ts`). Anything the
 * sender adds in the review dialog (a quote, a letter) goes as an ordinary
 * attachment alongside it.
 *
 * Every attempt is recorded in yacht_activity_log, including a refusal: while
 * client email is switched off the guard throws and the attempt is logged as
 * 'blocked' with the reason, so the Yacht view shows what was tried as well as
 * what was delivered.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendGraphEmailWithAttachments } from '@/lib/graph-mail.server'
import { loadPermitForEmail, renderPermitEmail, PERMIT_LABELS } from '@/lib/permits/permit-email.server'
import { createDocumentShare, documentButtonHtml, portalPointerHtml, DEFAULT_SHARE_TTL_DAYS } from '@/lib/document-share.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

// Graph accepts a file attachment in a single request only up to 3 MB.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024
const MAX_ATTACHMENTS = 10

type Attachment = { filename: string; contentType: string; contentBase64: string; size: number }

/** Validate what the review dialog sent; a string is the reason it was refused. */
function parseAttachments(raw: unknown): Attachment[] | string {
  if (raw == null) return []
  if (!Array.isArray(raw)) return 'attachments must be a list'
  if (raw.length > MAX_ATTACHMENTS) return `At most ${MAX_ATTACHMENTS} attachments per email`
  const out: Attachment[] = []
  for (const a of raw as any[]) {
    const filename = String(a?.filename ?? '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').trim().slice(0, 150)
    const contentBase64 = String(a?.contentBase64 ?? '')
    if (!filename || !contentBase64) return 'Each attachment needs a file name and content'
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)) return `"${filename}" is not valid file content`
    const size = Math.floor(contentBase64.length * 3 / 4) - (contentBase64.match(/=+$/)?.[0].length ?? 0)
    if (size > MAX_ATTACHMENT_BYTES) return `"${filename}" is over 3 MB — too large to attach`
    const contentType = String(a?.contentType ?? '').trim().slice(0, 100) || 'application/octet-stream'
    out.push({ filename, contentType, contentBase64, size })
  }
  return out
}

export async function permitsEmailHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request, ['global_admin', 'org_admin', 'jls_staff'])
  if (!session.ok) return session.response
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let permitId = '', preview = false, cc: string[] = [], extra: Attachment[] = []
  try {
    const body = await request.json() as any
    permitId = String(body.permitId ?? '')
    preview = !!body.preview
    cc = Array.isArray(body.cc) ? body.cc.filter(Boolean).map(String) : []
    const parsed = parseAttachments(body.attachments)
    if (typeof parsed === 'string') return json({ error: parsed }, 400)
    extra = parsed
  } catch { return json({ error: 'Invalid request body' }, 400) }
  if (!permitId) return json({ error: 'permitId is required' }, 400)

  const sb = supabaseAdmin as any

  try {
    const { permit, vesselName, template, delivery } = await loadPermitForEmail(permitId)
    const to = String(permit.contact_email ?? '').trim()
    const label = PERMIT_LABELS[permit.permit_type] ?? 'Permit'
    const reference = String(permit.permit_number ?? permit.license_no ?? '').trim() || null
    const purpose = [
      `Your ${label} for ${vesselName || 'your vessel'}`,
      permit.issuing_authority ? `issued by ${permit.issuing_authority}` : null,
      'is ready. Please keep a copy on board.',
    ].filter(Boolean).join(' ')

    // A preview must show the real layout without burning a token, so it renders
    // the button against a placeholder link.
    if (preview) {
      const previewBlock = !permit.document_url
        ? null
        : delivery === 'portal'
          ? portalPointerHtml({ title: label, reference })
          : documentButtonHtml({
              url: '#',
              title: label,
              reference,
              purpose,
              expiresAt: new Date(Date.now() + DEFAULT_SHARE_TTL_DAYS * 86400000).toISOString(),
            })
      const { subject, html } = renderPermitEmail({ permit, vesselName }, template, previewBlock)
      return json({ ok: true, preview: true, subject, html, to, vesselName, delivery, hasDocument: !!permit.document_url })
    }
    if (!to) return json({ error: 'This permit has no client email address.' }, 400)

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
          recipientEmail: to,
          sourceTable: 'permits',
          sourceId: permitId,
          createdBy: session.user.id,
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
      recipients: [to],
      cc,
      body_html: html,
      attachments: [
        ...(share
          ? [{ filename: 'permit document', delivery: 'secure_link', token: share.token, expires_at: share.expiresAt }]
          : permit.document_url ? [{ filename: 'permit document', delivery }] : []),
        ...extra.map(a => ({ filename: a.filename, delivery: 'attachment', content_type: a.contentType, size: a.size })),
      ],
      actor_id: session.user.id,
      actor_name: session.user.email,
    }

    try {
      await sendGraphEmailWithAttachments({
        to: [to], cc, subject, html,
        attachments: extra.map(({ filename, contentType, contentBase64 }) => ({ filename, contentType, contentBase64 })),
      })
    } catch (e: any) {
      // A refusal is information, not a dead end — record it against the vessel.
      const msg = String(e?.message ?? e)
      const blocked = /switched off|currently disabled/i.test(msg)
      await sb.from('yacht_activity_log').insert([{ ...logRow, status: blocked ? 'blocked' : 'failed', error: msg.slice(0, 500) }])
      return json({ error: msg, blocked }, blocked ? 409 : 502)
    }

    await sb.from('yacht_activity_log').insert([{ ...logRow, status: 'sent' }])
    // Sending the client the permit document means it has been issued, so a
    // pending permit becomes active. Most permit dialogs had no status control,
    // so permits sat at "Pending" after the client already had them and staff
    // re-sent them. Expired/cancelled are never touched.
    const issued = !!permit.document_url && permit.status === 'pending'
    await sb.from('permits').update({
      email_sent_at: new Date().toISOString(),
      email_sent_by: session.user.id,
      email_sent_to: to,
      ...(issued ? { status: 'active' } : {}),
    }).eq('id', permitId)

    // The sender's own confirmation, if they want one (My notifications).
    const { notifySentToClient } = await import('@/lib/staff-notifications.server')
    await notifySentToClient({
      userId: session.user.id, document: label, reference, vessel: vesselName || null,
      to: [to], cc, secureLinkExpiresAt: share?.expiresAt ?? null,
    })

    return json({
      ok: true, sent: true, to, subject, label, delivery,
      secureLink: !!share,
      linkExpiresAt: share?.expiresAt ?? null,
      attachments: extra.length,
    })
  } catch (e: any) {
    return json({ error: String(e?.message ?? e).slice(0, 300) }, 500)
  }
}
