/**
 * Client-portal Maritime Declaration of Health (SD-0064), for every Abu Dhabi arrival.
 *
 *   GET    /api/portal/health-declaration                    → { prefill, draft, holidays, submitted[] }
 *   POST   /api/portal/health-declaration                    → open a draft (returns the existing one if there is one)
 *   PATCH  /api/portal/health-declaration?id=                → save draft fields
 *   POST   /api/portal/health-declaration?id=&action=submit  → sign and send to JLS: builds the PDF, files it on
 *                                                              the vessel's Documents and raises a Client Request
 *
 * The master completes it at least five working days before arriving; it comes
 * back to the JLS Abu Dhabi agency team, not straight to the authority. A late
 * one is still accepted and marked late for staff. Ship particulars start from
 * the last declaration or the vessel profile, crew on board and recent joiners
 * from the crew list and sign-ons, and all of it stays editable on the form.
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
  ANSWER_KEYS, HEALTH_FIELDS, HEALTH_QUESTIONS, MAX_JOINERS, MAX_PORTS,
  healthDueDate, missingForSubmit, uaeToday, type JoinedPerson, type PortOfCall,
} from '@/lib/portal/health-declaration'
import { buildHealthDeclarationPdf } from '@/lib/portal/health-declaration-pdf.server'
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
const MAX_IMAGE = 3 * 1024 * 1024

const str = (v: unknown, max: number, what: string): string | null => {
  if (v == null) return null
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : null
  if (s == null) throw new BadRequest(`${what} is not valid`)
  if (s.length > max) throw new BadRequest(`${what} is too long`)
  return s || null
}

/** Validate a body down to the form's editable columns. '' clears. */
function cleanFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const f of HEALTH_FIELDS) {
    if (!(f.key in body)) continue
    const v = str(body[f.key], 200, f.label)
    if (v == null) { out[f.key] = null; continue }
    if (f.type === 'number') {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0 || n > 100000) throw new BadRequest(`${f.label} must be a whole number`)
      out[f.key] = n
    } else if (f.type === 'date') {
      if (!DATE_RE.test(v)) throw new BadRequest(`${f.label} must be a date`)
      out[f.key] = v
    } else if (f.type === 'yesno') {
      if (v !== 'yes' && v !== 'no') throw new BadRequest(`${f.label} must be yes or no`)
      out[f.key] = v
    } else out[f.key] = v
  }
  if ('particulars' in body) out.particulars = str(body.particulars, 4000, 'Further remarks')

  if ('ports_of_call' in body) {
    if (!Array.isArray(body.ports_of_call)) throw new BadRequest('Ports of call are not valid')
    const ports: PortOfCall[] = []
    for (const p of body.ports_of_call.slice(0, MAX_PORTS)) {
      const port = str((p as any)?.port, 120, 'Port of call') ?? ''
      const departed = str((p as any)?.departed, 10, 'Departure date') ?? ''
      if (departed && !DATE_RE.test(departed)) throw new BadRequest('Departure dates must be dates')
      if (port || departed) ports.push({ port, departed })
    }
    out.ports_of_call = ports
  }

  if ('joined_persons' in body) {
    if (!Array.isArray(body.joined_persons)) throw new BadRequest('Persons joined are not valid')
    const people: JoinedPerson[] = []
    for (const p of body.joined_persons.slice(0, MAX_JOINERS)) {
      const name = str((p as any)?.name, 120, 'Name') ?? ''
      const from = Array.isArray((p as any)?.joined_from) ? (p as any).joined_from : []
      const joined_from = [0, 1, 2].map((i) => str(from[i], 80, 'Joined from') ?? '')
      if (name || joined_from.some(Boolean)) people.push({ name, joined_from })
    }
    out.joined_persons = people
  }

  if ('answers' in body) {
    const raw = body.answers
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequest('Answers are not valid')
    const answers: Record<string, string | number | null> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!ANSWER_KEYS.has(k) || v == null || v === '') continue
      const q = HEALTH_QUESTIONS.find((x) => x.key === k)
      if (q) {
        if (v !== 'yes' && v !== 'no') throw new BadRequest('Each health question is yes or no')
        answers[k] = v
      } else if (HEALTH_QUESTIONS.some((x) => x.count?.key === k)) {
        const n = Number(v)
        if (!Number.isInteger(n) || n < 0 || n > 100000) throw new BadRequest('Counts must be whole numbers')
        answers[k] = n
      } else {
        answers[k] = str(v, 4000, 'Details')
      }
    }
    out.answers = answers
  }
  return out
}

