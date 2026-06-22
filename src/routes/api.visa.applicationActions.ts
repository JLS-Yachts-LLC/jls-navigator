/**
 * Visa application back-office actions — Tickets #177, #178, #179
 *
 *   PATCH /api/visa/applications/:id/status      — status transition
 *   POST  /api/visa/applications/:id/amendment   — request amendment
 *   POST  /api/visa/applications/:id/renewal     — record renewal (suppresses flags)
 *
 * Reconciliation notes (spec written for Next.js + assumed schema):
 *   - Adapted to the TanStack/Cloudflare handler pattern (Request -> Response),
 *     registered in worker-entry.ts.
 *   - requireAccess(request, { module: 'crew_immigration', level: 'edit' }) gates
 *     every action; logAuditEvent records each one.
 *   - Live schema: visa_applications.crew_member_id (crew FK), country_code 'AE'.
 *   - Crew-member notifications are best-effort: crew_members are not guaranteed
 *     to map to an auth.users row, so a failed insert is swallowed and never
 *     blocks the state change.
 */

import { createClient } from '@supabase/supabase-js'
import { requireAccess } from '@/lib/auth/requireAccess.server'
import { logAuditEvent } from '@/lib/admin/audit'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  })
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  submitted:          ['in_review'],
  in_review:          ['approved', 'rejected', 'amendment_required'],
  amendment_required: ['in_review'],
}

/** Best-effort crew notification — never throws. */
async function notifyCrewBestEffort(
  sb: ReturnType<typeof admin>,
  crewMemberId: string,
  payload: { type: string; urgency: 'info' | 'warning' | 'danger'; title: string; body: string; applicationId: string },
): Promise<void> {
  try {
    await sb.from('notifications').insert({
      user_id: crewMemberId,
      type: payload.type,
      urgency: payload.urgency,
      title: payload.title,
      body: payload.body,
      action_url: `/crew-immigration/visas/${payload.applicationId}`,
      metadata: { visa_application_id: payload.applicationId },
    })
  } catch {
    /* crew member may not have an auth account — non-fatal */
  }
}

