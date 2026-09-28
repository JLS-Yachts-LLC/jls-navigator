/**
 * Yacht IT Network ⇄ New Horizon-IT — the two-way sync, driven from this side.
 *
 * The network register was built on New Horizon's service desk, and JLS's
 * vessels live there as well as here. Every run pulls New Horizon's changes,
 * applies them, then sends ours back, so a vessel reads the same on both desks.
 *
 *   1. GET  {remote}/api/public/yacht-it/sync?since=…   their changes
 *   2. yacht_it_sync_apply(…)                            applied here
 *   3. yacht_it_sync_changes(…)                          ours
 *   4. POST {remote}/api/public/yacht-it/sync            applied there
 *
 * Conflicts are last-write-wins per row on updated_at, and a delete always
 * wins. Per row, not per field: two people editing different fields of the same
 * system on the two desks inside one sync window will find the later edit took
 * the whole row. For a register edited now and then, that is the right trade
 * against the machinery a field-level merge would need.
 *
 * Runs every five minutes from the Worker cron, plus on demand (the "Sync now"
 * button). Every few hours a run is a full pass rather than incremental: an
 * incremental run can leave a gap — a parent row skipped once, then never sent
 * again because it hasn't changed — and a full pass heals it. The row counts
 * involved are small enough that this costs nothing.
 *
 * The shared secret is generated in our database and never leaves it in the
 * clear; New Horizon holds only its SHA-256. YACHT_IT_SYNC_SECRET / _URL on the
 * Worker override the stored values, for rotating without a migration.
 */
import { createClient } from '@supabase/supabase-js'

/** Header New Horizon expects the partner secret in. */
const KEY_HEADER = 'x-yacht-it-sync-key'

/**
 * Re-read this far behind the last watermark. A write that committed late, with
 * an earlier timestamp, would otherwise fall between two runs; re-reading is
 * harmless because applying the same row twice is a no-op.
 */
const OVERLAP_MS = 10 * 60_000

/** How often an incremental run is promoted to a full pass. */
const FULL_EVERY_MS = 6 * 3_600_000

/** Per request. The cron shares a Worker invocation with other jobs. */
const REQUEST_TIMEOUT_MS = 25_000

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

interface Remote {
  base: string
  secret: string
}

/** Where New Horizon is and how to prove it's us, or null when switched off. */
async function remote(sb: any): Promise<Remote | null> {
  const { data: cfg } = await sb
    .from('yacht_it_sync_config')
    .select('remote_url, shared_secret, enabled')
    .eq('id', 1)
    .maybeSingle()
  if (!cfg?.enabled) return null
  const secret = (process.env.YACHT_IT_SYNC_SECRET as string | undefined) || cfg.shared_secret
  const base = ((process.env.YACHT_IT_SYNC_URL as string | undefined) || cfg.remote_url || '').replace(/\/$/, '')
  if (!secret || !base) return null
  return { base, secret }
}

async function call(r: Remote, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${r.base}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), [KEY_HEADER]: r.secret },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`New Horizon ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`New Horizon ${path} returned something that isn't JSON`)
  }
}

const back = (iso: string | null | undefined) =>
  iso ? new Date(Date.parse(iso) - OVERLAP_MS).toISOString() : null

export interface YachtItSyncResult {
  ok: boolean
  full: boolean
  /** What their change feed did here. */
  pulled?: unknown
  /** What ours did there. */
  pushed?: unknown
  error?: string
  durationMs: number
}

/**
 * Run one sync. Returns null when the sync is switched off or unconfigured.
 * Never throws: the outcome is recorded on yacht_it_sync_state, which is what
 * the register's status line reads.
 */
export async function runYachtItSync(opts: { full?: boolean } = {}): Promise<YachtItSyncResult | null> {
  const t0 = Date.now()
  const sb = admin() as any
  const r = await remote(sb)
  if (!r) return null

  const { data: state } = await sb.from('yacht_it_sync_state').select('*').eq('id', 1).maybeSingle()
  const full =
    !!opts.full ||
    !state?.last_full_at ||
    Date.now() - Date.parse(state.last_full_at) > FULL_EVERY_MS
  const startedAt = new Date().toISOString()
  await sb.from('yacht_it_sync_state').update({ last_run_at: startedAt }).eq('id', 1)

  try {
    // 1–2. Theirs, applied here.
    const since = full ? null : back(state?.last_pull_at)
    const theirs = await call(r, `/api/public/yacht-it/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`)
    const { data: pulled, error: applyErr } = await sb.rpc('yacht_it_sync_apply', { p_payload: theirs })
    if (applyErr) throw new Error(`Applying New Horizon's changes: ${applyErr.message}`)

    // 3–4. Ours, applied there. Read after applying theirs, so what we send
    // reflects any conflict we just resolved in their favour.
    const pushSince = full ? null : back(state?.last_push_at)
    const { data: ours, error: feedErr } = await sb.rpc('yacht_it_sync_changes', { p_since: pushSince })
    if (feedErr) throw new Error(`Reading our changes: ${feedErr.message}`)
    const pushed = await call(r, '/api/public/yacht-it/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ours),
    })

    // Watermarks come from each side's own clock, never ours for theirs.
    await sb.from('yacht_it_sync_state').update({
      last_pull_at: theirs?.now ?? state?.last_pull_at ?? null,
      last_push_at: ours?.now ?? state?.last_push_at ?? null,
      last_full_at: full ? startedAt : state?.last_full_at ?? null,
      last_ok_at: new Date().toISOString(),
      last_error: null,
      last_result: { full, pulled, pushed },
    }).eq('id', 1)

    return { ok: true, full, pulled, pushed, durationMs: Date.now() - t0 }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[yacht-it-sync]', error)
    // Watermarks are left where they were, so the next run retries this window.
    await sb.from('yacht_it_sync_state').update({
      last_error: error.slice(0, 500),
      last_result: { full, error },
    }).eq('id', 1).then(() => {}, () => {})
    return { ok: false, full, error, durationMs: Date.now() - t0 }
  }
}

/**
 * Datto RMM devices for the register, read live from New Horizon — which owns
 * the Datto account — and limited there to JLS's own Datto sites.
 */
export async function fetchPartnerDattoDevices(): Promise<{ devices: unknown[] } | { error: string }> {
  const sb = admin() as any
  const r = await remote(sb)
  if (!r) return { error: 'The New Horizon link is switched off' }
  try {
    const out = await call(r, '/api/public/yacht-it/datto')
    return { devices: Array.isArray(out?.devices) ? out.devices : [] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