/** A data: URL from the signature pad / stamp picker → PNG or JPEG bytes. */
function decodeImage(v: unknown, what: string): Uint8Array | null {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw new BadRequest(`${what} is not valid`)
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(v)
  if (!m) throw new BadRequest(`${what} must be a PNG or JPEG image`)
  if (m[2].length > (MAX_IMAGE * 4) / 3) throw new BadRequest(`${what} is too large`)
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0))
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (!png && !jpg) throw new BadRequest(`${what} isn't a valid image`)
  return bytes
}

async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Captain'
}

/** UAE public holidays from today on, which the due date skips. */
async function holidays(sb: Sb): Promise<string[]> {
  const { data } = await sb.from('uae_public_holidays').select('holiday_date')
    .gte('holiday_date', new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)).order('holiday_date').limit(200)
  return ((data ?? []) as Array<{ holiday_date: string }>).map((h) => String(h.holiday_date).slice(0, 10))
}

const personName = (c: any) =>
  (c?.full_name as string | null)?.trim() || [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim() || ''

/** What the form starts from: the vessel profile, the crew list and the last 30 days' sign-ons. */
async function prefill(sb: Sb, yachtId: string) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
  const [vessel, crew, joins] = await Promise.all([
    sb.from('yachts').select('vessel_name, imo_no, official_no, flag, gross_tonnage').eq('id', yachtId).maybeSingle(),
    sb.from('crew_members').select('full_name, first_name, last_name, rank').eq('yacht_id', yachtId).eq('status', 'active'),
    sb.from('crew_signon_events').select('event_date, port, status, crew_members(full_name, first_name, last_name)')
      .eq('yacht_id', yachtId).eq('event_type', 'sign_on').gte('event_date', since).lte('event_date', uaeToday())
      .order('event_date', { ascending: true }).limit(MAX_JOINERS),
  ])
  for (const r of [vessel, crew, joins]) if (r.error) throw r.error
  const v = (vessel.data ?? {}) as Record<string, any>
  const onBoard = (crew.data ?? []) as any[]
  const master = onBoard.find((c) => /\b(captain|master)\b/i.test(String(c.rank ?? '')) && !/\b(first|second|chief|staff|relief)\b/i.test(String(c.rank ?? '')))
  const joined: JoinedPerson[] = ((joins.data ?? []) as any[])
    .filter((e) => String(e.status ?? '').toLowerCase() !== 'cancelled')
    .map((e) => ({ name: personName(e.crew_members), joined_from: [String(e.port ?? '').trim(), '', ''] }))
    .filter((p) => p.name)
  return {
    ship_name: v.vessel_name ?? null,
    imo_no: v.imo_no || v.official_no || null,
    flag: v.flag ?? null,
    gross_tonnage: v.gross_tonnage == null ? null : String(v.gross_tonnage),
    master_name: master ? personName(master) || null : null,
    crew_count: onBoard.length || null,
    joined_persons: joined,
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
    target_label: `${yacht.vesselName} health declaration`,
    detail: `Client portal (${yacht.vesselName}) — ${detail}`,
    ip_address: request.headers.get('cf-connecting-ip'),
    user_agent: request.headers.get('user-agent'),
    result: 'success',
  })
}

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'

