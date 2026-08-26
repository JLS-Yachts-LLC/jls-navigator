/**
 * Yacht Shipments ↔ Monday.com import.
 *
 * One-way, read-only mirror of two Monday boards ("Import" and "Export")
 * into yacht_shipments — Monday is the source of truth, this never writes
 * back. Shares the same account-wide API token as the existing ShipSync
 * Monday sync (integration_settings, integration_name = 'monday'), just
 * against two different board ids stored alongside it:
 *   config.yacht_shipments_import_board_id
 *   config.yacht_shipments_export_board_id
 *
 * Column titles on each board aren't hardcoded — they're discovered at sync
 * time (same as the ShipSync sync), and the complete raw row is stored
 * verbatim in extra.monday so nothing is lost even where the best-effort
 * mapping onto yacht_shipments' own columns misses something.
 */
import { createServerFn } from '@tanstack/react-start'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const db = () => supabaseAdmin as any

const MONDAY_API = 'https://api.monday.com/v2'

interface MondayConfig {
  apiToken: string
  importBoardId: string
  exportBoardId: string
}

async function getMondayConfig(): Promise<MondayConfig> {
  const { data: row } = await db()
    .from('integration_settings')
    .select('config, enabled')
    .eq('integration_name', 'monday')
    .maybeSingle()
  const cfg = row?.config ?? {}
  const apiToken = cfg.api_token
  const importBoardId = cfg.yacht_shipments_import_board_id
  const exportBoardId = cfg.yacht_shipments_export_board_id
  if (!apiToken || !importBoardId || !exportBoardId) {
    throw new Error('Yacht Shipments Monday sync not configured — needs api_token, yacht_shipments_import_board_id, and yacht_shipments_export_board_id in Settings → Integrations → Monday.com.')
  }
  return { apiToken: String(apiToken), importBoardId: String(importBoardId), exportBoardId: String(exportBoardId) }
}

// Same overlap guard as the ShipSync sync — a stale lock older than this is
// treated as a crashed run, not honored forever.
const LOCK_STALE_MINUTES = 15

async function acquireSyncLock(): Promise<boolean> {
  const { data: row } = await db()
    .from('integration_settings')
    .select('config')
    .eq('integration_name', 'monday')
    .maybeSingle()
  const cfg = row?.config ?? {}
  const lockedAt = cfg.yacht_shipments_sync_started_at ? new Date(cfg.yacht_shipments_sync_started_at).getTime() : 0
  const staleCutoff = Date.now() - LOCK_STALE_MINUTES * 60_000
  if (lockedAt > staleCutoff) return false

  await db().from('integration_settings')
    .update({ config: { ...cfg, yacht_shipments_sync_started_at: new Date().toISOString() } })
    .eq('integration_name', 'monday')
  return true
}

async function releaseSyncLock(): Promise<void> {
  const { data: row } = await db()
    .from('integration_settings')
    .select('config')
    .eq('integration_name', 'monday')
    .maybeSingle()
  const cfg = row?.config ?? {}
  delete cfg.yacht_shipments_sync_started_at
  await db().from('integration_settings')
    .update({ config: cfg })
    .eq('integration_name', 'monday')
}

async function mondayGraphQL(token: string, query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2024-01' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Monday API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const json = await res.json() as any
  if (json.errors?.length) throw new Error(`Monday GraphQL: ${json.errors.map((e: any) => e.message).join('; ').slice(0, 200)}`)
  return json.data
}

type MondayColumn = { id: string; title: string; type: string }
type MondayItem = { id: string; name: string; column_values: { id: string; text: string | null }[] }

