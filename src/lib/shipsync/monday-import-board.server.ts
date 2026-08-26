/**
 * ShipSync Import tab ↔ Monday.com import.
 *
 * One-way, read-only mirror of the Monday "Shipment - Import/Transit" board
 * into shipsync_packages (local_import = 'Import') — Monday is the source of
 * truth, this never writes back. A sibling of shipsync/monday.server.ts (which
 * covers the separate "Local Shipments" board into local_import = 'Local'),
 * kept in its own file since the two boards have unrelated column layouts.
 *
 * Unlike the Local sync, this one also mirrors the board's native GROUPS
 * (the coloured sections Monday shows on-screen, e.g. "IMPORT", "TRANSIT",
 * "Completed") onto each row's extra.monday_group_title/_position, so the
 * office UI can render the exact same sections Monday shows — no invented
 * status vocabulary, no hardcoded group list.
 *
 * Credentials + board id live in integration_settings (integration_name =
 * 'monday'): config.api_token (shared with every other Monday sync) and
 * config.import_board_id.
 */
import { createServerFn } from '@tanstack/react-start'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const db = () => supabaseAdmin as any

const MONDAY_API = 'https://api.monday.com/v2'

interface MondayConfig {
  apiToken: string
  boardId: string
}

async function getMondayConfig(): Promise<MondayConfig> {
  const { data: row } = await db()
    .from('integration_settings')
    .select('config, enabled')
    .eq('integration_name', 'monday')
    .maybeSingle()
  const cfg = row?.config ?? {}
  const apiToken = cfg.api_token
  const boardId = cfg.import_board_id
  if (!apiToken || !boardId) {
    throw new Error('ShipSync Import Monday sync not configured — needs api_token and import_board_id in Settings → Integrations → Monday.com.')
  }
  return { apiToken: String(apiToken), boardId: String(boardId) }
}

// Same overlap guard as the other Monday syncs, under its own config key so
// it can never contend with the Local sync's lock.
const LOCK_STALE_MINUTES = 15

async function acquireSyncLock(): Promise<boolean> {
  const { data: row } = await db()
    .from('integration_settings')
    .select('config')
    .eq('integration_name', 'monday')
    .maybeSingle()
  const cfg = row?.config ?? {}
  const lockedAt = cfg.import_board_sync_started_at ? new Date(cfg.import_board_sync_started_at).getTime() : 0
  const staleCutoff = Date.now() - LOCK_STALE_MINUTES * 60_000
  if (lockedAt > staleCutoff) return false

  await db().from('integration_settings')
    .update({ config: { ...cfg, import_board_sync_started_at: new Date().toISOString() } })
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
  delete cfg.import_board_sync_started_at
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
type MondayGroup = { id: string; title: string }
type MondayItem = { id: string; name: string; group: MondayGroup | null; column_values: { id: string; text: string | null }[] }

async function fetchBoard(cfg: MondayConfig): Promise<{ columns: MondayColumn[]; groups: MondayGroup[]; items: MondayItem[] }> {
  const meta = await mondayGraphQL(
    cfg.apiToken,
    `query ($board: [ID!]) { boards (ids: $board) { columns { id title type } groups { id title } } }`,
    { board: [cfg.boardId] },
  )
  const columns: MondayColumn[] = (meta?.boards?.[0]?.columns ?? []).map((c: any) => ({ id: c.id, title: c.title, type: c.type }))
  const groups: MondayGroup[] = (meta?.boards?.[0]?.groups ?? []).map((g: any) => ({ id: g.id, title: g.title }))

  const items: MondayItem[] = []
  const firstPage = await mondayGraphQL(
    cfg.apiToken,
    `query ($board: [ID!]) {
       boards (ids: $board) {
         items_page (limit: 100) { cursor items { id name group { id title } column_values { id text } } }
       }
     }`,
    { board: [cfg.boardId] },
  )
  const firstIp = firstPage?.boards?.[0]?.items_page
  items.push(...(firstIp?.items ?? []))
  let cursor: string | null = firstIp?.cursor ?? null

  for (let page = 0; cursor && page < 100; page++) {
    const next: any = await mondayGraphQL(
      cfg.apiToken,
      `query ($cursor: String!) { next_items_page (cursor: $cursor, limit: 100) { cursor items { id name group { id title } column_values { id text } } } }`,
      { cursor },
    )
    const ip = next?.next_items_page
    items.push(...(ip?.items ?? []))
    cursor = ip?.cursor ?? null
  }
  return { columns, groups, items }
}

function byTitle(item: MondayItem, colById: Map<string, MondayColumn>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const cv of item.column_values) {
    const col = colById.get(cv.id)
    if (col && cv.text != null && cv.text !== '') out[col.title] = cv.text
  }
  return out
}

