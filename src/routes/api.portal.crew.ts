/**
 * Client-portal Crew — the vessel's crew list, and the captain's changes to it.
 *
 *   GET    /api/portal/crew          → this vessel's crew, with each one's primary passport
 *   POST   /api/portal/crew          → add a crew member to this vessel
 *   PATCH  /api/portal/crew?id=      → edit one (or sign them off / back on via `status`)
 *   DELETE /api/portal/crew?id=      → remove one — see removeCrew() for what that means
 *
 * crew_members stays read-only to portal logins at the database (its restrictive
 * portal_captain_block_* policies), and passports live on crew_passports, which
 * the portal cannot read at all. So the portal reads and writes crew here, with
 * the service role, hard-filtered to the vessel resolved from the caller's JWT —
 * every write names `yacht_id` in its filter, so an id from another vessel
 * matches nothing. Only the columns in EDITABLE can be set; staff-side fields
 * (SharePoint sync, OCR, verification) are never touched.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { canManageCrew } from '@/lib/portal/portal-positions'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

type Sb = ReturnType<typeof admin>

/** crew_members columns the portal may set, and how each is checked. */
const EDITABLE: Record<string, 'text' | 'date' | 'email'> = {
  first_name: 'text', middle_name: 'text', last_name: 'text',
  rank: 'text', department: 'text', nationality: 'text', gender: 'text',
  date_of_birth: 'date', email: 'email', phone: 'text',
}

/** Statuses the portal can move a crew member between (the values staff screens use). */
const PORTAL_STATUSES = new Set(['active', 'on_leave', 'off_signed'])

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CREW_COLUMNS =
  'id, first_name, middle_name, last_name, full_name, rank, department, nationality, gender, date_of_birth, email, phone, status, passport_number, passport_expiry_date'

/**
 * Tables that hold a crew member's history with JLS. Every one either cascades
 * on delete (so deleting the crew row would silently destroy visas, documents and
 * sign-on records) or blocks it — either way a crew member with any of these is
 * signed off, never deleted.
 */
const HISTORY: Array<[table: string, column: string]> = [
  ['visa_applications', 'crew_member_id'],
  ['crew_signon_events', 'crew_member_id'],
  ['crew_timeline_events', 'crew_member_id'],
  ['crew_documents', 'crew_member_id'],
  ['crew_document_folders', 'crew_member_id'],
  ['crew_document_placements', 'crew_member_id'],
  ['crew_document_sharepoint_links', 'crew_member_id'],
  ['training_records', 'crew_member_id'],
  ['training_certifications', 'crew_member_id'],
  ['compliance_alerts', 'crew_id'],
  ['visa_expiry_flags', 'crew_id'],
  ['seaport_arrivals', 'crew_id'],
  ['seaport_departures', 'crew_id'],
]

class BadRequest extends Error {}

/** Validate a body down to the EDITABLE columns. Missing keys are left out; '' clears. */
function cleanFields(body: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const [key, kind] of Object.entries(EDITABLE)) {
    if (!(key in body)) continue
    const raw = body[key]
    if (raw !== null && typeof raw !== 'string') throw new BadRequest(`${key} must be text`)
    const v = (raw ?? '').trim()
    if (!v) { out[key] = null; continue }
    if (v.length > 120) throw new BadRequest(`${key} is too long`)
    if (kind === 'date' && !DATE_RE.test(v)) throw new BadRequest(`${key} must be a date`)
    if (kind === 'email' && !EMAIL_RE.test(v)) throw new BadRequest('That email address does not look right')
    out[key] = v
  }
  return out
}

/** The passport half of a body: { passport_number, passport_expiry_date }, when sent. */
function cleanPassport(body: Record<string, unknown>): { number?: string | null; expiry?: string | null } {
  const out: { number?: string | null; expiry?: string | null } = {}
  if ('passport_number' in body) {
    const v = typeof body.passport_number === 'string' ? body.passport_number.trim().toUpperCase() : ''
    if (v.length > 30) throw new BadRequest('Passport number is too long')
    out.number = v || null
  }
  if ('passport_expiry_date' in body) {
    const v = typeof body.passport_expiry_date === 'string' ? body.passport_expiry_date.trim() : ''
    if (v && !DATE_RE.test(v)) throw new BadRequest('Passport expiry must be a date')
    out.expiry = v || null
  }
  return out
}

