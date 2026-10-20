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
 * The send itself (secure link, yacht_activity_log + audit_log, stamping the
 * permit) lives in `send-permit.server.ts`, shared with the Permit Inbox.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { loadPermitForEmail, renderPermitEmail, PERMIT_LABELS } from '@/lib/permits/permit-email.server'
import { documentButtonHtml, portalPointerHtml, DEFAULT_SHARE_TTL_DAYS } from '@/lib/document-share.server'
import { sendPermitToClient, PermitSendError, type PermitAttachment } from '@/lib/permits/send-permit.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

// Graph accepts a file attachment in a single request only up to 3 MB.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024
const MAX_ATTACHMENTS = 10

type Attachment = PermitAttachment

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

    try {
      const r = await sendPermitToClient({
        permitId, cc, extra, via: 'permit dialog',
        actor: {
          id: session.user.id, email: session.user.email, role: session.user.role,
          ip: request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
        },
      })
      return json({ ok: true, sent: true, ...r, to: r.to.join(', ') })
    } catch (e) {
      if (e instanceof PermitSendError) return json({ error: e.message, blocked: e.blocked }, e.status)
      throw e
    }
  } catch (e: any) {
    return json({ error: String(e?.message ?? e).slice(0, 300) }, 500)
  }
}
