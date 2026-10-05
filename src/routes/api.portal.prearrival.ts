/**
 * Client-portal Pre-Arrival / Cruising Permit form.
 *
 *   GET    /api/portal/prearrival                       → { prefill, draft, tenders, submitted[] }
 *   POST   /api/portal/prearrival                       → open a draft (returns the existing one if there is one)
 *   PATCH  /api/portal/prearrival?id=                   → save draft fields
 *   POST   /api/portal/prearrival?id=&action=submit     → submit to JLS (raises a Client Request)
 *   POST   /api/portal/prearrival?action=tender         → add a tender / toy to the vessel profile
 *   DELETE /api/portal/prearrival?tender=               → remove one
 *
 * Vessel particulars come live from the vessel profile and can't be changed
 * here — the client asks JLS to correct them. Trip details and the particulars
 * with no profile home yet are saved on the form. The tables are read-only to
 * portal logins at the database; everything here runs with the service role,
 * hard-filtered to the caller's vessel, and only when the vessel has Arrivals &
 * departures switched on and the caller's position can see it.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { PREARRIVAL_FIELDS, PREARRIVAL_REQUIRED } from '@/lib/portal/prearrival'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}
type Sb = ReturnType<typeof admin>

class BadRequest extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validate a body down to the form's editable fields. '' clears. */
function cleanFields(body: Record<string, unknown>) {
  const out: Record<string, string | number | null> = {}
  for (const f of PREARRIVAL_FIELDS) {
    if (!(f.key in body)) continue
    const raw = body[f.key]
    if (raw == null || raw === '') { out[f.key] = null; continue }
    const v = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : null
    if (v == null) throw new BadRequest(`${f.label} is not valid`)
    if (!v) { out[f.key] = null; continue }
    if (f.type === 'number') {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0 || n > 1e7) throw new BadRequest(`${f.label} must be a positive number`)
      out[f.key] = n
    } else if (f.type === 'date') {
      if (!DATE_RE.test(v)) throw new BadRequest(`${f.label} must be a date`)
      out[f.key] = v
    } else if (f.type === 'email') {
      if (!EMAIL_RE.test(v) || v.length > 160) throw new BadRequest(`${f.label} doesn't look like an email address`)
      out[f.key] = v
    } else {
      if (v.length > 200) throw new BadRequest(`${f.label} is too long`)
      out[f.key] = v
    }
  }
  return out
}

async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Captain'
}

async function audit(request: Request, yacht: PortalYacht, detail: string, id: string) {
  await logAuditEvent({
    event_type: 'DATA',
    module: 'portal',
    actor_id: yacht.preview ? yacht.userId : null,
    actor_email: yacht.email || '(client portal)',
    actor_role: yacht.position ?? 'captain',
    target_type: 'pre_arrival_forms',
    target_id: id,
    target_label: `${yacht.vesselName} pre-arrival`,
    detail: `Client portal (${yacht.vesselName}) — ${detail}`,
    ip_address: request.headers.get('cf-connecting-ip'),
    user_agent: request.headers.get('user-agent'),
    result: 'success',
  })
}

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'

/** What JLS sees in the Client Request raised on submission. */
function requestDetails(form: any, vesselName: string, by: string): string {
  const lines = [
    `Pre-arrival / cruising permit form for ${vesselName}, submitted by ${by}.`,
    '',
    `Arrival: ${fmtDate(form.arrival_date)} at ${form.arrival_port ?? '—'}, ${form.arrival_emirate ?? '—'}`,
    `Last port of call: ${form.last_port_of_call ?? '—'}`,
  ]
  const heads = [
    form.captain_name && `Captain: ${form.captain_name}${form.captain_email ? ` <${form.captain_email}>` : ''}`,
    form.purser_name && `Purser / Stew: ${form.purser_name}${form.purser_email ? ` <${form.purser_email}>` : ''}`,
    form.chief_engineer_name && `Chief Engineer: ${form.chief_engineer_name}${form.chief_engineer_email ? ` <${form.chief_engineer_email}>` : ''}`,
  ].filter(Boolean)
  if (heads.length) lines.push('', ...(heads as string[]))
  lines.push('', 'The full form is on the vessel page in Polaris → Pre-Arrival Form.')
  return lines.join('\n')
}

