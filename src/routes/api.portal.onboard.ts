/**
 * Client-portal On board — the crew's own records in the Management module:
 * planned-maintenance jobs and equipment, charter bookings, ISM certificates and
 * drills.
 *
 *   POST   /api/portal/onboard?kind=<kind>            → add one
 *   PATCH  /api/portal/onboard?kind=<kind>&id=        → edit one
 *   POST   /api/portal/onboard?kind=pms_task&id=&action=done
 *                                                     → mark a job done (body: { date?, hours? })
 *   POST   /api/portal/onboard?kind=stock_item&id=&action=adjust
 *                                                     → change a stock count (body: { delta })
 *   DELETE /api/portal/onboard?kind=<kind>&id=        → remove one
 *
 *   POST   /api/portal/onboard?kind=inventory_item&id=&action=checked
 *                                                     → record that an item was seen and checked today (body: { condition? })
 *   POST   /api/portal/onboard?kind=rest_hours&action=set
 *                                                     → record one crew member's rest for a day
 *                                                       (body: { crew_member_id, day, rest_hours | null, notes? })
 *
 * kind = pms_task | pms_equipment | charter | ism_cert | ism_drill | stock_item | handover | rest_hours | inventory_item
 *
 * The tables are read-only to portal logins at the database (captain_select
 * only), so writes come through here with the service role, hard-filtered to the
 * vessel resolved from the caller's JWT: every update and delete names
 * `yacht_id`, so an id from another vessel matches nothing. A write is refused
 * unless the vessel has the Management module (and that feature) switched on and
 * the caller's position can see the section. Only the columns in FIELDS can be
 * set. Reads stay on the client through RLS (captain_select), which also works
 * in staff preview.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { ONBOARD_KINDS, nextDueDate, nextDueHours, parseRest, pmsStatus, certStatus, type OnboardKind } from '@/lib/portal/onboard'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}
type Sb = ReturnType<typeof admin>

type FieldKind =
  | 'text' | 'longtext' | 'date' | 'int' | 'num' | 'uuid' | 'bool'
  | { oneOf: readonly string[] }
type FieldSpec = Record<string, FieldKind>

/** Columns the portal may set on each kind, and how each is checked. */
const FIELDS: Record<OnboardKind, FieldSpec> = {
  pms_task: {
    title: 'text', description: 'longtext', equipment_id: 'uuid',
    interval_kind: { oneOf: ['calendar', 'hours'] }, interval_value: 'int',
    interval_unit: { oneOf: ['days', 'weeks', 'months', 'years', 'hours'] },
    last_done_date: 'date', last_done_hours: 'num', next_due_date: 'date', next_due_hours: 'num',
    assigned_to: 'text', notes: 'longtext',
  },
  pms_equipment: {
    name: 'text', category: 'text', maker: 'text', model: 'text', serial_number: 'text',
    location: 'text', running_hours: 'num', notes: 'longtext',
  },
  charter: {
    charter_ref: 'text', charterer_name: 'text', broker: 'text',
    status: { oneOf: ['enquiry', 'option', 'confirmed', 'in_progress', 'completed', 'cancelled'] },
    start_date: 'date', end_date: 'date', embark_port: 'text', disembark_port: 'text',
    itinerary: 'longtext', guest_count: 'int', charter_fee: 'num',
    currency: { oneOf: ['EUR', 'USD', 'AED', 'GBP'] }, notes: 'longtext',
  },
  ism_cert: {
    title: 'text', certificate_type: 'text', reference: 'text', issuing_authority: 'text',
    issued_date: 'date', expiry_date: 'date', status: { oneOf: ['valid', 'pending'] }, notes: 'longtext',
  },
  ism_drill: {
    drill_type: 'text', conducted_at: 'date', conducted_by: 'text', participants: 'longtext',
    location: 'text', notes: 'longtext',
  },
  stock_item: {
    name: 'text', department: { oneOf: ['galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other'] },
    category: 'text', location: 'text', unit: 'text', quantity: 'num', min_quantity: 'num', par_quantity: 'num',
    supplier_ref: 'text', notes: 'longtext',
  },
  handover: {
    department: { oneOf: ['galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other'] },
    title: 'text', body: 'longtext', pinned: 'bool',
  },
  // Written only through action=set (one row per crew member per day).
  rest_hours: {},
  inventory_item: {
    name: 'text', category: 'text',
    department: { oneOf: ['galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other'] },
    location: 'text', quantity: 'int',
    condition: { oneOf: ['new', 'good', 'fair', 'poor', 'damaged', 'missing'] },
    make: 'text', model: 'text', serial_number: 'text', supplier: 'text',
    purchase_date: 'date', purchase_price: 'num', currency: { oneOf: ['EUR', 'USD', 'AED', 'GBP'] },
    warranty_expiry: 'date', last_checked: 'date', notes: 'longtext',
  },
}