/** The primary (else first) passport for each crew member. */
async function primaryPassports(sb: Sb, crewIds: string[]) {
  const byCrew = new Map<string, { id: string; passport_number: string | null; expiry_date: string | null; double_checked: boolean | null }>()
  if (!crewIds.length) return byCrew
  const { data } = await sb
    .from('crew_passports')
    .select('id, crew_id, passport_number, expiry_date, double_checked, is_primary, created_at')
    .in('crew_id', crewIds)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
  for (const p of (data ?? []) as any[]) if (!byCrew.has(p.crew_id)) byCrew.set(p.crew_id, p)
  return byCrew
}

/**
 * Write the passport fields to the crew member's primary passport (creating one if
 * they have none) and to the crew_members copy the portal's alerts read. A passport
 * JLS has verified (double_checked) is not changed from the portal.
 */
async function savePassport(sb: Sb, crewId: string, passport: { number?: string | null; expiry?: string | null }) {
  if (!('number' in passport) && !('expiry' in passport)) return
  const existing = (await primaryPassports(sb, [crewId])).get(crewId)
  if (existing?.double_checked) {
    const sameNumber = !('number' in passport) || (passport.number ?? null) === (existing.passport_number ?? null)
    const sameExpiry = !('expiry' in passport) || (passport.expiry ?? null) === (existing.expiry_date ?? null)
    if (sameNumber && sameExpiry) return
    throw new BadRequest('This passport has been verified by JLS — send us a request to change it.')
  }

  const row: Record<string, string | null> = {}
  if ('number' in passport) row.passport_number = passport.number ?? null
  if ('expiry' in passport) row.expiry_date = passport.expiry ?? null
  if (existing) {
    const { error } = await sb.from('crew_passports').update(row).eq('id', existing.id).eq('crew_id', crewId)
    if (error) throw error
  } else if (row.passport_number || row.expiry_date) {
    const { error } = await sb.from('crew_passports').insert({ ...row, crew_id: crewId, is_primary: true })
    if (error) throw error
  }

  const mirror: Record<string, string | null> = {}
  if ('number' in passport) mirror.passport_number = passport.number ?? null
  if ('expiry' in passport) mirror.passport_expiry_date = passport.expiry ?? null
  const { error } = await sb.from('crew_members').update(mirror).eq('id', crewId)
  if (error) throw error
}

async function audit(request: Request, yacht: PortalYacht, kind: 'create' | 'edit' | 'delete', crewId: string, detail: string) {
  await logAuditEvent({
    event_type: 'DATA',
    module: 'portal',
    // A portal login has no staff profile for audit_log.user_id to reference.
    actor_id: yacht.preview ? yacht.userId : null,
    actor_email: yacht.email || '(client portal)',
    actor_role: yacht.position ?? 'captain',
    target_type: 'crew_members',
    target_id: crewId,
    target_label: `${yacht.vesselName} crew`,
    detail: `Client portal (${yacht.vesselName}) — ${kind}: ${detail}`,
    ip_address: request.headers.get('cf-connecting-ip'),
    user_agent: request.headers.get('user-agent'),
    result: 'success',
  })
}

const nameOf = (r: { first_name?: string | null; last_name?: string | null; full_name?: string | null }) =>
  r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || 'crew member'

async function listCrew(sb: Sb, yacht: PortalYacht): Promise<Response> {
  const { data, error } = await sb
    .from('crew_members')
    .select(CREW_COLUMNS)
    .eq('yacht_id', yacht.yachtId)
    .order('last_name')
  if (error) throw error
  const rows = (data ?? []) as any[]
  const passports = await primaryPassports(sb, rows.map((r) => r.id))
  return json({
    canManage: canManageCrew(yacht.position) && !yacht.preview,
    crew: rows.map((r) => {
      const p = passports.get(r.id)
      return {
        ...r,
        passport_number: p?.passport_number ?? r.passport_number ?? null,
        passport_expiry_date: p?.expiry_date ?? r.passport_expiry_date ?? null,
        passport_verified: !!p?.double_checked,
      }
    }),
  })
}

/** The crew member, if they belong to this vessel. */
async function ownCrew(sb: Sb, yacht: PortalYacht, id: string | null) {
  if (!id) return null
  const { data } = await sb
    .from('crew_members')
    .select('id, first_name, last_name, full_name, sharepoint_item_id')
    .eq('id', id)
    .eq('yacht_id', yacht.yachtId)
    .maybeSingle()
  return data as any
}