export async function portalPrearrivalHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)

  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled('movements', modules)) return json({ error: "Arrivals & departures isn't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has('movements')) return json({ error: "Your position doesn't include arrivals & departures." }, 403)

  const sb = admin()
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const action = url.searchParams.get('action')

  try {
    if (request.method === 'GET') {
      const [prefill, draft, tenders, submitted] = await Promise.all([
        sb.from('v_prearrival_prefill').select('*').eq('yacht_id', yacht.yachtId).maybeSingle(),
        sb.from('pre_arrival_forms').select('*').eq('yacht_id', yacht.yachtId).eq('status', 'draft')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        sb.from('yacht_tenders').select('*').eq('yacht_id', yacht.yachtId).order('created_at'),
        sb.from('pre_arrival_forms')
          .select('id, arrival_date, arrival_port, arrival_emirate, last_port_of_call, submitted_at, submitted_by_name, captain_request_id, captain_requests(reference, status)')
          .eq('yacht_id', yacht.yachtId).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(20),
      ])
      for (const r of [prefill, draft, tenders, submitted]) if (r.error) throw r.error
      return json({
        prefill: prefill.data ?? null,
        draft: draft.data ?? null,
        tenders: tenders.data ?? [],
        submitted: submitted.data ?? [],
        readOnly: !!yacht.preview,
      })
    }

    if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

    if (request.method === 'DELETE') {
      const tenderId = url.searchParams.get('tender')
      if (!tenderId || !UUID_RE.test(tenderId)) return json({ error: 'Tender not found' }, 404)
      const { error } = await sb.from('yacht_tenders').delete().eq('id', tenderId).eq('yacht_id', yacht.yachtId)
      if (error) throw error
      return json({ ok: true })
    }

    const body = (((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>)
    if (typeof body !== 'object') return json({ error: 'Expected a JSON body' }, 400)

    if (request.method === 'POST' && action === 'tender') {
      const str = (k: string, max = 120) => {
        const v = typeof body[k] === 'string' ? (body[k] as string).trim() : ''
        if (v.length > max) throw new BadRequest(`${k} is too long`)
        return v || null
      }
      const num = (k: string) => {
        if (body[k] == null || body[k] === '') return null
        const n = Number(body[k])
        if (!Number.isFinite(n) || n < 0 || n > 1e5) throw new BadRequest(`${k} must be a positive number`)
        return n
      }
      const row = {
        yacht_id: yacht.yachtId,
        description: str('description'), manufacturer_model: str('manufacturer_model'), length_m: num('length_m'),
        id_serial_no: str('id_serial_no'), color: str('color'), fuel_type: str('fuel_type'), year_of_build: num('year_of_build'),
      }
      if (!row.description && !row.manufacturer_model) return json({ error: 'Describe the tender or toy' }, 400)
      const { data, error } = await sb.from('yacht_tenders').insert(row).select().single()
      if (error) throw error
      return json({ ok: true, tender: data }, 201)
    }

    // Open a draft — reuse the vessel's existing one so there's only ever one in progress.
    if (request.method === 'POST' && !id) {
      const { data: existing } = await sb.from('pre_arrival_forms').select('*').eq('yacht_id', yacht.yachtId).eq('status', 'draft')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (existing) return json({ ok: true, draft: existing })
      // Start from the last submission's particulars, so the client only fills in the trip.
      const { data: last } = await sb.from('pre_arrival_forms').select('*').eq('yacht_id', yacht.yachtId).eq('status', 'submitted')
        .order('submitted_at', { ascending: false }).limit(1).maybeSingle()
      const carry: Record<string, unknown> = {}
      if (last) for (const f of PREARRIVAL_FIELDS) if (!f.trip) carry[f.key] = (last as any)[f.key] ?? null
      const { data, error } = await sb.from('pre_arrival_forms').insert({ ...carry, yacht_id: yacht.yachtId, status: 'draft' }).select().single()
      if (error) throw error
      return json({ ok: true, draft: data }, 201)
    }

    if (!id || !UUID_RE.test(id)) return json({ error: 'Form not found' }, 404)
    const { data: form } = await sb.from('pre_arrival_forms').select('*').eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
    if (!form) return json({ error: 'Form not found' }, 404)
    if ((form as any).status === 'submitted') return json({ error: 'This form has already been sent to JLS.' }, 400)

    if (request.method === 'PATCH') {
      const fields = cleanFields(body)
      if (Object.keys(fields).length) {
        const { error } = await sb.from('pre_arrival_forms').update(fields).eq('id', id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
      }
      return json({ ok: true })
    }

    if (request.method === 'POST' && action === 'submit') {
      const fields = cleanFields(body)
      const merged = { ...(form as any), ...fields }
      const missing = PREARRIVAL_REQUIRED.filter((k) => !merged[k])
      if (missing.length) {
        const labels = missing.map((k) => PREARRIVAL_FIELDS.find((f) => f.key === k)?.label ?? k)
        return json({ error: `Please complete: ${labels.join(', ')}` }, 400)
      }
      const name = await callerName(sb, yacht)
      const { data: cr, error: crErr } = await sb.from('captain_requests').insert({
        yacht_id: yacht.yachtId,
        created_by: yacht.userId,
        category: 'permits',
        title: `Pre-arrival — arriving ${fmtDate(merged.arrival_date)} at ${merged.arrival_port}`.slice(0, 200),
        details: requestDetails(merged, yacht.vesselName, name),
        priority: 'normal',
        status: 'new',
        needed_by: merged.arrival_date,
      }).select('id, reference').single()
      if (crErr || !cr) throw crErr ?? new Error('Could not send to JLS')
      const { error } = await sb.from('pre_arrival_forms').update({
        ...fields, status: 'submitted', submitted_at: new Date().toISOString(),
        submitted_by: yacht.userId, submitted_by_name: name, captain_request_id: cr.id,
      }).eq('id', id).eq('yacht_id', yacht.yachtId)
      if (error) throw error
      await audit(request, yacht, `submitted pre-arrival form (${cr.reference})`, id)
      return json({ ok: true, requestId: cr.id, requestReference: cr.reference })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-prearrival]', e)
    return json({ error: e?.message ?? 'Could not save the form' }, 500)
  }
}
