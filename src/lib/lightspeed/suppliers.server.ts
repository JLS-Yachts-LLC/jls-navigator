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

  const suppliers: any[] = []
  let after: string | undefined
  // Version-cursor pagination: each page returns the max version to page past.
  for (let guard = 0; guard < 200; guard++) {
    const url = after ? `${base}?after=${encodeURIComponent(after)}&page_size=200` : `${base}?page_size=200`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const detail = `Lightspeed suppliers ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`
      await logAutomationRun({ ...AUTO, trigger_type: 'schedule', status: 'error', detail })
      throw new Error(detail)
    }
    const j: any = await res.json()
    const page: any[] = j?.data ?? []
    suppliers.push(...page)
    const maxVer = j?.version?.max
    if (!page.length || maxVer == null) break
    after = String(maxVer)
    if (page.length < 200) break
  }

  let upserted = 0
  for (const s of suppliers) {
    const row = {
      lightspeed_id: String(s.id),
      name: String(s.name ?? '').trim() || `Supplier ${s.id}`,
      notes: s.description ? String(s.description) : null,
      status: s.deleted_at ? 'inactive' : 'active',
      updated_at: new Date().toISOString(),
    }
    const { error } = await sb.from('waypoint_suppliers').upsert(row, { onConflict: 'lightspeed_id' })
    if (!error) upserted++
  }

  const result: SupplierSyncResult = { fetched: suppliers.length, upserted }
  await logAutomationRun({ ...AUTO, trigger_type: trigger === 'manual' ? 'manual' : 'schedule', status: 'success', detail: `fetched ${result.fetched}, upserted ${result.upserted}` })
  return result
}
