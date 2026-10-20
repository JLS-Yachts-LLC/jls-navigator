/**
 * POST /api/permits/inbox — the Permit Inbox's actions (staff only).
 *
 *   { action: 'poll' }                                  check the watched mailboxes now
 *   { action: 'upload', fileName, contentBase64 }      read a PDF someone has to hand
 *   { action: 'folders', yachtId, permitType, dmaPhase, year }
 *                                                       the vessel's SharePoint subfolders + the suggested one
 *   { action: 'match', id, yachtId, permitType, dmaPhase }
 *                                                       the permit an item would update for this vessel
 *   { action: 'confirm', ...ConfirmInput }              create/update the permit, file the PDF in SharePoint
 *   { action: 'refile', id }                            retry the SharePoint copy
 *   { action: 'reject', id, as: 'rejected' | 'not_permit' }
 *   { action: 'reread', id }                            read the PDF again (also "this IS a permit")
 *
 * All writes to permit_inbox go through here (service role); staff only read it.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

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

      case 'confirm': {
        const id = s(body.id), yachtId = s(body.yachtId), permitType = s(body.permitType)
        if (!id || !yachtId || !permitType) return json({ error: 'Choose the vessel and permit type' }, 400)
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
        return json(result)
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
