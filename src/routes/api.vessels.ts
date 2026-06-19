/**
 * Vessel Selection API
 *
 * GET  /api/vessels/resolve  — resolve vessel context for current user
 * GET  /api/vessels/search   — type-ahead search
 * POST /api/vessels/pin      — pin / unpin a vessel
 * POST /api/vessels/usage    — record vessel usage (back-end only)
 * GET  /api/vessels/audit    — vessel selection audit trail for a record
 */

import { createClient } from '@supabase/supabase-js'
import { getAccessLevel } from '@/lib/leo-access'

// ── Admin client ─────────────────────────────────────────────────────────────

function getAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function authenticate(request: Request): Promise<{ userId: string; email: string } | null> {
  const auth = request.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const sb = getAdmin()
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) return null
  return { userId: data.user.id, email: data.user.email ?? '' }
}

// ── Resolution mode from access level ────────────────────────────────────────

type ResolutionMode = 'auto_locked' | 'dropdown' | 'backoffice'

function modeFromAccess(level: string, hasPrimaryVessel: boolean): ResolutionMode {
  // developer / admin → backoffice (full list + intelligent suggest)
  if (level === 'developer') return 'backoffice'
  // manager → org dropdown
  if (level === 'manager') return 'dropdown'
  // standard user → locked if they have a primary vessel, otherwise dropdown
  return hasPrimaryVessel ? 'auto_locked' : 'dropdown'
}

// ── Vessel shape ──────────────────────────────────────────────────────────────

interface VesselOption {
  id: string
  name: string
  flag?: string | null
  imo?: string | null
}

// ── GET /api/vessels/resolve ──────────────────────────────────────────────────

async function handleResolve(request: Request): Promise<Response> {
  const user = await authenticate(request)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const crewMemberId = url.searchParams.get('crew_member_id')
  const recordType   = url.searchParams.get('record_type') ?? 'unknown'

  const sb    = getAdmin()
  const level = getAccessLevel(user.email)

  // Fetch profile (primary vessel, mode override)
  const { data: profile } = await (sb as any)
    .from('profiles')
    .select('id, primary_vessel_id, vessel_selection_mode')
    .eq('id', user.userId)
    .single()

  const hasPrimaryVessel = !!profile?.primary_vessel_id
  const mode: ResolutionMode = modeFromAccess(level, hasPrimaryVessel)

  // Fetch pinned vessels
  const { data: pinnedRows } = await (sb as any)
    .from('user_pinned_vessels')
    .select('vessel_id, yachts(id, vessel_name, flag, imo_no)')
    .eq('user_id', user.userId)
    .order('pinned_at', { ascending: false })

  const pinnedVessels: VesselOption[] = (pinnedRows ?? []).map((r: any) => ({
    id:   r.yachts?.id   ?? r.vessel_id,
    name: r.yachts?.vessel_name ?? '',
    flag: r.yachts?.flag,
    imo:  r.yachts?.imo_no,
  }))

  const pinnedIds = new Set(pinnedVessels.map((v) => v.id))

  // Fetch recent vessels (last 30 days, distinct by vessel)
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString()
  const { data: recentRows } = await (sb as any)
    .from('vessel_usage_history')
    .select('vessel_id, used_at, yachts(id, vessel_name, flag, imo_no)')
    .eq('user_id', user.userId)
    .gte('used_at', since30)
    .order('used_at', { ascending: false })
    .limit(20)

  const seenRecent = new Set<string>()
  const recentVessels: Array<VesselOption & { last_used: string }> = []
  for (const r of recentRows ?? []) {
    const id = r.yachts?.id ?? r.vessel_id
    if (!seenRecent.has(id)) {
      seenRecent.add(id)
      recentVessels.push({
        id,
        name:      r.yachts?.vessel_name ?? '',
        flag:      r.yachts?.flag,
        imo:       r.yachts?.imo_no,
        last_used: r.used_at,
      })
    }
  }

  // Fetch all accessible vessels
  const { data: allRows } = await (sb as any)
    .from('yachts')
    .select('id, vessel_name, flag, imo_no')
    .eq('archive', false)
    .order('vessel_name')

  const allVessels: VesselOption[] = (allRows ?? []).map((y: any) => ({
    id:   y.id,
    name: y.vessel_name,
    flag: y.flag,
    imo:  y.imo_no,
  }))

  // Locked vessel (auto_locked mode)
  let lockedVessel: VesselOption | null = null
  if (mode === 'auto_locked' && profile?.primary_vessel_id) {
    const found = allVessels.find((v) => v.id === profile.primary_vessel_id)
    if (found) lockedVessel = found
  }

  // Suggested vessel (backoffice mode — use crew member context if provided, else recent)
  let suggestedVessel: (VesselOption & { reason: string }) | null = null
  if (mode === 'backoffice') {
    if (crewMemberId) {
      // Last vessel associated with this crew member
      const { data: crewUsage } = await (sb as any)
        .from('vessel_usage_history')
        .select('vessel_id, yachts(id, vessel_name, flag, imo_no)')
        .eq('record_type', 'crew_add')
        .order('used_at', { ascending: false })
        .limit(1)

      if (crewUsage?.[0]) {
        const y = crewUsage[0].yachts
        suggestedVessel = {
          id: y?.id ?? crewUsage[0].vessel_id,
          name: y?.vessel_name ?? '',
          flag: y?.flag,
          imo:  y?.imo_no,
          reason: 'last_crew_vessel',
        }
      }
    }

    if (!suggestedVessel && recentVessels[0]) {
      suggestedVessel = { ...recentVessels[0], reason: 'last_used' }
    }
  }

  return json({
    mode,
    locked_vessel:    lockedVessel,
    suggested_vessel: suggestedVessel,
    recent_vessels:   recentVessels.filter((v) => !pinnedIds.has(v.id)),
    pinned_vessels:   pinnedVessels,
    all_vessels:      allVessels,
  })
}

