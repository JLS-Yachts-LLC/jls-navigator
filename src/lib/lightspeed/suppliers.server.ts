/**
 * Lightspeed (Vend) → Waypoint Suppliers sync. No n8n.
 *
 * Pulls the full supplier list from the Lightspeed X-Series 2.0 API and upserts
 * it into waypoint_suppliers (keyed on lightspeed_id). Runs on a daily cron
 * (registered as the 'ls-supplier-sync' automation, category Lightspeed) and
 * can be triggered on demand from the Suppliers screen's "Sync from Lightspeed"
 * button (POST /api/lightspeed/suppliers-sync).
 */
import { createClient } from '@supabase/supabase-js'
import { logAutomationRun } from '@/lib/automations.server'
import { lsConfig } from './sync.server'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

const AUTO = { key: 'ls-supplier-sync', name: 'Lightspeed → Waypoint Suppliers', source: 'worker-cron', category: 'Lightspeed' } as const

export type SupplierSyncResult = { fetched: number; upserted: number; note?: string }

/** Pull every supplier from Lightspeed and upsert into waypoint_suppliers. */
export async function syncLightspeedSuppliers(trigger: 'cron' | 'manual' = 'cron'): Promise<SupplierSyncResult> {
  const cfg = await lsConfig()
  if (!cfg.apiToken) {
    return { fetched: 0, upserted: 0, note: 'Lightspeed API token not set (Settings → Integrations → Lightspeed)' }
  }
  await logAutomationRun({ ...AUTO, trigger_type: trigger === 'manual' ? 'manual' : 'schedule', status: 'hit' })

  const sb = admin() as any
  const base = `https://${cfg.domainPrefix}.retail.lightspeed.app/api/2.0/suppliers`
  const headers = { accept: 'application/json', Authorization: `Bearer ${cfg.apiToken}` }

  // Fetch with a hard per-request timeout so a stalled Lightspeed call can never
  // hang the whole sync (which would leave the UI spinner stuck).
  const fetchPage = async (url: string): Promise<Response> => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20_000)
    try { return await fetch(url, { headers, signal: ctrl.signal }) }
    finally { clearTimeout(t) }
  }

  const suppliers: any[] = []
  let after: string | undefined
  // Version-cursor pagination: page past `version.max` until a short/empty page.
  // Guarded against a non-advancing cursor (would otherwise loop forever).
  for (let guard = 0; guard < 100; guard++) {
    const url = after ? `${base}?after=${encodeURIComponent(after)}&page_size=250` : `${base}?page_size=250`
    const res = await fetchPage(url)
    if (!res.ok) {
      const detail = `Lightspeed suppliers ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`
      await logAutomationRun({ ...AUTO, trigger_type: 'schedule', status: 'error', detail })
      throw new Error(detail)
    }
    const j: any = await res.json()
    const page: any[] = j?.data ?? []
    suppliers.push(...page)
    const maxVer = j?.version?.max != null ? String(j.version.max) : undefined
    if (!page.length || maxVer == null || maxVer === after) break // stop on empty page or stalled cursor
    after = maxVer
    if (page.length < 250) break
  }

  // Batch the upsert (chunks of 500) — a single DB round-trip per chunk instead
  // of one subrequest per supplier (that was overrunning the Worker's budget).
  const now = new Date().toISOString()
  const seen = new Set<string>()
  const rows = suppliers
    .filter((s) => s?.id != null && !seen.has(String(s.id)) && seen.add(String(s.id)))
    .map((s) => ({
      lightspeed_id: String(s.id),
      name: String(s.name ?? '').trim() || `Supplier ${s.id}`,
      notes: s.description ? String(s.description) : null,
      status: s.deleted_at ? 'inactive' : 'active',
      updated_at: now,
    }))

  let upserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await sb.from('waypoint_suppliers').upsert(chunk, { onConflict: 'lightspeed_id' })
    if (!error) upserted += chunk.length
  }

  const result: SupplierSyncResult = { fetched: suppliers.length, upserted }
  await logAutomationRun({ ...AUTO, trigger_type: trigger === 'manual' ? 'manual' : 'schedule', status: 'success', detail: `fetched ${result.fetched}, upserted ${result.upserted}` })
  return result
}
