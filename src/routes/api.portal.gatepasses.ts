/**
 * Client-portal gate passes — the vessel asks JLS for a pass, and sees where
 * each request has got to.
 *
 *   GET  /api/portal/gatepasses   → this vessel's gate pass requests, newest first, each with
 *                                   its JLS request's reference and status
 *   POST /api/portal/gatepasses   → request one (body: pass details; renewal_of to renew)
 *
 * Each request raises a Client Request (category "permits") for the team. The
 * table is read-only to portal logins at the database; writes run here with the
 * service role, hard-filtered to the caller's vessel, and only when the vessel
 * has Gate passes switched on and the caller's position can see it.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { GATE_PASS_TYPES } from '@/lib/portal/gatepasses'
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TYPES = new Set<string>(GATE_PASS_TYPES.map((t) => t.value))
const MAX_PEOPLE = 40
const MAX_DAYS = 366

const text = (v: unknown, max: number, label: string): string | null => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw new BadRequest(`${label} must be text`)
  const t = v.trim()
  if (t.length > max) throw new BadRequest(`${label} is too long`)
  return t || null
}

type Person = { name: string; company: string | null; id_number: string | null; nationality: string | null }

function cleanPeople(raw: unknown): Person[] {
  if (!Array.isArray(raw)) throw new BadRequest('People must be a list')
  if (raw.length > MAX_PEOPLE) throw new BadRequest(`At most ${MAX_PEOPLE} people per pass request`)
  const out: Person[] = []
  for (const [i, r] of (raw as any[]).entries()) {
    const name = text(r?.name, 120, `Person ${i + 1}`)
    if (!name) continue
    out.push({
      name,
      company: text(r?.company, 120, `Person ${i + 1} company`),
      id_number: text(r?.id_number, 40, `Person ${i + 1} ID / passport number`),
      nationality: text(r?.nationality, 60, `Person ${i + 1} nationality`),
    })
  }
  return out
}

async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Captain'
}

const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export async function portalGatePassesHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)

  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled('gatepasses', modules)) return json({ error: "Gate passes aren't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has('gatepasses')) return json({ error: "Your position doesn't include gate passes." }, 403)

  const sb = admin()
  try {
    if (request.method === 'GET') {
      const [{ data, error }, { data: y }] = await Promise.all([
        sb.from('portal_gate_pass_requests')
          .select('*, captain_requests(reference, status)')
          .eq('yacht_id', yacht.yachtId).order('created_at', { ascending: false }).limit(200),
        sb.from('yachts').select('berth, location').eq('id', yacht.yachtId).maybeSingle(),
      ])
      if (error) throw error
      const where = [(y as any)?.berth && `Berth ${(y as any).berth}`, (y as any)?.location].filter(Boolean).join(', ')
      return json({ requests: data ?? [], defaultLocation: where || null, readOnly: !!yacht.preview })
    }

    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

    const body = (((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>)
    const pass_type = typeof body.pass_type === 'string' && TYPES.has(body.pass_type) ? body.pass_type : null
    if (!pass_type) return json({ error: 'Choose what the pass is for' }, 400)
    const valid_from = typeof body.valid_from === 'string' && DATE_RE.test(body.valid_from) ? body.valid_from : null
    const valid_to = typeof body.valid_to === 'string' && DATE_RE.test(body.valid_to) ? body.valid_to : null
    if (!valid_from || !valid_to) return json({ error: 'Choose the dates the pass is needed for' }, 400)
    if (valid_to < valid_from) return json({ error: 'The pass must end on or after its start date' }, 400)
    if ((Date.parse(valid_to) - Date.parse(valid_from)) / 86400000 > MAX_DAYS) return json({ error: 'A pass can cover at most a year' }, 400)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    if (valid_to < yesterday) return json({ error: 'Those dates have already passed' }, 400)

    const people = cleanPeople(body.people ?? [])
    const vehicle_plate = text(body.vehicle_plate, 30, 'Vehicle plate')?.toUpperCase() ?? null
    if (pass_type === 'vehicle' && !vehicle_plate) return json({ error: 'Add the vehicle plate number' }, 400)
    if (pass_type !== 'vehicle' && !people.length) return json({ error: 'Add at least one person' }, 400)

    let renewal_of: string | null = null
    if (typeof body.renewal_of === 'string' && UUID_RE.test(body.renewal_of)) {
      const { data: prev } = await sb.from('portal_gate_pass_requests').select('id').eq('id', body.renewal_of).eq('yacht_id', yacht.yachtId).maybeSingle()
      renewal_of = (prev as any)?.id ?? null
    }

    const row = {
      yacht_id: yacht.yachtId, pass_type, people, vehicle_plate,
      company: text(body.company, 120, 'Company'),
      purpose: text(body.purpose, 300, 'Purpose'),
      location: text(body.location, 160, 'Location'),
      valid_from, valid_to,
      contact_name: text(body.contact_name, 120, 'Contact name'),
      contact_phone: text(body.contact_phone, 40, 'Contact phone'),
      notes: text(body.notes, 2000, 'Notes'),
      renewal_of,
    }

    const name = await callerName(sb, yacht)
    const typeLabel = GATE_PASS_TYPES.find((t) => t.value === pass_type)!.label.toLowerCase()
    const who = pass_type === 'vehicle' && !people.length
      ? `vehicle ${vehicle_plate}`
      : `${people.length} ${people.length === 1 ? 'person' : 'people'}${row.company ? `, ${row.company}` : ''}`
    const dates = valid_from === valid_to ? fmt(valid_from) : `${fmt(valid_from)} – ${fmt(valid_to)}`
    const details = [
      `${renewal_of ? 'Renewal of a' : 'New'} ${typeLabel} gate pass for ${yacht.vesselName}, requested by ${name}.`,
      '',
      `Dates: ${dates}`,
      row.location ? `Location: ${row.location}` : null,
      row.purpose ? `Purpose: ${row.purpose}` : null,
      vehicle_plate ? `Vehicle: ${vehicle_plate}` : null,
      people.length ? '' : null,
      ...people.map((p) => `• ${p.name}${p.company ? ` (${p.company})` : ''}${p.nationality ? ` · ${p.nationality}` : ''}${p.id_number ? ` · ID ${p.id_number}` : ''}`),
      row.contact_name || row.contact_phone ? `\nOn-site contact: ${[row.contact_name, row.contact_phone].filter(Boolean).join(' · ')}` : null,
      row.notes ? `\nNotes: ${row.notes}` : null,
    ].filter((l) => l !== null).join('\n')

    const { data: cr, error: crErr } = await sb.from('captain_requests').insert({
      yacht_id: yacht.yachtId, created_by: yacht.userId, category: 'permits',
      title: `Gate pass — ${who}, ${dates}`.slice(0, 200), details,
      priority: (Date.parse(valid_from) - Date.now()) / 86400000 < 2 ? 'high' : 'normal',
      status: 'new', needed_by: valid_from,
    }).select('id, reference').single()
    if (crErr || !cr) throw crErr ?? new Error('Could not send to JLS')

    const { data, error } = await sb.from('portal_gate_pass_requests')
      .insert({ ...row, requested_by: yacht.userId, requested_by_name: name, captain_request_id: cr.id })
      .select('id').single()
    if (error || !data) throw error ?? new Error('Could not save the request')

    await logAuditEvent({
      event_type: 'DATA', module: 'portal', actor_id: null,
      actor_email: yacht.email || '(client portal)', actor_role: yacht.position ?? 'captain',
      target_type: 'portal_gate_pass_requests', target_id: data.id, target_label: `${yacht.vesselName} gate pass`,
      detail: `Client portal (${yacht.vesselName}) — requested a ${typeLabel} gate pass (${who}, ${dates}) as ${cr.reference}`,
      ip_address: request.headers.get('cf-connecting-ip'), user_agent: request.headers.get('user-agent'), result: 'success',
    })
    return json({ ok: true, id: data.id, requestId: cr.id, requestReference: cr.reference }, 201)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-gatepasses]', e)
    return json({ error: e?.message ?? 'Could not send the gate pass request' }, 500)
  }
}
