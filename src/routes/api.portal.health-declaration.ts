/**
 * Client-portal Maritime Declaration of Health (SD-0064).
 *
 *   GET    /api/portal/health-declaration                  → { draft, submitted[], savedStamp }
 *   POST   /api/portal/health-declaration                  → open a draft (returns the existing one if there is one)
 *   PATCH  /api/portal/health-declaration?id=              → save draft fields
 *   POST   /api/portal/health-declaration?id=&action=submit → sign and send to JLS (raises a Client Request)
 *
 * The master completes it before every Abu Dhabi arrival, at least five working
 * days ahead; a later one still goes, marked late. A new draft is filled in from
 * the vessel profile, the last declaration (ship details, master, stamp), the
 * crew list (crew on board) and the last 30 days' seaport sign-ons (persons who
 * joined). Submitting stores the signature, the stamp and a PDF in Abu Dhabi
 * Ports' layout privately under portal/<yacht_id>/health/, and raises a Client
 * Request so the team sees it in triage (with the PDF a click away).
 *
 * The table is read-only to portal logins at the database; everything here runs
 * with the service role, hard-filtered to the caller's vessel, and only when the
 * vessel has Arrivals & departures switched on and the caller's position can see it.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import {
  HEALTH_FIELDS, HEALTH_QUESTIONS, HEALTH_REQUIRED, healthDueDate, isLate, missingAnswers, needsParticulars, uaeToday,
  type HealthAnswers, type JoinedPerson, type PortOfCall,
} from '@/lib/portal/health-declaration'
import { buildHealthDeclarationPdf, fmtDay } from '@/lib/portal/health-declaration-pdf.server'
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

const BUCKET = 'permit-documents'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIST_COLUMNS = 'id, arrival_date, port_of_arrival, arriving_from, due_date, late, submitted_at, submitted_by_name, captain_request_id, captain_requests(reference, status)'

const str = (v: unknown, label: string, max = 160): string | null => {
  if (v == null || v === '') return null
  if (typeof v !== 'string' && typeof v !== 'number') throw new BadRequest(`${label} is not valid`)
  const s = String(v).trim()
  if (s.length > max) throw new BadRequest(`${label} is too long`)
  return s || null
}
const date = (v: unknown, label: string): string | null => {
  const s = str(v, label, 10)
  if (s && !DATE_RE.test(s)) throw new BadRequest(`${label} must be a date`)
  return s
}
const count = (v: unknown, label: string): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0 || n > 10000) throw new BadRequest(`${label} must be a whole number`)
  return n
}

/** Validate a body down to what the master may fill in. '' clears. */
function cleanBody(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const f of HEALTH_FIELDS) {
    if (!(f.key in body)) continue
    const raw = body[f.key]
    if (f.type === 'date') out[f.key] = date(raw, f.label)
    else if (f.type === 'number') out[f.key] = count(raw, f.label)
    else if (f.type === 'yesno') {
      if (raw != null && raw !== '' && raw !== 'yes' && raw !== 'no') throw new BadRequest(`${f.label} must be yes or no`)
      out[f.key] = raw || null
    } else out[f.key] = str(raw, f.label)
  }
  if ('ports_of_call' in body) {
    const list = Array.isArray(body.ports_of_call) ? body.ports_of_call : []
    if (list.length > 40) throw new BadRequest('Too many ports of call')
    out.ports_of_call = list.map((p: any): PortOfCall => ({ port: str(p?.port, 'Port of call', 120) ?? '', departed: date(p?.departed, 'Departure date') ?? '' }))
      .filter((p) => p.port || p.departed)
  }
  if ('joined_persons' in body) {
    const list = Array.isArray(body.joined_persons) ? body.joined_persons : []
    if (list.length > 100) throw new BadRequest('Too many people listed')
    out.joined_persons = list.map((p: any): JoinedPerson => ({
      name: str(p?.name, 'Name', 120) ?? '',
      joined_from: (Array.isArray(p?.joined_from) ? p.joined_from : []).slice(0, 3).map((x: unknown) => str(x, 'Joined from', 80) ?? ''),
    })).filter((p) => p.name)
  }
  if ('answers' in body) {
    const a = (body.answers ?? {}) as Record<string, unknown>
    const answers: HealthAnswers = {}
    for (const q of HEALTH_QUESTIONS) {
      const v = a[q.key]
      if (v != null && v !== '' && v !== 'yes' && v !== 'no') throw new BadRequest('Each health question must be answered yes or no')
      answers[q.key] = (v as string) || null
      if (q.count) answers[q.count.key] = count(a[q.count.key], q.count.label)
      if (q.where) answers[q.where] = str(a[q.where], 'Where the stowaways joined', 120)
    }
    out.answers = answers
  }
  if ('particulars' in body) out.particulars = str(body.particulars, 'Particulars', 4000)
  return out
}