/** The one field each kind can't be saved without. */
const REQUIRED: Record<OnboardKind, string> = {
  pms_task: 'title', pms_equipment: 'name', charter: 'charterer_name', ism_cert: 'title', ism_drill: 'drill_type',
  stock_item: 'name', handover: 'title', rest_hours: 'rest_hours', inventory_item: 'name',
}
const REQUIRED_LABEL: Record<OnboardKind, string> = {
  pms_task: 'A job title', pms_equipment: 'An equipment name', charter: "The charterer's name",
  ism_cert: 'A certificate title', ism_drill: 'The drill type', stock_item: 'An item name',
  handover: 'A title', rest_hours: 'Hours of rest', inventory_item: 'An item name',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class BadRequest extends Error {}

/** Validate a body down to the kind's FIELDS. Missing keys are left out; '' / null clears. */
function cleanFields(kind: OnboardKind, body: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, spec] of Object.entries(FIELDS[kind])) {
    if (!(key in body)) continue
    const raw = body[key]
    if (spec === 'bool') { out[key] = raw === true || raw === 'true'; continue }
    if (raw === null || raw === '') { out[key] = null; continue }
    if (spec === 'int' || spec === 'num') {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
      if (!Number.isFinite(n) || n < 0) throw new BadRequest(`${key.replace(/_/g, ' ')} must be a positive number`)
      if (spec === 'int' && !Number.isInteger(n)) throw new BadRequest(`${key.replace(/_/g, ' ')} must be a whole number`)
      if (n > 1e9) throw new BadRequest(`${key.replace(/_/g, ' ')} is too large`)
      out[key] = n
      continue
    }
    if (typeof raw !== 'string') throw new BadRequest(`${key.replace(/_/g, ' ')} must be text`)
    const v = raw.trim()
    if (!v) { out[key] = null; continue }
    if (typeof spec === 'object') {
      if (!spec.oneOf.includes(v)) throw new BadRequest(`Unknown ${key.replace(/_/g, ' ')}`)
    } else if (spec === 'date') {
      if (!DATE_RE.test(v)) throw new BadRequest(`${key.replace(/_/g, ' ')} must be a date`)
    } else if (spec === 'uuid') {
      if (!UUID_RE.test(v)) throw new BadRequest(`${key.replace(/_/g, ' ')} is not valid`)
    } else if (v.length > (spec === 'longtext' ? 4000 : 160)) {
      throw new BadRequest(`${key.replace(/_/g, ' ')} is too long`)
    }
    out[key] = v
  }
  return out
}

async function audit(request: Request, yacht: PortalYacht, kind: OnboardKind, verb: string, id: string, label: string) {
  await logAuditEvent({
    event_type: 'DATA',
    module: 'portal',
    actor_id: yacht.preview ? yacht.userId : null,
    actor_email: yacht.email || '(client portal)',
    actor_role: yacht.position ?? 'captain',
    target_type: ONBOARD_KINDS[kind].table,
    target_id: id,
    target_label: `${yacht.vesselName} · ${label}`,
    detail: `Client portal (${yacht.vesselName}) — ${verb} ${kind.replace('_', ' ')}: ${label}`,
    ip_address: request.headers.get('cf-connecting-ip'),
    user_agent: request.headers.get('user-agent'),
    result: 'success',
  })
}

/** How the caller is named on what they write: their portal display name, else their email. */
async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Crew'
}

/** The row, if it belongs to this vessel. */
async function ownRow(sb: Sb, yacht: PortalYacht, kind: OnboardKind, id: string | null): Promise<any | null> {
  if (!id || !UUID_RE.test(id)) return null
  const { data } = await sb.from(ONBOARD_KINDS[kind].table).select('*').eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
  return data ?? null
}

