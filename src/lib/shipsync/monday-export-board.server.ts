/**
 * ShipSync Export tab ↔ Monday.com import.
 *
 * One-way, read-only mirror of the Monday "Shipment -  Export - 2026" board
 * (id 5089054212) into shipsync_packages (local_import = 'Export') — Monday
 * is the source of truth, this never writes back. A sibling of
 * monday-import-board.server.ts (the Shipment - Import/Transit board into
 * local_import = 'Import'), kept in its own file since the two boards have
 * unrelated column layouts (this one is freight-forwarding requests keyed on
 * a quotation reference, not physical package check-ins).
 *
 * Mirrors the board's native GROUPS (Export / Delivered / COMPLETED /
 * Cancelled) onto each row's extra.monday_group_title/_position, same as the
 * Import board sync, so the UI can render the exact same sections Monday
 * shows — no invented status vocabulary.
 *
 * Credentials live in integration_settings (integration_name = 'monday'):
 * config.api_token, shared with every other Monday sync. The board id is
 * fixed (this board doesn't change), so unlike the Import board it isn't a
 * separate config key — hardcoded below instead.
 */
import { createServerFn } from '@tanstack/react-start'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const db = () => supabaseAdmin as any

const MONDAY_API = 'https://api.monday.com/v2'
const EXPORT_BOARD_ID = '5089054212'

async function getMondayApiToken(): Promise<string> {
  const { data: row } = await db()
    .from('integration_settings')
    .select('config')
    .eq('integration_name', 'monday')
    .maybeSingle()
  const apiToken = row?.config?.api_token
  if (!apiToken) throw new Error('Monday.com integration not configured — add an API Token in Settings → Integrations.')
  return String(apiToken)
}

// Same overlap guard as the other Monday syncs, under its own config key so
// it can never contend with the Local or Import board syncs' locks.
const LOCK_STALE_MINUTES = 15

async function acquireSyncLock(): Promise<boolean> {
  const { data: row } = await db()
    .from('integration_settings')
    .select('config')
    .eq('integration_name', 'monday')
    .maybeSingle()
  const cfg = row?.config ?? {}
  const lockedAt = cfg.export_board_sync_started_at ? new Date(cfg.export_board_sync_started_at).getTime() : 0
  const staleCutoff = Date.now() - LOCK_STALE_MINUTES * 60_000
  if (lockedAt > staleCutoff) return false

  await db().from('integration_settings')
    .update({ config: { ...cfg, export_board_sync_started_at: new Date().toISOString() } })
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
  delete cfg.export_board_sync_started_at
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

async function fetchBoard(token: string): Promise<{ columns: MondayColumn[]; groups: MondayGroup[]; items: MondayItem[] }> {
  const meta = await mondayGraphQL(
    token,
    `query ($board: [ID!]) { boards (ids: $board) { columns { id title type } groups { id title } } }`,
    { board: [EXPORT_BOARD_ID] },
  )
  const columns: MondayColumn[] = (meta?.boards?.[0]?.columns ?? []).map((c: any) => ({ id: c.id, title: c.title, type: c.type }))
  const groups: MondayGroup[] = (meta?.boards?.[0]?.groups ?? []).map((g: any) => ({ id: g.id, title: g.title }))

  const items: MondayItem[] = []
  const firstPage = await mondayGraphQL(
    token,
    `query ($board: [ID!]) {
       boards (ids: $board) {
         items_page (limit: 100) { cursor items { id name group { id title } column_values { id text } } }
       }
     }`,
    { board: [EXPORT_BOARD_ID] },
  )
  const firstIp = firstPage?.boards?.[0]?.items_page
  items.push(...(firstIp?.items ?? []))
  let cursor: string | null = firstIp?.cursor ?? null

  for (let page = 0; cursor && page < 100; page++) {
    const next: any = await mondayGraphQL(
      token,
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
function toDocuments(v: string | null): { name: string; url: string }[] | null {
  if (!v) return null
  const docs = v.split(',').map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s))
    .map((url) => ({ name: decodeURIComponent(url.split('/').pop() || 'Document'), url }))
  return docs.length ? docs : null
}

export interface MondayExportBoardResult { ok: boolean; synced: number; errors: number; pruned: number; skipped?: boolean; detail: string }

async function importInner(): Promise<MondayExportBoardResult> {
  const token = await getMondayApiToken()
  const { columns, groups, items } = await fetchBoard(token)
  const colById = new Map(columns.map((c) => [c.id, c] as const))
  const columnOrder = columns.map((c) => c.title)
  const groupOrder = groups.map((g) => g.title)

  const existingRows: { id: string; extra: any }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db()
      .from('shipsync_packages')
      .select('id, extra')
      .eq('local_import', 'Export')
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
    if (!item.name?.trim()) continue // Monday's own blank placeholder rows
    const row = byTitle(item, colById)
    const record: Record<string, unknown> = {
      // The item's own name IS the reference on this board (a quotation
      // number like "Q26-01816") — there's no separate barcode/tracking
      // column that's always populated, so unlike the Import board (which
      // falls back to item.name only when AWB is blank) this uses it
      // directly, same role a barcode plays elsewhere in ShipSync.
      barcode: item.name,
      boat_name: pick(row, 'client')?.toUpperCase() ?? null,
      courier: pick(row, 'courier/agent', 'courier'),
      description: pick(row, 'item description'),
      num_packages: 1,
      documents: toDocuments(pick(row, 'files')),
      received_at: toDate(pick(row, 'requested date')),
      local_import: 'Export',
      status: 'in_office',
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
 *  touches the Local/Import syncs' rows (scoped to local_import = 'Export' throughout). */
export async function importMondayExportBoard(): Promise<MondayExportBoardResult> {
  const gotLock = await acquireSyncLock()
  if (!gotLock) {
    return { ok: true, synced: 0, errors: 0, pruned: 0, skipped: true, detail: 'Skipped — another ShipSync Export Monday sync is already in progress.' }
  }
  try {
    return await importInner()
  } finally {
    await releaseSyncLock()
  }
}

/** Server function for the "Sync from Monday" button on the ShipSync Export board. */
export const syncMondayExportBoard = createServerFn({ method: 'POST' })
  .handler(async (): Promise<MondayExportBoardResult> => importMondayExportBoard())
