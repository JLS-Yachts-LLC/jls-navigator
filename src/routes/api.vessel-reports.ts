/**
 * Automated vessel reports — Reports → Automated Reports.
 *
 *   GET  /api/vessel-reports?preview=<report_key>&yachtId=<id>[&format=pdf]
 *        → the report as it would go out now (email HTML, or its PDF)
 *   POST /api/vessel-reports { action: "send" | "test", subscriptionId }
 *        → send now to the subscription's recipients, or a test copy to me
 *
 * Staff only — never a portal login. The opt-in settings themselves are edited
 * on the screen through RLS (vessel_report_subscriptions); this endpoint only
 * builds and sends.
 */
import { createClient } from '@supabase/supabase-js'
import { requireAccess } from '@/lib/auth/requireAccess.server'
import { VESSEL_REPORTS, type ReportKey } from '@/lib/vessel-reports/catalogue'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function vesselReportsHandler(request: Request): Promise<Response> {
  // Crew & Immigration: view to preview and send a test to yourself; edit to
  // send to a vessel (checked below). Portal logins never hold the module.
  const access = await requireAccess(request, { module: 'crew_immigration', level: 'view' })
  if (!access.ok) return access.response
  const db = admin() as any
  const uid = access.claims.userId
  const [{ data: profile }, { data: captain }] = await Promise.all([
    db.from('user_profiles').select('user_id, email').eq('user_id', uid).maybeSingle(),
    db.from('captain_accounts').select('user_id').eq('user_id', uid).eq('active', true).limit(1).maybeSingle(),
  ])
  if (!profile || captain) return json({ ok: false, error: 'Forbidden' }, 403)

  const url = new URL(request.url)
  try {
    if (request.method === 'GET') {
      // WhatsApp: the report template's state, and a vessel's contacts to pick from.
      if (url.searchParams.get('waTemplate')) {
        const { reportTemplateState } = await import('@/lib/vessel-reports/whatsapp.server')
        return json({ ok: true, ...(await reportTemplateState()) })
      }
      const waFor = url.searchParams.get('waContacts')
      if (waFor) {
        if (!/^[0-9a-f-]{36}$/i.test(waFor)) return json({ ok: false, error: 'Bad vessel' }, 400)
        const { vesselWhatsAppContacts } = await import('@/lib/vessel-reports/whatsapp.server')
        return json({ ok: true, contacts: await vesselWhatsAppContacts(waFor) })
      }
      const key = url.searchParams.get('preview') as ReportKey | null
      const yachtId = url.searchParams.get('yachtId') ?? ''
      if (!key || !VESSEL_REPORTS.some((r) => r.key === key) || !/^[0-9a-f-]{36}$/i.test(yachtId)) {
        return json({ ok: false, error: 'preview and yachtId required' }, 400)
      }
      const { previewVesselReport } = await import('@/lib/vessel-reports/run.server')
      const built = await previewVesselReport(key, yachtId)
      if (url.searchParams.get('format') === 'pdf') {
        const a = built.attachments[0]
        const bytes = Uint8Array.from(atob(a.contentBase64), (c) => c.charCodeAt(0))
        return new Response(bytes as unknown as BodyInit, {
          headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${a.filename}"`, 'Cache-Control': 'no-store' },
        })
      }
      return json({ ok: true, subject: built.subject, html: built.html, summary: built.summary, attachment: built.attachments[0]?.filename ?? null })
    }

    if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
    const body: any = await request.json().catch(() => null)
    // Create the WhatsApp report template and submit it to Meta.
    if (body?.action === 'wa-template') {
      const canEdit = await requireAccess(request, { module: 'crew_immigration', level: 'edit' })
      if (!canEdit.ok) return json({ ok: false, error: 'Setting up the template needs edit access to Crew & Immigration.' }, 403)
      const { setupReportTemplate } = await import('@/lib/vessel-reports/whatsapp.server')
      const res = await setupReportTemplate(uid)
      return json(res, res.ok ? 200 : 422)
    }
    const id = String(body?.subscriptionId ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(id) || !['send', 'test'].includes(body?.action)) return json({ ok: false, error: 'Bad request' }, 400)
    if (body.action === 'send') {
      const canEdit = await requireAccess(request, { module: 'crew_immigration', level: 'edit' })
      if (!canEdit.ok) return json({ ok: false, error: 'Sending to a vessel needs edit access to Crew & Immigration.' }, 403)
    }
    const { sendVesselReportNow } = await import('@/lib/vessel-reports/run.server')
    const res = await sendVesselReportNow(id, uid, { test: body.action === 'test', testTo: profile.email ?? undefined })
    return json(res, res.ok ? 200 : 422)
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500)
  }
}
