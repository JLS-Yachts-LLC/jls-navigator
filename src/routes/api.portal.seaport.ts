/**
 * Client-portal Seaport Immigration — the vessel's sign-on / sign-off requests.
 *
 *   GET  /api/portal/seaport   → this vessel's requests, newest first, with their crew lines
 *   POST /api/portal/seaport   → submit one (body: { request_date, notes?, arrivals[], departures[] })
 *
 * This is the same request JLS's seaport team works from (/seaport), with its SLA
 * timers and the completion report — which is emailed to whoever submitted it,
 * so the captain gets it. seaport_* tables are closed to portal logins at the
 * database; everything here runs with the service role, hard-filtered to the
 * caller's vessel, and only when the vessel has Arrivals & departures on and
 * the caller's position can see it. A submitted request isn't edited from the
 * portal — changes go through the team on chat or the request.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
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
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ROWS = 30

type Line = {
  crew_id: string | null; crew_name: string; flight_date: string | null; flight_time: string | null;
  flight_number: string | null; pickup_required: boolean; pickup_time: string | null; crew_contact: string | null;
}

/** Validate one direction's crew lines; linked crew must be on this vessel. */
async function cleanLines(sb: Sb, yacht: PortalYacht, raw: unknown, label: string): Promise<Line[]> {
  if (raw == null) return []
  if (!Array.isArray(raw)) throw new BadRequest(`${label} must be a list`)
  if (raw.length > MAX_ROWS) throw new BadRequest(`At most ${MAX_ROWS} ${label.toLowerCase()} per request`)
  const str = (v: unknown, max: number, what: string) => {
    if (v == null || v === '') return null
    if (typeof v !== 'string') throw new BadRequest(`${what} must be text`)
    const t = v.trim()
    if (t.length > max) throw new BadRequest(`${what} is too long`)
    return t || null
  }
  const lines: Line[] = []
  for (const [i, r] of (raw as any[]).entries()) {
    const n = `${label} line ${i + 1}`
    const crew_name = str(r?.crew_name, 120, `${n} name`)
    if (!crew_name) continue
    const flight_date = str(r?.flight_date, 10, `${n} flight date`)
    if (flight_date && !DATE_RE.test(flight_date)) throw new BadRequest(`${n}: flight date must be a date`)
    const flight_time = str(r?.flight_time, 5, `${n} flight time`)
    if (flight_time && !TIME_RE.test(flight_time)) throw new BadRequest(`${n}: flight time must be HH:MM`)
    const pickup_required = !!r?.pickup_required
    const pickup_time = pickup_required ? str(r?.pickup_time, 5, `${n} pickup time`) : null
    if (pickup_time && !TIME_RE.test(pickup_time)) throw new BadRequest(`${n}: pickup time must be HH:MM`)
    const crew_id = typeof r?.crew_id === 'string' && UUID_RE.test(r.crew_id) ? r.crew_id : null
    lines.push({
      crew_id, crew_name, flight_date, flight_time, flight_number: str(r?.flight_number, 20, `${n} flight number`)?.toUpperCase() ?? null,
      pickup_required, pickup_time, crew_contact: str(r?.crew_contact, 40, `${n} contact`),
    })
  }
  const ids = [...new Set(lines.map((l) => l.crew_id).filter(Boolean))] as string[]
  if (ids.length) {
    const { data } = await sb.from('crew_members').select('id').eq('yacht_id', yacht.yachtId).in('id', ids)
    const own = new Set((data ?? []).map((r: any) => r.id))
    for (const l of lines) if (l.crew_id && !own.has(l.crew_id)) l.crew_id = null
  }
  return lines
}

export async function portalSeaportHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)

  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled('movements', modules)) return json({ error: "Arrivals & departures isn't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has('movements')) return json({ error: "Your position doesn't include arrivals & departures." }, 403)

  const sb = admin()
  try {
    if (request.method === 'GET') {
      const { data: reqs, error } = await sb.from('seaport_requests')
        .select('request_id, request_date, status, notes, created_at, acknowledged_at, completed_at, report_sent_at')
        .eq('vessel_id', yacht.yachtId).order('created_at', { ascending: false }).limit(30)
      if (error) throw error
      const ids = (reqs ?? []).map((r: any) => r.request_id)
      const [arr, dep] = ids.length
        ? await Promise.all([
            sb.from('seaport_arrivals').select('request_id, crew_name, flight_date, flight_time, flight_number, pickup_required, pickup_time, status').in('request_id', ids),
            sb.from('seaport_departures').select('request_id, crew_name, flight_date, flight_time, flight_number, pickup_required, pickup_time, status').in('request_id', ids),
          ])
        : [{ data: [] as any[] }, { data: [] as any[] }]
      return json({
        readOnly: !!yacht.preview,
        requests: (reqs ?? []).map((r: any) => ({
          ...r,
          arrivals: (arr.data ?? []).filter((a: any) => a.request_id === r.request_id),
          departures: (dep.data ?? []).filter((d: any) => d.request_id === r.request_id),
        })),
      })
    }

    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

    const body = (((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>)
    const requestDate = typeof body.request_date === 'string' && DATE_RE.test(body.request_date) ? body.request_date : null
    if (!requestDate) return json({ error: 'Choose the date or week this covers' }, 400)
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) || null : null
    const arrivals = await cleanLines(sb, yacht, body.arrivals, 'Arrivals')
    const departures = await cleanLines(sb, yacht, body.departures, 'Departures')
    if (!arrivals.length && !departures.length) return json({ error: 'Add at least one crew member joining or leaving' }, 400)

    const { data: req, error } = await sb.from('seaport_requests')
      .insert({ vessel_id: yacht.yachtId, submitted_by: yacht.userId, request_date: requestDate, notes, status: 'submitted' })
      .select('request_id').single()
    if (error || !req) throw error ?? new Error('Could not submit the request')
    const rid = (req as any).request_id
    if (arrivals.length) {
      const { error: e } = await sb.from('seaport_arrivals').insert(arrivals.map((l) => ({ ...l, request_id: rid, sign_on: true })))
      if (e) throw e
    }
    if (departures.length) {
      const { error: e } = await sb.from('seaport_departures').insert(departures.map((l) => ({ ...l, request_id: rid, sign_off: true })))
      if (e) throw e
    }

    await logAuditEvent({
      event_type: 'DATA',
      module: 'portal',
      actor_id: null,
      actor_email: yacht.email || '(client portal)',
      actor_role: yacht.position ?? 'captain',
      target_type: 'seaport_requests',
      target_id: rid,
      target_label: `${yacht.vesselName} seaport request`,
      detail: `Client portal (${yacht.vesselName}) — submitted a seaport request: ${arrivals.length} joining, ${departures.length} leaving`,
      ip_address: request.headers.get('cf-connecting-ip'),
      user_agent: request.headers.get('user-agent'),
      result: 'success',
    })
    return json({ ok: true, id: rid }, 201)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-seaport]', e)
    return json({ error: e?.message ?? 'Could not submit the request' }, 500)
  }
}