async function fetchBoard(apiToken: string, boardId: string): Promise<{ columns: MondayColumn[]; items: MondayItem[] }> {
  const colData = await mondayGraphQL(
    apiToken,
    `query ($board: [ID!]) { boards (ids: $board) { columns { id title type } } }`,
    { board: [boardId] },
  )
  const columns: MondayColumn[] = (colData?.boards?.[0]?.columns ?? []).map((c: any) => ({ id: c.id, title: c.title, type: c.type }))

  const items: MondayItem[] = []
  const firstPage = await mondayGraphQL(
    apiToken,
    `query ($board: [ID!]) {
       boards (ids: $board) {
         items_page (limit: 100) { cursor items { id name column_values { id text } } }
       }
     }`,
    { board: [boardId] },
  )
  const firstIp = firstPage?.boards?.[0]?.items_page
  items.push(...(firstIp?.items ?? []))
  let cursor: string | null = firstIp?.cursor ?? null

  for (let page = 0; cursor && page < 100; page++) {
    const next: any = await mondayGraphQL(
      apiToken,
      `query ($cursor: String!) { next_items_page (cursor: $cursor, limit: 100) { cursor items { id name column_values { id text } } } }`,
      { cursor },
    )
    const ip = next?.next_items_page
    items.push(...(ip?.items ?? []))
    cursor = ip?.cursor ?? null
  }
  return { columns, items }
}

function byTitle(item: MondayItem, colById: Map<string, MondayColumn>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const cv of item.column_values) {
    const col = colById.get(cv.id)
    if (col && cv.text != null && cv.text !== '') out[col.title] = cv.text
  }
  return out
}

/** Fuzzy: first non-empty value whose column title CONTAINS any keyword. */
function pick(row: Record<string, string>, ...keywords: string[]): string | null {
  const entries = Object.entries(row)
  for (const kw of keywords) {
    const hit = entries.find(([title]) => title.toLowerCase().includes(kw))
    if (hit && hit[1]) return hit[1]
  }
  return null
}

/** Exact (case-insensitive) title match — for short/ambiguous titles like
 *  "Quota" that would otherwise false-positive-match inside "Quotation". */
function pickExact(row: Record<string, string>, ...titles: string[]): string | null {
  const entries = Object.entries(row)
  for (const t of titles) {
    const hit = entries.find(([title]) => title.trim().toLowerCase() === t);
    if (hit && hit[1]) return hit[1]
  }
  return null
}

function toDate(v: string | null): string | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
function toNumber(v: string | null): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(/[^\d.-]/g, ''))
  return isNaN(n) ? null : n
}

export interface YachtShipmentsSyncResult {
  ok: boolean; synced: number; errors: number; pruned: number; skipped?: boolean; detail: string
}

