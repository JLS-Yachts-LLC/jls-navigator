/**
 * ShipSync ↔ SharePoint sync (outbound push + one-time import).
 *
 * Supabase is the source of truth. On a cron we push changed packages back to the
 * legacy SharePoint "Packages" list so existing trackers/flows keep working —
 * the same two-way pattern as the other SharePoint syncs (yachts, permits, etc.).
 * Column internal names come from the exported Power Automate flows; a wrong name
 * surfaces as a per-row error in the Integrations panel (never silent corruption),
 * and a dry run is available there to preview the mapping.
 */
import {
  getSpConfig, getGraphToken, resolveSpSite, getSpListId,
} from '@/lib/sharepoint-sync.server'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import type { ShipSyncPackage, PackageStatus } from '@/lib/shipsync/model'

const db = () => supabaseAdmin as any
const env = (k: string) => (process.env as any)[k] as string | undefined

const SITE_PATH = () => env('SHIPSYNC_SP_SITE_PATH') ?? '/sites/JLS-DeliveriesApp'
const LIST_PACKAGES = () => env('SHIPSYNC_SP_PACKAGES_LIST') ?? 'Packages'

// Our status → the SharePoint "Status" choice text (legacy vocabulary).
const SP_STATUS: Record<PackageStatus, string> = {
  in_office: 'In Office', in_storage: 'In Storage', assigned: 'Assigned',
  out_for_delivery: 'Out for Delivery', delivered: 'Delivered',
  to_collect: 'Client to Collect', collected: 'Client Collected', refused: 'Client Refused',
}

/** Map a ShipSync package to SharePoint Packages list fields (internal names). */
function toSpFields(p: ShipSyncPackage): Record<string, unknown> {
  return {
    Barcode: p.barcode ?? '',
    Location: p.boat_name ?? '',
    PackageOwner: p.package_owner ?? '',
    Courier: p.courier ?? '',
    NumberofPackages: p.num_packages ?? 1,
    Status: SP_STATUS[p.status] ?? 'In Office',
    DeliveryNote: p.delivery_note_id ? undefined : '0000', // resolved below to the note number
    WarehouseZone: p.warehouse_zone ?? '',
    ScannedDate: p.received_at ?? null,
  }
}

async function graph(token: string, url: string, init?: RequestInit) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  return res.status === 204 ? null : res.json()
}

async function recordState(pushed: number, errors: number, detail: string) {
  await db().from('shipsync_sync_state').update({
    last_push_at: new Date().toISOString(), pushed, errors, detail, updated_at: new Date().toISOString(),
  }).eq('id', 1)
}

export interface PushResult { ok: boolean; pushed: number; errors: number; detail?: string }

/**
 * Push packages changed since their last sync to SharePoint. dryRun resolves the
 * site/list and maps rows but writes nothing (for previewing the mapping).
 */
export async function pushShipSyncToSharePoint(opts: { dryRun?: boolean; limit?: number } = {}): Promise<PushResult> {
  const cfg = await getSpConfig()
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, SITE_PATH())
  const listId = await getSpListId(token, siteId, LIST_PACKAGES())

  // Rows needing push: never synced, or changed since last sync.
  const { data: rows } = await db().from('shipsync_packages')
    .select('*')
    .or('sp_synced_at.is.null,updated_at.gt.sp_synced_at')
    .order('updated_at', { ascending: true })
    .limit(opts.limit ?? 200)
  const list = (rows ?? []) as ShipSyncPackage[]

  // Resolve delivery-note numbers for the batch (so DeliveryNote field is the number).
  const noteIds = Array.from(new Set(list.map((p) => p.delivery_note_id).filter(Boolean))) as string[]
  const noteNum = new Map<string, string>()
  if (noteIds.length) {
    const { data: notes } = await db().from('shipsync_delivery_notes').select('id, number').in('id', noteIds)
    for (const n of notes ?? []) noteNum.set(n.id, n.number)
  }

  let pushed = 0, errors = 0
  const samples: string[] = []
  for (const p of list) {
    const fields = toSpFields(p)
    fields.DeliveryNote = p.delivery_note_id ? (noteNum.get(p.delivery_note_id) ?? '0000') : '0000'
    if (p.driver_id) {
      const { data: d } = await db().from('shipsync_drivers').select('name').eq('id', p.driver_id).maybeSingle()
      if (d) (fields as any).Driver = d.name
    }
    if (opts.dryRun) { pushed++; if (samples.length < 3) samples.push(`${p.barcode}: ${JSON.stringify(fields)}`); continue }
    try {
      const spId = (p.extra as any)?.sp_item_id as string | undefined
      if (spId) {
        await graph(token, `/sites/${siteId}/lists/${listId}/items/${spId}/fields`, { method: 'PATCH', body: JSON.stringify(fields) })
      } else {
        const created = await graph(token, `/sites/${siteId}/lists/${listId}/items`, { method: 'POST', body: JSON.stringify({ fields }) })
        await db().from('shipsync_packages').update({ extra: { ...(p.extra ?? {}), sp_item_id: created?.id } }).eq('id', p.id)
      }
      await db().from('shipsync_packages').update({ sp_synced_at: new Date().toISOString() }).eq('id', p.id)
      pushed++
    } catch (e: any) {
      errors++
      if (samples.length < 3) samples.push(`${p.barcode}: ${e?.message ?? 'error'}`)
    }
  }
  const detail = opts.dryRun ? `Dry run — would push ${pushed}. ${samples.join(' | ')}` : `Pushed ${pushed}, ${errors} error(s). ${samples.join(' | ')}`
  if (!opts.dryRun) await recordState(pushed, errors, detail)
  return { ok: true, pushed, errors, detail }
}

/** One-time import of the SharePoint Packages list into Supabase (manual). */
export async function importShipSyncFromSharePoint(opts: { limit?: number } = {}): Promise<{ ok: boolean; imported: number }> {
  const cfg = await getSpConfig()
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, SITE_PATH())
  const listId = await getSpListId(token, siteId, LIST_PACKAGES())
  const data = await graph(token, `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=${opts.limit ?? 500}`)
  const items = (data?.value ?? []) as any[]
  const rev: Record<string, PackageStatus> = Object.fromEntries(Object.entries(SP_STATUS).map(([k, v]) => [v, k as PackageStatus]))
  let imported = 0
  for (const it of items) {
    const f = it.fields ?? {}
    const row = {
      barcode: f.Barcode ?? null,
      boat_name: f.Location ?? null,
      package_owner: f.PackageOwner ?? null,
      courier: f.Courier ?? null,
      num_packages: Number(f.NumberofPackages ?? 1),
      status: (rev[f.Status] ?? 'in_office') as PackageStatus,
      warehouse_zone: f.WarehouseZone ?? null,
      received_at: f.ScannedDate ?? null,
      extra: { sp_item_id: it.id, imported_at: new Date().toISOString() },
      sp_synced_at: new Date().toISOString(),
    }
    // Upsert by barcode where possible, else insert.
    if (row.barcode) {
      const { data: existing } = await db().from('shipsync_packages').select('id').eq('barcode', row.barcode).maybeSingle()
      if (existing) { await db().from('shipsync_packages').update(row).eq('id', existing.id); imported++; continue }
    }
    await db().from('shipsync_packages').insert([row]); imported++
  }
  return { ok: true, imported }
}