/** What the Abu Dhabi team sees in the Client Request raised on submission. */
function requestDetails(form: any, vesselName: string, by: string, due: string | null, late: boolean, hasStamp: boolean): string {
  const answers = (form.answers ?? {}) as Record<string, unknown>
  const yeses = HEALTH_QUESTIONS.map((q, i) => ({ q, i })).filter(({ q }) => answers[q.key] === 'yes')
  const lines = [
    `Maritime Declaration of Health for ${vesselName}, signed and submitted by ${by} — for the Abu Dhabi agency team to check and send on to Abu Dhabi Ports.`,
    '',
    `Arriving: ${fmtDate(form.arrival_date)} at ${form.port_of_arrival ?? '—'}, from ${form.arriving_from ?? '—'}`,
    `Due by: ${fmtDate(due)} (five working days before arrival)${late ? ' — SUBMITTED LATE' : ''}`,
    `Master: ${form.master_name ?? '—'} · Crew ${form.crew_count ?? '—'} · Passengers ${form.passenger_count ?? '—'}`,
    `Ship's stamp: ${hasStamp ? 'included' : 'not provided'}`,
    '',
    yeses.length
      ? `Answered YES to: ${yeses.map(({ q, i }) => `(${i + 1}) ${q.text}`).join(' ')}`
      : 'All nine health questions answered No.',
    '',
    "The signed PDF is on the vessel's Documents in Polaris, and under Health declarations on the vessel page.",
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
      const [pre, draft, submitted, hols] = await Promise.all([
        prefill(sb, yacht.yachtId),
        sb.from('health_declarations').select('*').eq('yacht_id', yacht.yachtId).eq('status', 'draft')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        sb.from('health_declarations')
          .select('id, arrival_date, port_of_arrival, arriving_from, due_date, late, submitted_at, submitted_by_name, document_id, captain_request_id, captain_requests(reference, status)')
          .eq('yacht_id', yacht.yachtId).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(20),
        holidays(sb),
      ])
      for (const r of [draft, submitted]) if (r.error) throw r.error
      return json({
        prefill: pre,
        draft: draft.data ?? null,
        submitted: submitted.data ?? [],
        holidays: hols,
        readOnly: !!yacht.preview,
      })
    }

    if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

    const body = (((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>)
    if (typeof body !== 'object') return json({ error: 'Expected a JSON body' }, 400)

    // Open a draft — reuse the vessel's existing one so there's only ever one in progress.
    if (request.method === 'POST' && !id) {
      const { data: existing } = await sb.from('health_declarations').select('*').eq('yacht_id', yacht.yachtId).eq('status', 'draft')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (existing) return json({ ok: true, draft: existing })
      // Ship particulars carry over from the last declaration; the profile fills any gaps.
      const [{ data: last }, pre] = await Promise.all([
        sb.from('health_declarations').select('*').eq('yacht_id', yacht.yachtId).eq('status', 'submitted')
          .order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
        prefill(sb, yacht.yachtId),
      ])
      const row: Record<string, unknown> = { yacht_id: yacht.yachtId, status: 'draft' }
      if (last) for (const f of HEALTH_FIELDS) if (!f.trip) row[f.key] = (last as any)[f.key] ?? null
      for (const k of ['ship_name', 'imo_no', 'flag', 'gross_tonnage', 'master_name'] as const) row[k] = row[k] ?? pre[k]
      row.crew_count = pre.crew_count
      row.joined_persons = pre.joined_persons
      const { data, error } = await sb.from('health_declarations').insert(row).select().single()
      if (error) throw error
      return json({ ok: true, draft: data }, 201)
    }

    if (!id || !UUID_RE.test(id)) return json({ error: 'Declaration not found' }, 404)
    const { data: form } = await sb.from('health_declarations').select('*').eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
    if (!form) return json({ error: 'Declaration not found' }, 404)
    if ((form as any).status === 'submitted') return json({ error: 'This declaration has already been sent to JLS.' }, 400)

    if (request.method === 'PATCH') {
      const fields = cleanFields(body)
      if (Object.keys(fields).length) {
        const { error } = await sb.from('health_declarations').update(fields).eq('id', id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
      }
      return json({ ok: true })
    }

    if (request.method === 'POST' && action === 'submit') {
      const fields = cleanFields(body)
      const merged = { ...(form as any), ...fields }
      const missing = missingForSubmit(merged)
      if (missing.length) return json({ error: `Please complete: ${missing.join(', ')}` }, 400)
      const signature = decodeImage(body.signature, 'The signature')
      if (!signature) return json({ error: "Please sign the declaration — the master's signature is required." }, 400)
      const stamp = decodeImage(body.stamp, "The ship's stamp")

      const today = uaeToday()
      const due = healthDueDate(merged.arrival_date, await holidays(sb))
      const late = !!due && today > due
      const name = await callerName(sb, yacht)

      const pdf = await buildHealthDeclarationPdf({ form: merged, signaturePng: signature, stamp, submittedOn: today, signedBy: name, late, dueDate: due })

      const base = `portal/${yacht.yachtId}/health/${id}`
      const put = async (file: string, bytes: Uint8Array, contentType: string) => {
        const { error } = await sb.storage.from(BUCKET).upload(`${base}/${file}`, bytes, { contentType, upsert: true })
        if (error) throw error
        return `${BUCKET}/${base}/${file}`
      }
      const sigRef = await put(signature[0] === 0x89 ? 'signature.png' : 'signature.jpg', signature, signature[0] === 0x89 ? 'image/png' : 'image/jpeg')
      const stampRef = stamp ? await put(stamp[0] === 0x89 ? 'stamp.png' : 'stamp.jpg', stamp, stamp[0] === 0x89 ? 'image/png' : 'image/jpeg') : null
      const fileName = `Maritime Declaration of Health - ${String(merged.ship_name ?? yacht.vesselName).replace(/[\\/:*?"<>|]+/g, '')} - ${merged.arrival_date}.pdf`
      const pdfRef = await put('declaration.pdf', pdf, 'application/pdf')

      const { data: doc, error: docErr } = await sb.from('yacht_documents').insert({
        yacht_id: yacht.yachtId, doc_type: 'health_declaration',
        title: `Maritime Declaration of Health — arriving Abu Dhabi ${fmtDate(merged.arrival_date)}`,
        file_url: pdfRef, file_name: fileName, issue_date: today,
        notes: `Signed and sent by ${name} through the Client Portal${late ? ' (after the five-working-day deadline)' : ''}`,
        portal_visible: true, portal_released_at: new Date().toISOString(),
      }).select('id').single()
      if (docErr || !doc) throw docErr ?? new Error('Could not file the PDF')

      const { data: cr, error: crErr } = await sb.from('captain_requests').insert({
        yacht_id: yacht.yachtId,
        created_by: yacht.userId,
        category: 'permits',
        title: `Maritime Declaration of Health — arriving Abu Dhabi ${fmtDate(merged.arrival_date)}${late ? ' (late)' : ''}`.slice(0, 200),
        details: requestDetails(merged, yacht.vesselName, name, due, late, !!stamp),
        priority: late ? 'high' : 'normal',
        status: 'new',
        needed_by: merged.arrival_date,
      }).select('id, reference').single()
      if (crErr || !cr) throw crErr ?? new Error('Could not send to JLS')

      const { error } = await sb.from('health_declarations').update({
        ...fields, status: 'submitted', submitted_at: new Date().toISOString(),
        submitted_by: yacht.userId, submitted_by_name: name, captain_request_id: cr.id,
        signature_ref: sigRef, stamp_ref: stampRef, pdf_ref: pdfRef, document_id: (doc as any).id,
        due_date: due, late,
      }).eq('id', id).eq('yacht_id', yacht.yachtId)
      if (error) throw error
      await audit(request, yacht, `signed and submitted the Maritime Declaration of Health (${cr.reference})${late ? ' — late' : ''}`, id)
      return json({ ok: true, requestId: cr.id, requestReference: cr.reference, late, documentId: (doc as any).id })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-health-declaration]', e)
    return json({ error: e?.message ?? 'Could not save the declaration' }, 500)
  }
}