/**
 * Remove a crew member from the vessel. Someone with any history with JLS — a
 * visa, documents, sign-on records, a verified passport, or a row that came from
 * the SharePoint crew list — is signed off (status `off_signed`), which keeps every
 * record and can be undone. Only a record with none of that (a duplicate, or one
 * added by mistake) is actually deleted.
 */
async function removeCrew(sb: Sb, yacht: PortalYacht, crew: any): Promise<'signed_off' | 'deleted'> {
  const counts = await Promise.all(HISTORY.map(([table, column]) =>
    sb.from(table).select('*', { count: 'exact', head: true }).eq(column, crew.id).then((r) => {
      // A table we can't count is treated as history — never delete on a guess.
      if (r.error) { console.error(`[portal-crew] history check on ${table} failed:`, r.error.message); return 1 }
      return r.count ?? 0
    })))
  const { count: verifiedPassports } = await sb
    .from('crew_passports')
    .select('id', { count: 'exact', head: true })
    .eq('crew_id', crew.id)
    .or('double_checked.eq.true,document_url.not.is.null')
  const hasHistory = !!crew.sharepoint_item_id || (verifiedPassports ?? 0) > 0 || counts.some((n) => n > 0)

  if (hasHistory) {
    const { error } = await sb.from('crew_members').update({ status: 'off_signed' }).eq('id', crew.id).eq('yacht_id', yacht.yachtId)
    if (error) throw error
    return 'signed_off'
  }
  const { error } = await sb.from('crew_members').delete().eq('id', crew.id).eq('yacht_id', yacht.yachtId)
  if (error) throw error
  return 'deleted'
}

export async function portalCrewHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  const sb = admin()

  try {
    if (request.method === 'GET') return await listCrew(sb, yacht)

    if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)
    if (!canManageCrew(yacht.position)) return json({ error: 'Your position can view the crew list but not change it.' }, 403)

    const id = new URL(request.url).searchParams.get('id')

    if (request.method === 'DELETE') {
      const crew = await ownCrew(sb, yacht, id)
      if (!crew) return json({ error: 'Crew member not found' }, 404)
      const outcome = await removeCrew(sb, yacht, crew)
      await audit(request, yacht, 'delete', crew.id, `${nameOf(crew)} ${outcome === 'deleted' ? 'deleted' : 'signed off'}`)
      return json({ ok: true, outcome })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') return json({ error: 'Expected a JSON body' }, 400)
    const fields = cleanFields(body)
    const passport = cleanPassport(body)

    if (request.method === 'POST') {
      if (!fields.first_name || !fields.last_name) return json({ error: 'First and last name are required' }, 400)
      const { data, error } = await sb
        .from('crew_members')
        .insert({ ...fields, yacht_id: yacht.yachtId, status: 'active' })
        .select('id')
        .single()
      if (error || !data) throw error ?? new Error('Could not add the crew member')
      await savePassport(sb, data.id, passport)
      await audit(request, yacht, 'create', data.id, `added ${nameOf(fields)}`)
      return json({ ok: true, id: data.id }, 201)
    }

    if (request.method === 'PATCH') {
      const crew = await ownCrew(sb, yacht, id)
      if (!crew) return json({ error: 'Crew member not found' }, 404)
      if ('first_name' in fields && !fields.first_name) return json({ error: 'First name is required' }, 400)
      if ('last_name' in fields && !fields.last_name) return json({ error: 'Last name is required' }, 400)
      const update: Record<string, string | null> = { ...fields }
      if ('status' in body) {
        if (typeof body.status !== 'string' || !PORTAL_STATUSES.has(body.status)) return json({ error: 'Unknown status' }, 400)
        update.status = body.status
      }
      if (Object.keys(update).length) {
        const { error } = await sb.from('crew_members').update(update).eq('id', crew.id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
      }
      await savePassport(sb, crew.id, passport)
      const changed = [...Object.keys(update), ...Object.keys(passport).map((k) => `passport ${k}`)]
      await audit(request, yacht, 'edit', crew.id, `${nameOf(crew)} — ${changed.join(', ') || 'no changes'}`)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-crew]', e)
    return json({ error: e?.message ?? 'Could not save the crew change' }, 500)
  }
}