// ── GET /api/vessels/search ───────────────────────────────────────────────────

async function handleSearch(request: Request): Promise<Response> {
  const user = await authenticate(request)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const url   = new URL(request.url)
  const q     = (url.searchParams.get('q') ?? '').trim()
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '10'), 50)

  if (!q) return json({ results: [] })

  const sb = getAdmin()
  const { data } = await (sb as any)
    .from('yachts')
    .select('id, vessel_name, flag, imo_no')
    .eq('archive', false)
    .or(`vessel_name.ilike.%${q}%,imo_no.ilike.%${q}%,flag.ilike.%${q}%,radio_call_sign.ilike.%${q}%`)
    .order('vessel_name')
    .limit(limit)

  const results = (data ?? []).map((y: any) => ({
    id:   y.id,
    name: y.vessel_name,
    flag: y.flag,
    imo:  y.imo_no,
  }))

  return json({ results })
}

// ── POST /api/vessels/pin ─────────────────────────────────────────────────────

async function handlePin(request: Request): Promise<Response> {
  const user = await authenticate(request)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: { vessel_id: string; pinned: boolean }
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { vessel_id, pinned } = body
  if (!vessel_id) return json({ error: 'vessel_id required' }, 400)

  const sb = getAdmin()

  if (pinned) {
    await (sb as any)
      .from('user_pinned_vessels')
      .upsert({ user_id: user.userId, vessel_id }, { onConflict: 'user_id,vessel_id' })
  } else {
    await (sb as any)
      .from('user_pinned_vessels')
      .delete()
      .eq('user_id', user.userId)
      .eq('vessel_id', vessel_id)
  }

  return json({ ok: true })
}

// ── POST /api/vessels/usage ───────────────────────────────────────────────────

async function handleUsage(request: Request): Promise<Response> {
  const user = await authenticate(request)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: { vessel_id: string; record_type: string; record_id?: string }
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { vessel_id, record_type, record_id } = body
  if (!vessel_id || !record_type) return json({ error: 'vessel_id and record_type required' }, 400)

  const sb = getAdmin()
  await (sb as any)
    .from('vessel_usage_history')
    .insert({ user_id: user.userId, vessel_id, record_type, record_id: record_id ?? null })

  return json({ ok: true })
}

// ── GET /api/vessels/audit ────────────────────────────────────────────────────

async function handleAudit(request: Request): Promise<Response> {
  const user = await authenticate(request)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const url      = new URL(request.url)
  const recordId = url.searchParams.get('record_id')
  if (!recordId) return json({ error: 'record_id required' }, 400)

  const sb = getAdmin()
  const { data } = await (sb as any)
    .from('vessel_selection_audit')
    .select(`
      id, selection_mode, changed_at,
      selected_vessel_name:selected_vessel(vessel_name),
      previous_vessel_name:previous_vessel(vessel_name),
      changed_by_name:changed_by(display_name)
    `)
    .eq('record_id', recordId)
    .order('changed_at', { ascending: true })

  return json({ entries: data ?? [] })
}

// ── Router ────────────────────────────────────────────────────────────────────

export async function vesselHandler(request: Request): Promise<Response> {
  const url      = new URL(request.url)
  const sub      = url.pathname.replace('/api/vessels', '').replace(/\/$/, '')
  const method   = request.method

  if (sub === '/resolve' && method === 'GET') return handleResolve(request)
  if (sub === '/search'  && method === 'GET') return handleSearch(request)
  if (sub === '/pin'     && method === 'POST') return handlePin(request)
  if (sub === '/usage'   && method === 'POST') return handleUsage(request)
  if (sub === '/audit'   && method === 'GET') return handleAudit(request)

  return json({ error: 'Not found' }, 404)
}

// ── Util ──────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
