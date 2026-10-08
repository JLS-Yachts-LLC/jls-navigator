/**
 * Client Portal — the vessel's automated email reports.
 *
 *   GET  /api/portal/reports → { canManage, reports: [...] }
 *   POST /api/portal/reports { id, enabled?, recipients? }
 *
 * Only the reports JLS has offered the vessel (vessel_report_subscriptions with
 * client_can_manage) are shown, and only positions that manage the vessel may
 * change them: switch one on or off, and say who it goes to. The day and time
 * stay JLS's to set. Every change is stamped as the client's and logged in
 * vessel_report_events, so staff can see who switched what.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht } from '@/lib/portal/portal-auth.server'
import { canManageVessel } from '@/lib/portal/portal-positions'
import { VESSEL_REPORTS, describeReportSchedule, isEmail, type ReportSchedule } from '@/lib/vessel-reports/catalogue'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

const COLS = 'id, report_key, enabled, recipients, cc, schedule, last_sent_at, changed_by_kind, changed_by_name, changed_at'

function shape(s: any) {
  const def = VESSEL_REPORTS.find((r) => r.key === s.report_key)
  return {
    id: s.id,
    key: s.report_key,
    label: def?.label ?? s.report_key,
    description: def?.description ?? '',
    enabled: !!s.enabled,
    recipients: s.recipients ?? [],
    cc: s.cc ?? [],
    when: describeReportSchedule((s.schedule ?? def?.defaultSchedule) as ReportSchedule),
    lastSentAt: s.last_sent_at ?? null,
    changedBy: s.changed_by_kind ? { kind: s.changed_by_kind, name: s.changed_by_name, at: s.changed_at } : null,
  }
}

export async function portalReportsHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  const sb = admin() as any
  const canManage = canManageVessel(yacht.position) && !yacht.preview

  if (request.method === 'GET') {
    const { data, error } = await sb.from('vessel_report_subscriptions').select(COLS)
      .eq('yacht_id', yacht.yachtId).eq('client_can_manage', true).order('report_key')
    if (error) return json({ error: error.message }, 500)
    return json({ canManage, reports: (data ?? []).map(shape) })
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!canManage) return json({ error: yacht.preview ? 'Preview is read-only.' : "Your position can't change the vessel's reports." }, 403)
  const body: any = await request.json().catch(() => null)
  const id = String(body?.id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Bad request' }, 400)

  // Only this vessel's reports that JLS has offered to the client.
  const { data: sub } = await sb.from('vessel_report_subscriptions').select(COLS)
    .eq('id', id).eq('yacht_id', yacht.yachtId).eq('client_can_manage', true).maybeSingle()
  if (!sub) return json({ error: 'Not found' }, 404)

  const patch: Record<string, unknown> = {}
  const actions: string[] = []
  if (Array.isArray(body.recipients)) {
    const list = [...new Set(body.recipients.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean))] as string[]
    const bad = list.filter((e) => !isEmail(e))
    if (bad.length) return json({ error: `Not an email address: ${bad.join(', ')}` }, 400)
    if (list.length > 20) return json({ error: 'Up to 20 recipients.' }, 400)
    if (list.join(',') !== (sub.recipients ?? []).join(',')) { patch.recipients = list; actions.push('recipients_changed') }
  }
  if (typeof body.enabled === 'boolean' && body.enabled !== sub.enabled) {
    patch.enabled = body.enabled
    actions.push(body.enabled ? 'switched_on' : 'switched_off')
  }
  const recipients = (patch.recipients as string[] | undefined) ?? sub.recipients ?? []
  const enabled = (patch.enabled as boolean | undefined) ?? sub.enabled
  if (enabled && !recipients.length) {
    // Nobody left to send it to: it can't stay on.
    if (patch.enabled === true) return json({ error: 'Add at least one email address first.' }, 400)
    patch.enabled = false
    actions.push('switched_off')
  }
  if (!actions.length) return json({ ok: true, report: shape(sub) })

  const who = yacht.email || 'Client'
  const { data: updated, error } = await sb.from('vessel_report_subscriptions')
    .update({ ...patch, changed_by_kind: 'client', changed_by_name: who, changed_at: new Date().toISOString() })
    .eq('id', id).select(COLS).single()
  if (error) return json({ error: error.message }, 500)
  await sb.from('vessel_report_events').insert(actions.map((action) => ({
    subscription_id: id, yacht_id: yacht.yachtId, report_key: sub.report_key,
    actor_kind: 'client', actor_id: yacht.userId, actor_name: who, action,
    detail: { recipients: updated.recipients, enabled: updated.enabled },
  })))
  return json({ ok: true, report: shape(updated) })
}
