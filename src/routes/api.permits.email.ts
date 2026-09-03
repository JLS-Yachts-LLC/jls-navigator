/**
 * POST /api/permits/email — send a permit to the client from the app.
 *
 *   { permitId, preview: true }  → returns { subject, html, to } and sends nothing
 *   { permitId, cc?: string[] }  → sends, stamps the permit, writes the yacht log
 *
 * The permit document travels as a secure link, not an attachment: the email
 * carries a button to the branded landing page, the link expires, and each open
 * is recorded against the share (see `document-share.server.ts`).
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

export async function permitsEmailHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request, ['global_admin', 'org_admin', 'jls_staff'])
  if (!session.ok) return session.response
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let permitId = '', preview = false, cc: string[] = []
  try {
    const body = await request.json() as any
    permitId = String(body.permitId ?? '')
    preview = !!body.preview
    cc = Array.isArray(body.cc) ? body.cc.filter(Boolean).map(String) : []
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
      return json({ ok: true, preview: true, subject, html, to, vesselName, delivery })
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
      attachments: share
        ? [{ filename: 'permit document', delivery: 'secure_link', token: share.token, expires_at: share.expiresAt }]
        : permit.document_url ? [{ filename: 'permit document', delivery }] : [],
      actor_id: session.user.id,
      actor_name: session.user.email,
    }

    try {
      await sendGraphEmailWithAttachments({ to: [to], cc, subject, html, attachments: [] })
    } catch (e: any) {
      // A refusal is information, not a dead end — record it against the vessel.
      const msg = String(e?.message ?? e)
      const blocked = /switched off|currently disabled/i.test(msg)
      await sb.from('yacht_activity_log').insert([{ ...logRow, status: blocked ? 'blocked' : 'failed', error: msg.slice(0, 500) }])
      return json({ error: msg, blocked }, blocked ? 409 : 502)
    }

    await sb.from('yacht_activity_log').insert([{ ...logRow, status: 'sent' }])
    await sb.from('permits').update({
      email_sent_at: new Date().toISOString(),
      email_sent_by: session.user.id,
      email_sent_to: to,
    }).eq('id', permitId)

    return json({
      ok: true, sent: true, to, subject, label, delivery,
      secureLink: !!share,
      linkExpiresAt: share?.expiresAt ?? null,
    })
  } catch (e: any) {
    return json({ error: String(e?.message ?? e).slice(0, 300) }, 500)
  }
}