/** A signature or stamp from the browser: a PNG / JPEG data URL, checked by its bytes. */
function imageFromDataUrl(v: unknown, label: string, maxBytes: number): { bytes: Uint8Array; ext: 'png' | 'jpg' } {
  const m = typeof v === 'string' ? /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(v) : null
  if (!m) throw new BadRequest(`${label} is missing or not an image`)
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))
  if (bytes.length > maxBytes) throw new BadRequest(`${label} is too large`)
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (!png && !jpg) throw new BadRequest(`${label} is not a PNG or JPEG image`)
  return { bytes, ext: png ? 'png' : 'jpg' }
}

async function put(sb: Sb, path: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true })
  if (error) throw error
  return `${BUCKET}/${path}`
}
async function get(sb: Sb, ref: string): Promise<Uint8Array | null> {
  const path = ref.startsWith(`${BUCKET}/`) ? ref.slice(BUCKET.length + 1) : ref
  const { data } = await sb.storage.from(BUCKET).download(path)
  return data ? new Uint8Array(await data.arrayBuffer()) : null
}

async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Captain'
}

/** What a new declaration starts from. */
async function startingValues(sb: Sb, yacht: PortalYacht) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  const [profile, last, crew, prearrival, seaport] = await Promise.all([
    sb.from('yachts').select('vessel_name, imo_no, official_no, flag, gross_tonnage').eq('id', yacht.yachtId).maybeSingle(),
    sb.from('health_declarations').select('*').eq('yacht_id', yacht.yachtId).eq('status', 'submitted')
      .order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('crew_members').select('id', { count: 'exact', head: true }).eq('yacht_id', yacht.yachtId).eq('status', 'active'),
    sb.from('pre_arrival_forms').select('captain_name, last_port_of_call, arrival_date').eq('yacht_id', yacht.yachtId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('seaport_requests').select('request_date, seaport_arrivals(crew_name, flight_date, status)')
      .eq('vessel_id', yacht.yachtId).gte('request_date', since),
  ])
  const p = (profile.data ?? {}) as any
  const l = (last.data ?? null) as any
  const pa = (prearrival.data ?? null) as any
  const carry: Record<string, unknown> = {}
  if (l) for (const f of HEALTH_FIELDS) if (!f.trip) carry[f.key] = l[f.key] ?? null
  // Joiners in the last 30 days, from the vessel's own sign-on requests.
  const joined = new Map<string, JoinedPerson>()
  for (const r of (seaport.data ?? []) as any[]) {
    for (const a of r.seaport_arrivals ?? []) {
      if (!a?.crew_name || a.status === 'cancelled' || a.status === 'no_show') continue
      joined.set(String(a.crew_name).trim().toLowerCase(), { name: String(a.crew_name).trim(), joined_from: ['', '', ''] })
    }
  }
  return {
    ship_name: p.vessel_name ?? null,
    imo_no: p.imo_no ?? p.official_no ?? null,
    flag: p.flag ?? null,
    gross_tonnage: p.gross_tonnage == null ? null : String(p.gross_tonnage),
    master_name: pa?.captain_name ?? (await callerName(sb, yacht)),
    ...Object.fromEntries(Object.entries(carry).filter(([, v]) => v != null && v !== '')),
    port_of_arrival: 'Abu Dhabi',
    arrival_date: pa?.arrival_date && pa.arrival_date >= uaeToday() ? pa.arrival_date : null,
    arriving_from: pa?.arrival_date && pa.arrival_date >= uaeToday() ? pa.last_port_of_call ?? null : null,
    crew_count: crew.count ?? null,
    passenger_count: 0,
    joined_persons: [...joined.values()],
    stamp_ref: l?.stamp_ref ?? null,
  }
}

