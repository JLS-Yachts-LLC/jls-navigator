/**
 * POST /api/permits/email — send a permit to the client from the app.
 *
 *   { permitId, preview: true }  → returns { subject, html, to } and sends nothing
 *   { permitId, cc?: string[] }  → sends, stamps the permit, writes the yacht log
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

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

/** Fetch the permit document so it rides with the email rather than as a link. */
async function fetchAttachment(url: string): Promise<{ filename: string; contentBase64: string; contentType: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    // 4MB ceiling: Graph's simple attachment limit, and beyond that a link is
    // kinder to the recipient's inbox anyway.
    if (buf.byteLength > 4_000_000) return null
    let binary = ''
    for (let i = 0; i < buf.length; i += 8192) {
      binary += String.fromCharCode(...buf.subarray(i, i + 8192))
    }
    const name = decodeURIComponent((url.split('/').pop() ?? 'permit').split('?')[0]) || 'permit.pdf'
    return {
      filename: name,
      contentBase64: btoa(binary),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    }
  } catch { return null }
}

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
    const { permit, vesselName, template } = await loadPermitForEmail(permitId)
    const { subject, html } = renderPermitEmail({ permit, vesselName }, template)
    const to = String(permit.contact_email ?? '').trim()

    if (preview) {
      return json({ ok: true, preview: true, subject, html, to, vesselName })
    }
    if (!to) return json({ error: 'This permit has no client email address.' }, 400)

    const attachment = permit.document_url ? await fetchAttachment(permit.document_url) : null
    const logRow = {
      yacht_id: permit.yacht_id ?? null,
      permit_id: permitId,
      kind: permit.permit_type ?? 'permit',
      channel: 'email',
      subject,
      recipients: [to],
      cc,
      body_html: html,
      attachments: attachment
        ? [{ filename: attachment.filename, bytes: attachment.contentBase64.length }]
        : permit.document_url ? [{ filename: 'permit document', link_only: true }] : [],
      actor_id: session.user.id,
      actor_name: session.user.email,
    }

    try {
      await sendGraphEmailWithAttachments({
        to: [to], cc, subject, html,
        attachments: attachment ? [attachment] : [],
      })
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
      ok: true, sent: true, to, subject,
      label: PERMIT_LABELS[permit.permit_type] ?? 'Permit',
      attached: !!attachment,
    })
  } catch (e: any) {
    return json({ error: String(e?.message ?? e).slice(0, 300) }, 500)
  }
}