async function syncOneBoard(
  apiToken: string, boardId: string, direction: 'import' | 'export', now: string,
): Promise<{ synced: number; errors: number; pruned: number; samples: string[] }> {
  const { columns, items } = await fetchBoard(apiToken, boardId)
  const colById = new Map(columns.map((c) => [c.id, c] as const))
  const columnOrder = columns.map((c) => c.title)

  // Existing rows for this board's direction, keyed by Monday item id.
  const existingRows: { id: string; extra: any }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db()
      .from('yacht_shipments')
      .select('id, extra')
      .eq('direction', direction)
      .range(offset, offset + 999)
    if (!page || page.length === 0) break
    existingRows.push(...(page as any[]))
    if (page.length < 1000) break
  }
  const idByMonday = new Map<string, string>()
  for (const r of existingRows) {
    const mid = r.extra?.monday_item_id
    if (mid) idByMonday.set(String(mid), r.id)
  }

  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; itemName: string; record: Record<string, unknown> }[] = []

  for (const item of items) {
    const row = byTitle(item, colById)
    const record: Record<string, unknown> = {
      yacht_name: pick(row, 'yacht name', 'yacht', 'vessel') ?? item.name ?? null,
      loa: pick(row, 'loa', 'length overall', 'length'),
      status: pick(row, 'status') ?? null,
      eta: toDate(pick(row, 'eta', 'estimated arrival')),
      pol: pick(row, 'pol', 'port of loading', 'origin port'),
      arrival_port: pick(row, 'arrival port', 'destination port', 'destination', 'pod', 'port of discharge'),
      customs_option: pick(row, 'customs'),
      vessel_name: pick(row, 'carrier vessel', 'vessel name', 'carrier'),
      remarks: pick(row, 'remarks', 'notes', 'comment'),
      quota: pickExact(row, 'quota'),
      quotation_ref: pick(row, 'quotation/pro forma', 'pro forma', 'quotation ref', 'booking ref'),
      quotations: pickExact(row, 'quotations'),
      quotation_copy_url: pick(row, 'quotation copy', 'quotation url', 'quote copy'),
      formula: pick(row, 'formula'),
      home_marina: pick(row, 'home marina', 'marina'),
      charges: toNumber(pick(row, 'charges', 'amount', 'cost', 'total')),
      direction,
      extra: {
        monday_item_id: item.id,
        monday_item_name: item.name,
        monday_columns: columnOrder,
        monday: row,
        imported_at: now,
      },
    }

    const existingId = idByMonday.get(item.id)
    if (existingId) toUpdate.push({ id: existingId, itemName: item.name, record })
    else toInsert.push(record)
  }

  let synced = 0, errors = 0
  const samples: string[] = []

  if (toInsert.length > 0) {
    const { error } = await db().from('yacht_shipments').insert(toInsert)
    if (!error) {
      synced += toInsert.length
    } else {
      const CONCURRENCY = 25
      for (let i = 0; i < toInsert.length; i += CONCURRENCY) {
        const batch = toInsert.slice(i, i + CONCURRENCY)
        const results = await Promise.all(batch.map((rec) => db().from('yacht_shipments').insert([rec])))
        for (const r of results as any[]) {
          if (r.error) { errors++; if (samples.length < 3) samples.push(`insert: ${r.error.message}`) }
          else synced++
        }
      }
    }
  }

  const UPDATE_CONCURRENCY = 25
  for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
    const batch = toUpdate.slice(i, i + UPDATE_CONCURRENCY)
    const results = await Promise.all(batch.map(({ id, record }) => db().from('yacht_shipments').update(record).eq('id', id)))
    for (let j = 0; j < results.length; j++) {
      const { error } = results[j] as any
      if (error) { errors++; if (samples.length < 3) samples.push(`${batch[j].itemName}: ${error.message}`) }
      else synced++
    }
  }

  // Prune rows this sync itself created whose item no longer exists on the board.
  const currentItemIds = new Set(items.map((i) => i.id))
  let pruned = 0
  for (const [mid, rowId] of idByMonday) {
    if (currentItemIds.has(mid)) continue
    const { error } = await db().from('yacht_shipments').delete().eq('id', rowId)
    if (!error) pruned++
  }

  return { synced, errors, pruned, samples }
}

async function importYachtShipmentsInner(): Promise<YachtShipmentsSyncResult> {
  const cfg = await getMondayConfig()
  const now = new Date().toISOString()
  const imp = await syncOneBoard(cfg.apiToken, cfg.importBoardId, 'import', now)
  const exp = await syncOneBoard(cfg.apiToken, cfg.exportBoardId, 'export', now)

  const synced = imp.synced + exp.synced
  const errors = imp.errors + exp.errors
  const pruned = imp.pruned + exp.pruned
  const samples = [...imp.samples, ...exp.samples]
  const detail = `Imported ${synced} shipment(s) from Monday (${imp.synced} import, ${exp.synced} export), ${errors} error(s), removed ${pruned} stale row(s).${samples.length ? ' ' + samples.join(' | ') : ''}`
  return { ok: errors === 0, synced, errors, pruned, detail }
}

export async function importYachtShipments(): Promise<YachtShipmentsSyncResult> {
  const gotLock = await acquireSyncLock()
  if (!gotLock) {
    return { ok: true, synced: 0, errors: 0, pruned: 0, skipped: true, detail: 'Skipped — another Yacht Shipments Monday sync is already in progress.' }
  }
  try {
    return await importYachtShipmentsInner()
  } finally {
    await releaseSyncLock()
  }
}

/** Server function for the "Sync from Monday" button on the Yacht Shipments board. */
export const syncYachtShipmentsFromMonday = createServerFn({ method: 'POST' })
  .handler(async (): Promise<YachtShipmentsSyncResult> => importYachtShipments())