function pick(row: Record<string, string>, ...keywords: string[]): string | null {
  const entries = Object.entries(row)
  for (const kw of keywords) {
    const hit = entries.find(([title]) => title.toLowerCase().includes(kw))
    if (hit && hit[1]) return hit[1]
  }
  return null
}

function toDate(v: string | null): string | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}
function toNumber(v: string | null): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(/[^\d.-]/g, ''))
  return isNaN(n) ? null : n
}
function toBool(v: string | null): boolean | null {
  if (!v) return null
  const s = v.trim().toLowerCase()
  if (s === 'yes' || s === 'true') return true
  if (s === 'no' || s === 'false') return false
  return null
}
function toDocuments(v: string | null): { name: string; url: string }[] | null {
  if (!v) return null
  const docs = v.split(',').map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s))
    .map((url) => ({ name: decodeURIComponent(url.split('/').pop() || 'Document'), url }))
  return docs.length ? docs : null
}

export interface MondayImportBoardResult { ok: boolean; synced: number; errors: number; pruned: number; skipped?: boolean; detail: string }

async function importInner(): Promise<MondayImportBoardResult> {
  const cfg = await getMondayConfig()
  const { columns, groups, items } = await fetchBoard(cfg)
  const colById = new Map(columns.map((c) => [c.id, c] as const))
  const columnOrder = columns.map((c) => c.title)
  const groupOrder = groups.map((g) => g.title)

  const existingRows: { id: string; extra: any }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db()
      .from('shipsync_packages')
      .select('id, extra')
      .eq('local_import', 'Import')
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

  const now = new Date().toISOString()
  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; itemName: string; record: Record<string, unknown> }[] = []

  for (const item of items) {
    const row = byTitle(item, colById)
    const record: Record<string, unknown> = {
      barcode: item.name ?? pick(row, 'air waybill', 'waybill', 'tracking'),
      boat_name: pick(row, 'yacht name', 'vessel', 'boat'),
      courier: pick(row, 'courier'),
      num_packages: toNumber(pick(row, 'qty', 'number of packages', 'no. of')) ?? 1,
      supplier: pick(row, 'supplier'),
      origin: pick(row, 'collection and destination', 'collection', 'origin'),
      boe_no: pick(row, 'boe'),
      trade_type: pick(row, 'shipment type'),
      description: pick(row, 'remarks'),
      receiver_full_name: pick(row, 'receiver'),
      delivery_note_no: pick(row, 'dn no'),
      duty: toNumber(pick(row, 'duty')),
      vat: toNumber(pick(row, 'vat')),
      edas_required: toBool(pick(row, 'edas')),
      received_at: toDate(pick(row, 'date received')),
      delivered_at: toDate(pick(row, 'date delivered')),
      documents: toDocuments(pick(row, 'files')),
      local_import: 'Import',
      status: 'in_office' as const,
      extra: {
        monday_item_id: item.id,
        monday_item_name: item.name,
        monday_columns: columnOrder,
        monday_group_id: item.group?.id ?? null,
        monday_group_title: item.group?.title ?? null,
        monday_group_position: item.group ? groupOrder.indexOf(item.group.title) : -1,
        monday_group_order: groupOrder,
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
    const { error } = await db().from('shipsync_packages').insert(toInsert)
    if (!error) {
      synced += toInsert.length
    } else {
      const CONCURRENCY = 25
      for (let i = 0; i < toInsert.length; i += CONCURRENCY) {
        const batch = toInsert.slice(i, i + CONCURRENCY)
        const results = await Promise.all(batch.map((rec) => db().from('shipsync_packages').insert([rec])))
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
    const results = await Promise.all(batch.map(({ id, record }) => db().from('shipsync_packages').update(record).eq('id', id)))
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
    const { error } = await db().from('shipsync_packages').delete().eq('id', rowId)
    if (!error) pruned++
  }

  const detail = `Imported ${synced} item(s) from Monday, ${errors} error(s), removed ${pruned} stale row(s).${samples.length ? ' ' + samples.join(' | ') : ''}`
  return { ok: errors === 0, synced, errors, pruned, detail }
}

/** Guarded by its own lock — can't run concurrently with itself, and never
 *  touches the Local sync's rows (scoped to local_import = 'Import' throughout). */
export async function importMondayImportBoard(): Promise<MondayImportBoardResult> {
  const gotLock = await acquireSyncLock()
  if (!gotLock) {
    return { ok: true, synced: 0, errors: 0, pruned: 0, skipped: true, detail: 'Skipped — another ShipSync Import Monday sync is already in progress.' }
  }
  try {
    return await importInner()
  } finally {
    await releaseSyncLock()
  }
}

/** Server function for the "Sync from Monday" button on the ShipSync Import board. */
export const syncMondayImportBoard = createServerFn({ method: 'POST' })
  .handler(async (): Promise<MondayImportBoardResult> => importMondayImportBoard())