async function audit(request: Request, yacht: PortalYacht, detail: string, id: string) {
  await logAuditEvent({
    event_type: 'DATA',
    module: 'portal',
    actor_id: yacht.preview ? yacht.userId : null,
    actor_email: yacht.email || '(client portal)',
    actor_role: yacht.position ?? 'captain',
    target_type: 'health_declarations',
    target_id: id,
    target_label: `${yacht.vesselName} declaration of health`,
    detail: `Client portal (${yacht.vesselName}) — ${detail}`,
    ip_address: request.headers.get('cf-connecting-ip'),
    user_agent: request.headers.get('user-agent'),
    result: 'success',
  })
}

/** What JLS sees in the Client Request raised on submission. */
function requestDetails(form: any, vesselName: string, by: string, late: boolean): string {
  const answers = (form.answers ?? {}) as HealthAnswers
  const yes = HEALTH_QUESTIONS.map((q, i) => (answers[q.key] === 'yes' ? `  ${i + 1}. ${q.text}` : null)).filter(Boolean)
  const lines = [
    `Maritime Declaration of Health for ${vesselName}, signed by ${form.master_name ?? by} (sent by ${by}).`,
    '',
    `Arriving ${fmtDay(form.arrival_date)} at ${form.port_of_arrival ?? '—'}, from ${form.arriving_from ?? '—'}`,
    `Due by ${fmtDay(form.due_date)} (5 working days before arrival)${late ? ' — SENT LATE' : ''}`,
    `On board: ${form.crew_count ?? '—'} crew, ${form.passenger_count ?? 0} passengers`,
    `Ship stamp: ${form.stamp_ref ? 'yes' : 'not provided'}`,
    '',
    yes.length ? `Answered YES to:\n${yes.join('\n')}` : 'All health questions answered NO.',
    '',
    'The signed PDF is on this request in Polaris → Client Requests (Declaration of Health PDF).',
  ]
  return lines.join('\n')
}