/** An equipment id the caller sent must be this vessel's. Returns its running hours. */
async function checkEquipment(sb: Sb, yacht: PortalYacht, equipmentId: string | number | null | undefined): Promise<number | null> {
  if (!equipmentId) return null
  const { data } = await sb.from('pms_equipment').select('id, running_hours').eq('id', String(equipmentId)).eq('yacht_id', yacht.yachtId).maybeSingle()
  if (!data) throw new BadRequest('That equipment is not on this vessel')
  return (data as any).running_hours ?? null
}

/**
 * Keep the stored status columns in step with the dates, so staff screens and
 * reports that read the column agree with what the portal shows.
 */
async function withDerivedStatus(sb: Sb, yacht: PortalYacht, kind: OnboardKind, row: Record<string, any>): Promise<Record<string, any>> {
  if (kind === 'pms_task') {
    const hours = await checkEquipment(sb, yacht, row.equipment_id)
    // An hour-based job's unit is always hours; a calendar job's never is.
    const unit = row.interval_kind === 'hours' ? 'hours' : row.interval_unit === 'hours' ? null : row.interval_unit
    const normalised = { ...row, interval_unit: unit ?? null }
    // A one-off job that has been marked done stays done when edited.
    const status = row.status === 'done' && !row.interval_value ? 'done' : pmsStatus(normalised as any, hours)
    return { ...normalised, status }
  }
  if (kind === 'ism_cert') return { ...row, status: certStatus(row.status ?? 'valid', row.expiry_date ?? null) }
  return row
}

const labelOf = (kind: OnboardKind, r: Record<string, any>) =>
  String(r[REQUIRED[kind]] ?? r.charter_ref ?? 'record')

/**
 * Mark a job done: record when (and at how many hours), move the next due point
 * on by the interval, and lift the equipment's running hours if the reading is
 * newer than what's on file.
 */
async function markDone(sb: Sb, yacht: PortalYacht, task: any, body: Record<string, unknown>) {
  const date = typeof body.date === 'string' && DATE_RE.test(body.date) ? body.date : new Date().toISOString().slice(0, 10)
  const hours = body.hours == null || body.hours === '' ? null : Number(body.hours)
  if (hours != null && (!Number.isFinite(hours) || hours < 0)) throw new BadRequest('Running hours must be a positive number')
  if (task.interval_kind === 'hours' && hours == null) throw new BadRequest('Enter the running hours the job was done at')

  const update: Record<string, any> = {
    last_done_date: date,
    last_done_hours: hours ?? task.last_done_hours ?? null,
    next_due_date: nextDueDate(task, date) ?? (task.interval_kind === 'hours' ? null : task.next_due_date),
    next_due_hours: nextDueHours(task, hours) ?? (task.interval_kind === 'hours' ? task.next_due_hours : null),
  }
  if (task.equipment_id && hours != null) {
    const { data: eq } = await sb.from('pms_equipment').select('running_hours').eq('id', task.equipment_id).eq('yacht_id', yacht.yachtId).maybeSingle()
    if (eq && ((eq as any).running_hours == null || hours > Number((eq as any).running_hours))) {
      await sb.from('pms_equipment').update({ running_hours: hours }).eq('id', task.equipment_id).eq('yacht_id', yacht.yachtId)
    }
  }
  // A job with no interval is a one-off: once done it stays done.
  const recurring = !!task.interval_value && (task.interval_kind === 'hours' || !!task.interval_unit)
  const merged = { ...task, ...update }
  update.status = recurring ? pmsStatus(merged, update.last_done_hours) : 'done'
  const { error } = await sb.from('pms_tasks').update(update).eq('id', task.id).eq('yacht_id', yacht.yachtId)
  if (error) throw error

  // The spares this job uses come off the vessel's stock (never below zero).
  const spares = Array.isArray(task.spares) ? task.spares as Array<{ stock_item_id: string; qty: number }> : []
  if (spares.length) {
    const { data: items } = await sb.from('onboard_stock_items').select('id, quantity')
      .eq('yacht_id', yacht.yachtId).in('id', spares.map((x) => x.stock_item_id))
    for (const it of (items ?? []) as any[]) {
      const used = spares.filter((x) => x.stock_item_id === it.id).reduce((n, x) => n + Number(x.qty || 0), 0)
      await sb.from('onboard_stock_items').update({ quantity: Math.max(0, Number(it.quantity ?? 0) - used) })
        .eq('id', it.id).eq('yacht_id', yacht.yachtId)
    }
  }
  return update
}