export async function visaApplicationActionsHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const m = url.pathname.match(/^\/api\/visa\/applications\/([^/]+)\/(status|amendment|renewal)$/)
  if (!m) return json({ error: 'Not found' }, 404)
  const applicationId = m[1]
  const action = m[2]

  const access = await requireAccess(request, { module: 'crew_immigration', level: 'edit' })
  if (!access.ok) return access.response
  const { userId, email, roleName } = access.claims

  const sb = admin()

  const { data: app, error: appErr } = await (sb as any)
    .from('visa_applications')
    .select('id, status, crew_member_id, country_code')
    .eq('id', applicationId)
    .maybeSingle()
  if (appErr || !app) return json({ error: 'Application not found' }, 404)
  if (app.country_code !== 'AE') {
    return json({ error: 'Only UAE visa applications are active in this release' }, 400)
  }

  let body: Record<string, unknown> = {}
  if (request.method === 'POST' || request.method === 'PATCH') {
    try { body = await request.json() } catch { body = {} }
  }

  // ── status ────────────────────────────────────────────────────────────────
  if (action === 'status' && request.method === 'PATCH') {
    const newStatus = String(body.status ?? '')
    const note = (body.note as string | undefined)?.trim() || null
    const allowed = VALID_TRANSITIONS[app.status] ?? []
    if (!allowed.includes(newStatus)) {
      return json({ error: `Invalid transition: ${app.status} → ${newStatus}` }, 400)
    }

    const { error: upErr } = await (sb as any)
      .from('visa_applications')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', applicationId)
    if (upErr) return json({ error: 'Update failed' }, 500)

    await (sb as any).from('visa_admin_actions').insert({
      visa_application_id: applicationId,
      performed_by: userId,
      action_type: 'status_change',
      previous_status: app.status,
      new_status: newStatus,
      note,
    })

    await logAuditEvent({
      event_type: 'DATA', actor_id: userId, actor_email: email, actor_role: roleName ?? 'unknown',
      target_type: 'visa_application', target_id: applicationId,
      detail: `Visa status ${app.status} → ${newStatus}${note ? ` (${note})` : ''}`,
      result: 'success',
    })

    await notifyCrewBestEffort(sb, app.crew_member_id, {
      type: 'visa_status_update',
      urgency: newStatus === 'approved' ? 'info' : newStatus === 'rejected' ? 'danger' : 'warning',
      title: `UAE visa application ${newStatus.replace('_', ' ')}`,
      body: note ?? `Your UAE visa application status is now ${newStatus.replace('_', ' ')}.`,
      applicationId,
    })

    return json({ ok: true, status: newStatus })
  }

  // ── amendment ───────────────────────────────────────────────────────────────
  if (action === 'amendment' && request.method === 'POST') {
    const reason = (body.reason as string | undefined)?.trim()
    if (!reason) return json({ error: 'Amendment reason is required' }, 400)
    if (app.status !== 'in_review') {
      return json({ error: 'Application must be in_review to request amendment' }, 400)
    }

    const { error: upErr } = await (sb as any)
      .from('visa_applications')
      .update({ status: 'amendment_required', updated_at: new Date().toISOString() })
      .eq('id', applicationId)
    if (upErr) return json({ error: 'Update failed' }, 500)

    await (sb as any).from('visa_admin_actions').insert({
      visa_application_id: applicationId,
      performed_by: userId,
      action_type: 'amendment_requested',
      previous_status: 'in_review',
      new_status: 'amendment_required',
      note: reason,
    })

    await logAuditEvent({
      event_type: 'DATA', actor_id: userId, actor_email: email, actor_role: roleName ?? 'unknown',
      target_type: 'visa_application', target_id: applicationId,
      detail: `Amendment requested: ${reason}`, result: 'success',
    })

    await notifyCrewBestEffort(sb, app.crew_member_id, {
      type: 'visa_amendment_required', urgency: 'warning',
      title: 'Action required — UAE visa application',
      body: `Your UAE visa application requires an amendment: ${reason}`,
      applicationId,
    })

    return json({ ok: true })
  }

  // ── renewal ──────────────────────────────────────────────────────────────────
  if (action === 'renewal' && request.method === 'POST') {
    const newExpiry = body.new_visa_expiry_date as string | undefined
    const newIssue = body.new_visa_issue_date as string | undefined
    const newAppId = (body.new_application_id as string | undefined) ?? null
    if (!newExpiry || !newIssue) {
      return json({ error: 'New issue and expiry dates required' }, 400)
    }

    const { error: upErr } = await (sb as any)
      .from('visa_applications')
      .update({ visa_renewed: true, renewed_visa_ref: newAppId, updated_at: new Date().toISOString() })
      .eq('id', applicationId)
    if (upErr) return json({ error: 'Update failed' }, 500)

    // Suppress (never delete) all unsuppressed flags for this application.
    await (sb as any)
      .from('visa_expiry_flags')
      .update({ suppressed: true, suppression_reason: 'Visa renewed' })
      .eq('visa_application_id', applicationId)
      .eq('suppressed', false)

    await (sb as any).from('visa_admin_actions').insert({
      visa_application_id: applicationId,
      performed_by: userId,
      action_type: 'renewal_recorded',
      note: `Renewed. New expiry: ${newExpiry}`,
      metadata: { new_visa_expiry_date: newExpiry, new_visa_issue_date: newIssue, new_application_id: newAppId },
    })

    await logAuditEvent({
      event_type: 'DATA', actor_id: userId, actor_email: email, actor_role: roleName ?? 'unknown',
      target_type: 'visa_application', target_id: applicationId,
      detail: `Renewal recorded — new expiry ${newExpiry}; expiry flags suppressed`, result: 'success',
    })

    return json({ ok: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}
