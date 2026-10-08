/**
 * Client-portal On board — crew rota and crew certificates.
 *
 *   POST   /api/portal/rota?kind=away              → time away: leave, training, travel, sick
 *   PATCH  /api/portal/rota?kind=away&id=          → change it
 *   DELETE /api/portal/rota?kind=away&id=          → remove it
 *   POST   /api/portal/rota?kind=away&id=&action=request
 *                                                  → ask JLS to arrange the crew change for it
 *                                                    (raises a Visa & Immigration request)
 *   POST   /api/portal/rota?kind=cert              → add a crew certificate
 *   PATCH  /api/portal/rota?kind=cert&id=          → change one
 *   DELETE /api/portal/rota?kind=cert&id=          → remove one
 *
 * Writes need the Management module's Crew rota feature and a position that
 * manages crew (canManageCrew — Chief Stewardess / Chef view only). Every crew
 * member named must be on the caller's vessel. Certificates live in the staff
 * Training area's training_certifications, so JLS sees the same records; their
 * status (valid / expiring / expired) is worked out here the way that screen does.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { canManageCrew, hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { AWAY_KINDS, CERT_TYPES, CERT_WARN_DAYS, awayLabel, certTypeLabel } from '@/lib/portal/crew-rota'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}
type Sb = ReturnType<typeof admin>

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class BadRequest extends Error {}

const text = (v: unknown, max: number, label: string): string | null => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw new BadRequest(`${label} must be text`)
  const t = v.trim()
  if (t.length > max) throw new BadRequest(`${label} is too long`)
  return t || null
}
const date = (v: unknown, label: string, required = false): string | null => {
  if (v == null || v === '') { if (required) throw new BadRequest(`${label} is required`); return null }
  if (typeof v !== 'string' || !DATE_RE.test(v)) throw new BadRequest(`${label} must be a date`)
  return v
}
const nameOf = (c: any) => c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Crew member'

/** The crew member, if they're on this vessel. */
async function ownCrew(sb: Sb, yacht: PortalYacht, id: unknown) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new BadRequest('Choose a crew member')
  const { data } = await sb.from('crew_members').select('id, full_name, first_name, last_name, rank')
    .eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
  if (!data) throw new BadRequest('That crew member is not on this vessel')
  return data as any
}

async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Crew'
}

async function audit(request: Request, yacht: PortalYacht, table: string, verb: string, id: string, label: string) {
  await logAuditEvent({
    event_type: 'DATA', module: 'portal',
    actor_id: yacht.preview ? yacht.userId : null,
    actor_email: yacht.email || '(client portal)',
    actor_role: yacht.position ?? 'captain',
    target_type: table, target_id: id,
    target_label: `${yacht.vesselName} · ${label}`,
    detail: `Client portal (${yacht.vesselName}) — ${verb}: ${label}`,
    ip_address: request.headers.get('cf-connecting-ip'),
    user_agent: request.headers.get('user-agent'),
    result: 'success',
  })
}

