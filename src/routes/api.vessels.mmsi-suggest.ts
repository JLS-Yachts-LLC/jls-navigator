/**
 * GET /api/vessels/mmsi-suggest?q=<vessel name> — suggest MMSI/IMO candidates for
 * a yacht via MyShipTracking's vessel-search API (1 credit per search). Used by
 * the Live Tracking "untracked vessels" fixer; the operator approves a candidate
 * before anything is written. Bearer-gated so credits can't be burned anonymously.
 */
import { createClient } from '@supabase/supabase-js'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function mmsiSuggestHandler(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: { user } } = await sb.auth.getUser(auth.slice(7))
  if (!user) return json({ ok: false, error: 'Unauthorized' }, 401)

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (q.length < 3) return json({ ok: false, error: 'Search needs at least 3 characters' }, 400)
  const key = process.env.MYSHIPTRACKING_API_KEY as string | undefined
  if (!key) return json({ ok: false, error: 'MyShipTracking is not configured' }, 500)

  const res = await fetch(`https://api.myshiptracking.com/api/v2/vessel/search?name=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  const j: any = await res.json().catch(() => null)
  if (!res.ok || j?.status === 'error') return json({ ok: false, error: j?.message ?? `Search failed (${res.status})` }, 502)

  const candidates = (j?.data ?? []).map((d: any) => ({
    name: d.vessel_name ?? '',
    mmsi: d.mmsi != null ? String(d.mmsi) : null,
    imo: d.imo != null && Number(d.imo) > 0 ? String(d.imo) : null,
    type: d.vessel_type ?? null,
    flag: d.flag ?? null,
    area: d.area ?? null,
  }))
  return json({ ok: true, candidates })
}