/** A job's spares, validated: this vessel's stock items, positive quantities. */
async function cleanSpares(sb: Sb, yacht: PortalYacht, raw: unknown): Promise<Array<{ stock_item_id: string; qty: number }>> {
  if (!Array.isArray(raw)) throw new BadRequest('Spares must be a list')
  if (raw.length > 30) throw new BadRequest('A job can list at most 30 spares')
  const out = (raw as any[]).map((r) => ({ stock_item_id: String(r?.stock_item_id ?? ''), qty: Number(r?.qty) }))
  if (out.some((r) => !UUID_RE.test(r.stock_item_id) || !Number.isFinite(r.qty) || r.qty <= 0 || r.qty > 10000)) {
    throw new BadRequest('Each spare needs a stock item and a quantity above zero')
  }
  if (out.length) {
    const { data } = await sb.from('onboard_stock_items').select('id').eq('yacht_id', yacht.yachtId).in('id', out.map((r) => r.stock_item_id))
    const own = new Set((data ?? []).map((r: any) => r.id))
    if (out.some((r) => !own.has(r.stock_item_id))) throw new BadRequest("A spare is not on this vessel's stock list")
  }
  return out
}

export async function portalOnboardHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

  const url = new URL(request.url)
  const kind = url.searchParams.get('kind') as OnboardKind | null
  if (!kind || !(kind in ONBOARD_KINDS)) return json({ error: 'Unknown record kind' }, 400)
  const section = ONBOARD_KINDS[kind].section

  // The vessel must have this part of the Management module, and the caller's
  // position must be able to see it.
  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled(section, modules)) return json({ error: "This isn't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has(section)) return json({ error: "Your position doesn't include this section." }, 403)

  const sb = admin()
  const id = url.searchParams.get('id')
  const table = ONBOARD_KINDS[kind].table

  try {
    if (request.method === 'DELETE') {
      const row = await ownRow(sb, yacht, kind, id)
      if (!row) return json({ error: 'Not found' }, 404)
      const { error } = await sb.from(table).delete().eq('id', row.id).eq('yacht_id', yacht.yachtId)
      if (error) throw error
      await audit(request, yacht, kind, 'deleted', row.id, labelOf(kind, row))
      return json({ ok: true })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') return json({ error: 'Expected a JSON body' }, 400)

    if (request.method === 'POST' && url.searchParams.get('action') === 'set') {
      if (kind !== 'rest_hours') return json({ error: 'Unknown action' }, 400)
      const crewId = typeof body.crew_member_id === 'string' && UUID_RE.test(body.crew_member_id) ? body.crew_member_id : null
      const day = typeof body.day === 'string' && DATE_RE.test(body.day) ? body.day : null
      if (!crewId || !day) return json({ error: 'Crew member and day are required' }, 400)
      if (day > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) return json({ error: "Rest can't be recorded for a future day" }, 400)
      const { data: crew } = await sb.from('crew_members').select('id').eq('id', crewId).eq('yacht_id', yacht.yachtId).maybeSingle()
      if (!crew) return json({ error: 'That crew member is not on this vessel' }, 400)
      if (body.rest_hours == null || body.rest_hours === '') {
        const { error } = await sb.from('onboard_rest_hours').delete().eq('crew_member_id', crewId).eq('day', day).eq('yacht_id', yacht.yachtId)
        if (error) throw error
        return json({ ok: true, rest_hours: null })
      }
      // "10", or split periods like "6+4" (kept so the MLC split rule can be checked).
      const parsed = parseRest(String(body.rest_hours))
      if ('error' in parsed) return json({ error: parsed.error }, 400)
      const hours = parsed.total
      const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) || null : undefined
      const { error } = await sb.from('onboard_rest_hours').upsert({
        yacht_id: yacht.yachtId, crew_member_id: crewId, day, rest_hours: hours, rest_split: parsed.split,
        recorded_by_name: await callerName(sb, yacht), ...(notes !== undefined ? { notes } : {}),
      }, { onConflict: 'crew_member_id,day' })
      if (error) throw error
      return json({ ok: true, rest_hours: hours, rest_split: parsed.split })
    }

    if (request.method === 'POST' && url.searchParams.get('action') === 'adjust') {
      if (kind !== 'stock_item') return json({ error: 'Only stock can be adjusted' }, 400)
      const item = await ownRow(sb, yacht, kind, id)
      if (!item) return json({ error: 'Stock item not found' }, 404)
      const delta = Number(body.delta)
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1e6) return json({ error: 'Enter how many to add or take away' }, 400)
      const quantity = Math.max(0, Number(item.quantity ?? 0) + delta)
      const { error } = await sb.from('onboard_stock_items').update({ quantity }).eq('id', item.id).eq('yacht_id', yacht.yachtId)
      if (error) throw error
      return json({ ok: true, quantity })
    }

    if (request.method === 'POST' && url.searchParams.get('action') === 'checked') {
      if (kind !== 'inventory_item') return json({ error: 'Only inventory can be checked' }, 400)
      const item = await ownRow(sb, yacht, kind, id)
      if (!item) return json({ error: 'Item not found' }, 404)
      const update: Record<string, any> = {
        last_checked: new Date().toISOString().slice(0, 10),
        last_checked_by_name: await callerName(sb, yacht),
      }
      if (body.condition != null && body.condition !== '') {
        const c = cleanFields('inventory_item', { condition: body.condition })
        update.condition = c.condition
      }
      const { error } = await sb.from('onboard_inventory_items').update(update).eq('id', item.id).eq('yacht_id', yacht.yachtId)
      if (error) throw error
      return json({ ok: true, ...update })
    }

    if (request.method === 'POST' && url.searchParams.get('action') === 'done') {
      if (kind !== 'pms_task') return json({ error: 'Only jobs can be marked done' }, 400)
      const task = await ownRow(sb, yacht, kind, id)
      if (!task) return json({ error: 'Job not found' }, 404)
      const update = await markDone(sb, yacht, task, body)
      await audit(request, yacht, kind, 'completed', task.id, task.title)
      return json({ ok: true, ...update })
    }

    if (kind === 'rest_hours') return json({ error: 'Record rest with action=set' }, 400)
    const fields = cleanFields(kind, body)
    if ('equipment_id' in fields) await checkEquipment(sb, yacht, fields.equipment_id as string | null)

    if (request.method === 'POST') {
      if (!fields[REQUIRED[kind]]) return json({ error: `${REQUIRED_LABEL[kind]} is required` }, 400)
      const row = await withDerivedStatus(sb, yacht, kind, {
        ...fields, yacht_id: yacht.yachtId,
        ...(kind === 'handover' ? { author_name: await callerName(sb, yacht) } : {}),
      })
      const { data, error } = await sb.from(table).insert(row).select('id').single()
      if (error || !data) throw error ?? new Error('Could not save')
      await audit(request, yacht, kind, 'added', data.id, labelOf(kind, row))
      return json({ ok: true, id: data.id }, 201)
    }

    if (request.method === 'PATCH') {
      const existing = await ownRow(sb, yacht, kind, id)
      if (!existing) return json({ error: 'Not found' }, 404)
      if (REQUIRED[kind] in fields && !fields[REQUIRED[kind]]) return json({ error: `${REQUIRED_LABEL[kind]} is required` }, 400)
      const merged = await withDerivedStatus(sb, yacht, kind, { ...existing, ...fields })
      const update: Record<string, any> = { ...fields }
      if (kind === 'pms_task' && 'spares' in body) update.spares = await cleanSpares(sb, yacht, body.spares)
      if ((kind === 'pms_task' || kind === 'ism_cert') && merged.status !== existing.status) update.status = merged.status
      if (kind === 'pms_task' && merged.interval_unit !== existing.interval_unit) update.interval_unit = merged.interval_unit
      if (Object.keys(update).length) {
        const { error } = await sb.from(table).update(update).eq('id', existing.id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
      }
      await audit(request, yacht, kind, 'edited', existing.id, labelOf(kind, merged))
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-onboard]', e)
    return json({ error: e?.message ?? 'Could not save' }, 500)
  }
}
