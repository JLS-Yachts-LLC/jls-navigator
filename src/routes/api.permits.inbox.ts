/**
 * POST /api/permits/inbox — the Permit Inbox's actions (staff only).
 *
 *   { action: 'poll' }                                  check the watched mailboxes now
 *   { action: 'upload', fileName, contentBase64 }      read a PDF someone has to hand
 *   { action: 'folders', yachtId, permitType, dmaPhase, year }
 *                                                       the vessel's SharePoint subfolders + the suggested one
 *   { action: 'match', id, yachtId, permitType, dmaPhase }
 *                                                       the permit an item would update for this vessel
 *   { action: 'recipients', yachtId }                   who the vessel's permits usually go to
 *   { action: 'confirm', ...ConfirmInput, sendTo? }     create/update the permit, file the PDF in SharePoint,
 *                                                       and (with sendTo) email it to the yacht
 *   { action: 'send', id, sendTo }                      email an already-filed permit to the yacht
 *   { action: 'refile', id }                            retry the SharePoint copy
 *   { action: 'reject', id, as: 'rejected' | 'not_permit' }
 *   { action: 'reread', id }                            read the PDF again (also "this IS a permit")
 *
 * All writes to permit_inbox go through here (service role); staff only read it.
 * Emails go through the shared permit sender, which logs every attempt (sent,
 * blocked or failed) to yacht_activity_log and audit_log.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendPermitToClient, parseEmailList, PermitSendError } from '@/lib/permits/send-permit.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

export async function permitInboxHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request, ['global_admin', 'org_admin', 'jls_staff'])
  if (!session.ok) return session.response
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let body: any
  try { body = await request.json() } catch { return json({ error: 'Invalid request body' }, 400) }
  const inbox = await import('@/lib/permits/permit-inbox.server')
  const sb = supabaseAdmin as any
  const actor = {
    id: session.user.id, email: session.user.email, role: session.user.role,
    ip: request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  }
  // Email a filed permit to the yacht. A failure here never undoes the filing —
  // the permit is saved either way, and the answer says whether the email went.
  const sendToYacht = async (permitId: string, to: string[]) => {
    try {
      const r = await sendPermitToClient({ permitId, to, actor, via: 'Permit Inbox' })
      return { ok: true as const, to: r.to, delivery: r.delivery, secureLink: r.secureLink, linkExpiresAt: r.linkExpiresAt }
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
        blocked: e instanceof PermitSendError && e.blocked,
      }
    }
  }

  try {
    switch (body?.action) {
      case 'poll':
        return json({ results: await inbox.pollPermitInbox() })

      case 'upload': {
        const b64 = String(body.contentBase64 ?? '')
        if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return json({ error: 'Choose a PDF to upload' }, 400)
        const bin = atob(b64)
        if (bin.length > MAX_UPLOAD_BYTES) return json({ error: 'That file is over 15 MB' }, 400)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') return json({ error: 'Only PDF files can be read' }, 400)
        // Someone chose to upload it, so it goes to review even if it doesn't read as a permit.
        const res = await inbox.ingestPdf(bytes, {
          source: 'upload', file_name: s(body.fileName) ?? 'permit.pdf',
          from_address: session.user.email, received_at: new Date().toISOString(),
        }, { forcePermit: true })
        return json(res)
      }

      case 'folders': {
        const { data: y } = await sb.from('yachts').select('vessel_name').eq('id', String(body.yachtId ?? '')).maybeSingle()
        if (!y?.vessel_name) return json({ error: 'Vessel not found' }, 404)
        const { vesselFolderOutline } = await import('@/lib/yacht-doc-sharepoint.server')
        const outline = await vesselFolderOutline(y.vessel_name)
        const year = Number(body.year) || new Date().getFullYear()
        return json({
          ...outline,
          suggested: inbox.suggestSubfolder(outline.subfolders, s(body.permitType), s(body.dmaPhase), year),
        })
      }

      case 'match': {
        const { data: row } = await sb.from('permit_inbox').select('permit_number, issue_date').eq('id', String(body.id ?? '')).maybeSingle()
        if (!row) return json({ error: 'Not found' }, 404)
        const existing = await inbox.findExistingPermit({
          yachtId: s(body.yachtId), permitType: s(body.permitType), dmaPhase: s(body.dmaPhase),
          permitNumber: row.permit_number, issueDate: row.issue_date,
        })
        return json({ existingPermitId: existing })
      }

      case 'recipients': {
        const yachtId = s(body.yachtId)
        if (!yachtId) return json({ to: [], source: null })
        // Whoever the vessel's permits last went to, else the vessel record's email.
        const { data: prev } = await sb.from('permits').select('contact_email, email_sent_to')
          .eq('yacht_id', yachtId)
          .order('email_sent_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }).limit(20)
        for (const p of prev ?? []) {
          const to = parseEmailList(p.email_sent_to || p.contact_email)
          if (to.length) return json({ to, source: 'previous permit' })
        }
        const { data: y } = await sb.from('yachts').select('email_address').eq('id', yachtId).maybeSingle()
        const to = parseEmailList(y?.email_address)
        return json({ to, source: to.length ? 'vessel record' : null })
      }

      case 'confirm': {
        const id = s(body.id), yachtId = s(body.yachtId), permitType = s(body.permitType)
        if (!id || !yachtId || !permitType) return json({ error: 'Choose the vessel and permit type' }, 400)
        // Check the recipients before filing, so a typo doesn't leave it half done.
        const sendTo = body.sendTo == null ? null : parseEmailList(body.sendTo)
        if (sendTo && !sendTo.length) return json({ error: "Add the yacht's email address to send it" }, 400)
        const result = await inbox.confirmInboxPermit({
          id, yachtId, permitType,
          dmaPhase: s(body.dmaPhase),
          permitNumber: s(body.permitNumber),
          issueDate: date(body.issueDate),
          expiryDate: date(body.expiryDate),
          issuingAuthority: s(body.issuingAuthority),
          existingPermitId: s(body.existingPermitId),
          subfolder: s(body.subfolder),
          fileToSharePoint: body.fileToSharePoint !== false,
        }, session.user.id)
        const email = sendTo ? await sendToYacht(result.permitId, sendTo) : null
        return json({ ...result, email })
      }

      case 'send': {
        const sendTo = parseEmailList(body.sendTo)
        if (!sendTo.length) return json({ error: "Add the yacht's email address to send it" }, 400)
        const { data: row } = await sb.from('permit_inbox').select('status, permit_id').eq('id', String(body.id ?? '')).maybeSingle()
        if (!row || row.status !== 'filed' || !row.permit_id) return json({ error: 'Only a filed permit can be sent' }, 400)
        const email = await sendToYacht(row.permit_id, sendTo)
        return email.ok ? json({ email }) : json({ error: email.error, email }, email.blocked ? 409 : 502)
      }

      case 'refile':
        return json(await inbox.refileToSharePoint(String(body.id ?? '')))

      case 'reject': {
        const as = body.as === 'not_permit' ? 'not_permit' : 'rejected'
        const now = new Date().toISOString()
        const { error } = await sb.from('permit_inbox')
          .update({ status: as, reviewed_by: session.user.id, reviewed_at: now, updated_at: now })
          .eq('id', String(body.id ?? '')).neq('status', 'filed')
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      case 'reread':
        await inbox.rereadInboxItem(String(body.id ?? ''))
        return json({ ok: true })

      default:
        return json({ error: 'Unknown action' }, 400)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
}