/** Same rule as the staff Training screen: expired, within 90 days, or valid. */
function certStatus(expiry: string | null): 'valid' | 'expiring' | 'expired' {
  if (!expiry) return 'valid'
  const days = Math.ceil((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86400000)
  return days < 0 ? 'expired' : days <= CERT_WARN_DAYS ? 'expiring' : 'valid'
}

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

export async function portalRotaHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled('rota', modules)) return json({ error: "The crew rota isn't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has('rota')) return json({ error: "Your position doesn't include the crew rota." }, 403)
  if (!canManageCrew(yacht.position)) return json({ error: 'The Captain or officers keep the rota and certificates.' }, 403)

  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  const id = url.searchParams.get('id')
  const action = url.searchParams.get('action')
  const sb = admin()

  try {
    const body = request.method === 'DELETE' ? {} : ((await request.json().catch(() => null)) as Record<string, unknown> | null)
    if (!body) return json({ error: 'Expected a JSON body' }, 400)

    // ── Time away ──
    if (kind === 'away') {
      const existing = id ? (await sb.from('onboard_crew_rotation').select('*').eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()).data as any : null
      if (id && !existing) return json({ error: 'Not found' }, 404)

      if (request.method === 'POST' && action === 'request') {
        if (!existing) return json({ error: 'Not found' }, 404)
        if (existing.jls_request_id) return json({ error: 'JLS already has a request for this crew change.' }, 400)
        const crew = await ownCrew(sb, yacht, existing.crew_member_id)
        const who = await callerName(sb, yacht)
        const back = addDay(existing.end_date, 1)
        const title = `Crew change: ${nameOf(crew)} — off ${fmt(existing.start_date)}, back ${fmt(back)}`.slice(0, 200)
        const details = [
          `${nameOf(crew)}${crew.rank ? ` (${crew.rank})` : ''} is going on ${awayLabel(existing.kind).toLowerCase()}.`,
          `Signs off: ${fmt(existing.start_date)}`,
          `Back on board: ${fmt(back)}`,
          existing.notes ? `Notes: ${existing.notes}` : null,
          typeof body.message === 'string' && body.message.trim() ? `From ${who}: ${body.message.trim().slice(0, 2000)}` : null,
          'Please arrange the sign-off / sign-on and anything the visa needs. Raised from the crew rota in the Client Portal.',
        ].filter(Boolean).join('\n')
        const { data: req, error } = await sb.from('captain_requests').insert({
          yacht_id: yacht.yachtId, created_by: yacht.userId, category: 'visa_immigration', priority: 'normal', status: 'new',
          title, details, needed_by: existing.start_date,
        }).select('id, reference').single()
        if (error || !req) throw error ?? new Error('Could not raise the request')
        await sb.from('onboard_crew_rotation').update({ jls_request_id: (req as any).id, status: 'confirmed' }).eq('id', existing.id).eq('yacht_id', yacht.yachtId)
        await audit(request, yacht, 'onboard_crew_rotation', 'asked JLS for crew change', existing.id, title)
        return json({ ok: true, requestId: (req as any).id, reference: (req as any).reference }, 201)
      }

      if (request.method === 'DELETE') {
        const { error } = await sb.from('onboard_crew_rotation').delete().eq('id', existing.id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
        await audit(request, yacht, 'onboard_crew_rotation', 'removed time away', existing.id, `${existing.start_date} – ${existing.end_date}`)
        return json({ ok: true })
      }

      const merged = { ...(existing ?? {}), ...body } as Record<string, unknown>
      const crew = await ownCrew(sb, yacht, merged.crew_member_id)
      const start = date(merged.start_date, 'The first day away', true)!
      const end = date(merged.end_date, 'The last day away', true)!
      if (end < start) throw new BadRequest('The last day away is before the first')
      const kindValue = typeof merged.kind === 'string' && AWAY_KINDS.some((k) => k.key === merged.kind) ? merged.kind : 'leave'
      const row = {
        crew_member_id: crew.id, kind: kindValue, start_date: start, end_date: end,
        status: merged.status === 'confirmed' ? 'confirmed' : 'planned',
        notes: text(merged.notes, 2000, 'Notes'),
      }
      // One person can't be away twice over the same days.
      let clash = sb.from('onboard_crew_rotation').select('id, start_date, end_date')
        .eq('yacht_id', yacht.yachtId).eq('crew_member_id', crew.id).lte('start_date', end).gte('end_date', start)
      if (existing) clash = clash.neq('id', existing.id)
      const { data: overlaps } = await clash
      if ((overlaps ?? []).length) {
        const o = (overlaps as any[])[0]
        throw new BadRequest(`${nameOf(crew)} is already away ${fmt(o.start_date)} – ${fmt(o.end_date)}`)
      }
      if (request.method === 'POST') {
        const { data, error } = await sb.from('onboard_crew_rotation')
          .insert({ ...row, yacht_id: yacht.yachtId, created_by_name: await callerName(sb, yacht) }).select('id').single()
        if (error || !data) throw error ?? new Error('Could not save')
        await audit(request, yacht, 'onboard_crew_rotation', 'added time away', (data as any).id, `${nameOf(crew)} ${start} – ${end}`)
        return json({ ok: true, id: (data as any).id }, 201)
      }
      if (request.method === 'PATCH') {
        const { error } = await sb.from('onboard_crew_rotation').update(row).eq('id', existing.id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
        await audit(request, yacht, 'onboard_crew_rotation', 'changed time away', existing.id, `${nameOf(crew)} ${start} – ${end}`)
        return json({ ok: true })
      }
      return json({ error: 'Method not allowed' }, 405)
    }

    // ── Certificates (training_certifications) ──
    if (kind === 'cert') {
      let existing: any = null
      if (id) {
        if (!UUID_RE.test(id)) return json({ error: 'Not found' }, 404)
        const { data } = await sb.from('training_certifications').select('*').eq('id', id).maybeSingle()
        // Only a certificate held by this vessel's crew.
        if (!data || !(data as any).crew_member_id) return json({ error: 'Not found' }, 404)
        await ownCrew(sb, yacht, (data as any).crew_member_id).catch(() => { throw new BadRequest('Not found') })
        existing = data
      }
      if (request.method === 'DELETE') {
        const { error } = await sb.from('training_certifications').delete().eq('id', existing.id)
        if (error) throw error
        await audit(request, yacht, 'training_certifications', 'removed certificate', existing.id, `${existing.crew_name} · ${existing.certificate}`)
        return json({ ok: true })
      }
      const merged = { ...(existing ?? {}), ...body } as Record<string, unknown>
      const crew = await ownCrew(sb, yacht, merged.crew_member_id)
      const type = typeof merged.cert_type === 'string' && CERT_TYPES.some((c) => c.key === merged.cert_type) ? merged.cert_type : 'other'
      const expiry = date(merged.expiry_date, 'The expiry date')
      const row = {
        crew_member_id: crew.id,
        crew_name: nameOf(crew),
        cert_type: type,
        certificate: text(merged.certificate, 160, 'The certificate') ?? certTypeLabel(type),
        issuing_body: text(merged.issuing_body, 160, 'Issued by'),
        issue_date: date(merged.issue_date, 'The issue date'),
        expiry_date: expiry,
        status: certStatus(expiry),
        notes: text(merged.notes, 2000, 'Notes'),
      }
      if (request.method === 'POST') {
        const { data, error } = await sb.from('training_certifications').insert(row).select('id').single()
        if (error || !data) throw error ?? new Error('Could not save')
        await audit(request, yacht, 'training_certifications', 'added certificate', (data as any).id, `${row.crew_name} · ${row.certificate}`)
        return json({ ok: true, id: (data as any).id }, 201)
      }
      if (request.method === 'PATCH') {
        const { error } = await sb.from('training_certifications').update(row).eq('id', existing.id)
        if (error) throw error
        await audit(request, yacht, 'training_certifications', 'changed certificate', existing.id, `${row.crew_name} · ${row.certificate}`)
        return json({ ok: true })
      }
      return json({ error: 'Method not allowed' }, 405)
    }

    return json({ error: 'Unknown request' }, 400)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-rota]', e)
    return json({ error: e?.message ?? 'Could not save' }, 500)
  }
}
