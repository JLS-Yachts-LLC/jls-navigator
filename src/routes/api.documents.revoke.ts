/**
 * POST /api/documents/revoke  { id, revoke }
 *
 * Kill a secure document link, or put one back.
 *
 * Staff can read document_shares under RLS but not write to it, so this runs
 * with the service role behind the same staff guard the permit sender uses.
 * Revoking is a real decision — someone was sent a document and is now being cut
 * off from it — so it is written to the audit trail.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function documentRevokeHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request, ['global_admin', 'org_admin', 'jls_staff'])
  if (!session.ok) return session.response
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let id = '', revoke = true
  try {
    const body = await request.json() as any
    id = String(body.id ?? '')
    revoke = body.revoke !== false
  } catch { return json({ error: 'Invalid request body' }, 400) }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid link id' }, 400)

  const sb = supabaseAdmin as any
  const { data: share } = await sb
    .from('document_shares').select('id, title, reference, recipient_email').eq('id', id).maybeSingle()
  if (!share) return json({ error: 'That link no longer exists' }, 404)

  const { error } = await sb.from('document_shares')
    .update({ revoked_at: revoke ? new Date().toISOString() : null }).eq('id', id)
  if (error) return json({ error: error.message }, 500)

  await logAuditEvent({
    event_type:  'ADMIN',
    module:      'documents',
    actor_id:    session.user.id,
    actor_email: session.user.email,
    actor_role:  session.user.role,
    target_type: 'document_share',
    target_id:   id,
    target_label: share.recipient_email ?? share.title,
    detail: `${revoke ? 'Revoked' : 'Restored'} the secure link for "${share.title}"` +
            `${share.reference ? ` (${share.reference})` : ''}` +
            `${share.recipient_email ? ` sent to ${share.recipient_email}` : ''}`,
    ip_address:  request.headers.get('x-forwarded-for'),
    result:      'success',
  })

  return json({ success: true, revoked: revoke })
}