export async function portalHealthDeclarationHandler(request: Request): Promise<Response> {
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
      const [draft, submitted] = await Promise.all([
        sb.from('health_declarations').select('*').eq('yacht_id', yacht.yachtId).eq('status', 'draft')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        sb.from('health_declarations').select(LIST_COLUMNS)
          .eq('yacht_id', yacht.yachtId).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(20),
      ])
      for (const r of [draft, submitted]) if (r.error) throw r.error
      // The stored references never leave the server — only whether there is one.
      const { signature_ref: _s, pdf_ref: _p, stamp_ref, ...rest } = (draft.data ?? {}) as any
      return json({
        draft: draft.data ? { ...rest, hasSavedStamp: !!stamp_ref } : null,
        submitted: submitted.data ?? [],
        readOnly: !!yacht.preview,
      })
    }

    if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

    const body = (((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>)
    if (typeof body !== 'object') return json({ error: 'Expected a JSON body' }, 400)

    // Open a draft — reuse the vessel's existing one so there's only ever one in progress.
    if (request.method === 'POST' && !id) {
      const { data: existing } = await sb.from('health_declarations').select('id').eq('yacht_id', yacht.yachtId).eq('status', 'draft')
        .limit(1).maybeSingle()
      if (existing) return json({ ok: true, id: (existing as any).id })
      const start = await startingValues(sb, yacht)
      const { data, error } = await sb.from('health_declarations').insert({ ...start, yacht_id: yacht.yachtId, status: 'draft' }).select('id').single()
      if (error) throw error
      return json({ ok: true, id: (data as any).id }, 201)
    }

    if (!id || !UUID_RE.test(id)) return json({ error: 'Declaration not found' }, 404)
    const { data: form } = await sb.from('health_declarations').select('*').eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
    if (!form) return json({ error: 'Declaration not found' }, 404)
    if ((form as any).status === 'submitted') return json({ error: 'This declaration has already been sent to JLS.' }, 400)

    if (request.method === 'PATCH') {
      const fields = cleanBody(body)
      if (body.removeSavedStamp === true) fields.stamp_ref = null
      if (Object.keys(fields).length) {
        const { error } = await sb.from('health_declarations').update(fields).eq('id', id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
      }
      return json({ ok: true })
    }

    if (request.method === 'POST' && action === 'submit') {
      const fields = cleanBody(body)
      if (body.removeSavedStamp === true) fields.stamp_ref = null
      const merged = { ...(form as any), ...fields }
      const missing = HEALTH_REQUIRED.filter((k) => merged[k] == null || merged[k] === '')
        .map((k) => HEALTH_FIELDS.find((f) => f.key === k)?.label ?? k)
      missing.push(...missingAnswers(merged.answers ?? {}))
      if (needsParticulars(merged.answers ?? {}) && !merged.particulars) missing.push('particulars for each "yes"')
      if (missing.length) return json({ error: `Please complete: ${missing.join(', ')}` }, 400)
      if (body.confirm !== true) return json({ error: 'Please tick the declaration before signing.' }, 400)

      const signature = imageFromDataUrl(body.signature, 'Your signature', 1_500_000)
      if (signature.ext !== 'png') throw new BadRequest('Your signature must be a PNG image')
      const newStamp = body.stamp ? imageFromDataUrl(body.stamp, 'The ship stamp', 4_000_000) : null

      const name = await callerName(sb, yacht)
      const today = uaeToday()
      const due = healthDueDate(merged.arrival_date)
      const late = isLate(merged.arrival_date, today)
      const dir = `portal/${yacht.yachtId}/health/${id}`
      const signatureRef = await put(sb, `${dir}/signature.png`, signature.bytes, 'image/png')
      let stampRef: string | null = merged.stamp_ref ?? null
      let stampBytes: Uint8Array | null = null
      if (newStamp) {
        stampRef = await put(sb, `${dir}/stamp.${newStamp.ext}`, newStamp.bytes, newStamp.ext === 'png' ? 'image/png' : 'image/jpeg')
        stampBytes = newStamp.bytes
      } else if (stampRef) {
        stampBytes = await get(sb, stampRef)
        if (!stampBytes) stampRef = null
      }

      // Raise the request first so its reference can go on the PDF.
      const { data: cr, error: crErr } = await sb.from('captain_requests').insert({
        yacht_id: yacht.yachtId,
        created_by: yacht.userId,
        category: 'permits',
        title: `Declaration of Health — arriving ${fmtDay(merged.arrival_date)} at ${merged.port_of_arrival}${late ? ' (late)' : ''}`.slice(0, 200),
        details: requestDetails({ ...merged, due_date: due, stamp_ref: stampRef }, yacht.vesselName, name, late),
        priority: late ? 'high' : 'normal',
        status: 'new',
        needed_by: due ?? merged.arrival_date,
      }).select('id, reference').single()
      if (crErr || !cr) throw crErr ?? new Error('Could not send to JLS')

      try {
        const pdf = await buildHealthDeclarationPdf({
          ...merged,
          ports_of_call: merged.ports_of_call ?? [], joined_persons: merged.joined_persons ?? [], answers: merged.answers ?? {},
          signedOn: today, reference: cr.reference, signaturePng: signature.bytes, stamp: stampBytes,
        })
        const pdfRef = await put(sb, `${dir}/declaration-of-health.pdf`, pdf, 'application/pdf')
        const { error } = await sb.from('health_declarations').update({
          ...fields, signature_ref: signatureRef, stamp_ref: stampRef, pdf_ref: pdfRef, due_date: due, late,
          status: 'submitted', submitted_at: new Date().toISOString(), submitted_by: yacht.userId, submitted_by_name: name,
          captain_request_id: cr.id,
        }).eq('id', id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
      } catch (e) {
        // Don't leave JLS a request with no declaration behind it; the draft stays as it was.
        await sb.from('captain_requests').delete().eq('id', cr.id)
        throw e
      }
      await audit(request, yacht, `signed and sent the Maritime Declaration of Health (${cr.reference}${late ? ', late' : ''})`, id)
      return json({ ok: true, requestId: cr.id, requestReference: cr.reference, late })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-health-declaration]', e)
    return json({ error: e?.message ?? 'Could not save the declaration' }, 500)
  }
}
