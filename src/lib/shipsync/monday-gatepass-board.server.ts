/**
 * ShipSync Gate Pass tab ↔ Monday.com import.
 *
 * One-way import of the Monday "Gate Pass" board (id 5089663441) into shipsync_packages (local_import = 'Gate Pass'); it never
 * writes back. Built on the EDAS sync (monday-edas-board.server.ts): same hardcoded board id, same column_values → byTitle
 * approach, same lock and prune.
 *
 * Since 19 Oct 2026 the Gate Pass tab is editable and Polaris is taking over from Monday (Logistics are cancelling it), so the
 * sync only carries over what changed ON MONDAY since the last sync (mergeOntoExisting's three-way merge): a value edited on the
 * tab stays unless Monday's own value for it changes, rows added on the tab have no monday_item_id and are never touched, rows
 * edited on the tab are never pruned, and rows deleted on the tab (extra.deleted_at) are left alone rather than brought back.
 *
 * The board's columns are not hardcoded. Their titles and order are discovered at sync time and stored on every row
 * (extra.monday_columns; the item-name column's title in extra.monday_name_column), the raw text of each cell in extra.monday,
 * and what Monday itself last showed in extra.monday_synced (the merge base). Only a few things are lifted onto the row's own
 * columns, for searching: the item name (barcode), a client (boat_name) and a date (received_at).
 *
 * Gate Pass rows are NOT parcels. They are stored as status 'completed' so nothing treats them as waiting to go out (the
 * phone's Check-Out lists anything in the office), and they are tagged 'Gate Pass' so Local Packages, Routing and the
 * Dashboard — which each select by trade type — never pick them up.
 *
 * Credentials live in integration_settings (integration_name = 'monday'): config.api_token, shared with every other Monday sync.
 */
import { createServerFn } from '@tanstack/react-start'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { deriveFields } from './gatepass-view'

const db = () => supabaseAdmin as any

const MONDAY_API = 'https://api.monday.com/v2'
const GATE_PASS_BOARD_ID = '5089663441'

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
// it can never contend with the other board syncs' locks.
const LOCK_STALE_MINUTES = 15

async function acquireSyncLock(): Promise<boolean> {
  const { data: row } = await db()
    .from('integration_settings')
    .select('config')
    .eq('integration_name', 'monday')
    .maybeSingle()
  const cfg = row?.config ?? {}
  const lockedAt = cfg.gatepass_board_sync_started_at ? new Date(cfg.gatepass_board_sync_started_at).getTime() : 0
  const staleCutoff = Date.now() - LOCK_STALE_MINUTES * 60_000
  if (lockedAt > staleCutoff) return false

  await db().from('integration_settings')
    .update({ config: { ...cfg, gatepass_board_sync_started_at: new Date().toISOString() } })
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
  delete cfg.gatepass_board_sync_started_at
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
    { board: [GATE_PASS_BOARD_ID] },
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
    { board: [GATE_PASS_BOARD_ID] },
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

export function byTitle(item: MondayItem, colById: Map<string, MondayColumn>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const cv of item.column_values) {
    const col = colById.get(cv.id)
    if (col && cv.text != null && cv.text !== '') out[col.title] = cv.text
  }
  return out
}

export { pick, deriveFields } from './gatepass-view'

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * A three-way merge, so an edit made on the Gate Pass tab survives the next sync: each value (every cell, the item name, the
 * lifted fields, the group) only changes if Monday's own value differs from what Monday showed at the last sync
 * (extra.monday_synced / monday_synced_item_name — rows synced before those existed fall back to what they hold, which was
 * Monday's value then). A value Monday has not touched keeps whatever it was set to here, and a column only filled in here
 * (not on Monday) is kept.
 */
export function mergeOntoExisting(
  record: Record<string, unknown>,
  existingExtra: Record<string, any> | undefined,
  oldMondayRow: Record<string, string>,
  newMondayRow: Record<string, string>,
  itemName: string,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...record }
  delete merged.status

  const oldItemName = (existingExtra?.monday_synced_item_name ?? existingExtra?.monday_item_name ?? itemName) as string
  const oldFields = deriveFields(oldMondayRow, oldItemName)
  const newFields = deriveFields(newMondayRow, itemName)
  for (const key of Object.keys(newFields)) {
    if (sameValue(oldFields[key], newFields[key])) delete merged[key]
  }

  const newExtra = { ...((record.extra as Record<string, unknown>) ?? {}) }
  const oldSyncedGroup = (existingExtra?.monday_synced_group_title as string | null | undefined) ?? null
  const newSyncedGroup = (newExtra.monday_synced_group_title as string | null | undefined) ?? null
  if (existingExtra && oldSyncedGroup === newSyncedGroup) {
    delete newExtra.monday_group_id
    delete newExtra.monday_group_title
    delete newExtra.monday_group_position
  }
  if (existingExtra) {
    if (oldItemName === itemName) delete newExtra.monday_item_name
    const current: Record<string, string> = { ...((existingExtra.monday ?? {}) as Record<string, string>) }
    for (const key of new Set([...Object.keys(oldMondayRow), ...Object.keys(newMondayRow)])) {
      if (sameValue(oldMondayRow[key], newMondayRow[key])) continue
      if (newMondayRow[key] == null) delete current[key]
      else current[key] = newMondayRow[key]
    }
    newExtra.monday = current
  }
  merged.extra = { ...(existingExtra ?? {}), ...newExtra }
  return merged
}

export interface MondayGatePassBoardResult { ok: boolean; synced: number; errors: number; pruned: number; skipped?: boolean; detail: string }

async function importInner(): Promise<MondayGatePassBoardResult> {
  const token = await getMondayApiToken()
  const { columns, groups, items } = await fetchBoard(token)
  const colById = new Map(columns.map((c) => [c.id, c] as const))
  const columnOrder = columns.map((c) => c.title)
  const nameColumn = columns.find((c) => c.type === 'name')?.title ?? columnOrder[0] ?? null
  const groupOrder = groups.map((g) => g.title)

  const existingRows: { id: string; extra: any }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db()
      .from('shipsync_packages')
      .select('id, extra')
      .eq('local_import', 'Gate Pass')
      .range(offset, offset + 999)
    if (!page || page.length === 0) break
    existingRows.push(...(page as any[]))
    if (page.length < 1000) break
  }
  const idByMonday = new Map<string, string>()
  const extraById = new Map<string, Record<string, any>>()
  for (const r of existingRows) {
    const mid = r.extra?.monday_item_id
    if (mid) idByMonday.set(String(mid), r.id)
    extraById.set(String(r.id), (r.extra ?? {}) as Record<string, any>)
  }

  const now = new Date().toISOString()
  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; itemName: string; record: Record<string, unknown> }[] = []

  for (const item of items) {
    if (!item.name?.trim()) continue // Monday's own blank placeholder rows
    const row = byTitle(item, colById)
    const record: Record<string, unknown> = {
      ...deriveFields(row, item.name),
      num_packages: 1,
      local_import: 'Gate Pass',
      status: 'completed',
      extra: {
        monday_item_id: item.id,
        monday_item_name: item.name,
        monday_synced_item_name: item.name,
        monday_name_column: nameColumn,
        monday_columns: columnOrder,
        monday_group_id: item.group?.id ?? null,
        monday_group_title: item.group?.title ?? null,
        monday_group_position: item.group ? groupOrder.indexOf(item.group.title) : -1,
        monday_group_order: groupOrder,
        monday_synced_group_title: item.group?.title ?? null,
        monday: row,
        monday_synced: row,
        imported_at: now,
      },
    }

    const existingId = idByMonday.get(item.id)
    if (existingId) {
      const existingExtra = extraById.get(existingId)
      if (existingExtra?.deleted_at) continue // removed on the Gate Pass tab — don't bring it back
      const oldMondayRow = (existingExtra?.monday_synced ?? existingExtra?.monday ?? {}) as Record<string, string>
      toUpdate.push({ id: existingId, itemName: item.name, record: mergeOntoExisting(record, existingExtra, oldMondayRow, row, item.name) })
    } else {
      toInsert.push(record)
    }
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

  // Prune rows this sync itself created whose item no longer exists on the board — but never one edited on the Gate Pass tab
  // (Polaris is taking over from Monday), and nothing at all if the board came back empty (cleared or being wound down).
  const currentItemIds = new Set(items.map((i) => i.id))
  let pruned = 0
  for (const [mid, rowId] of idByMonday) {
    if (items.length === 0) break
    if (currentItemIds.has(mid) || extraById.get(rowId)?.edited_at) continue
    const { error } = await db().from('shipsync_packages').delete().eq('id', rowId)
    if (!error) pruned++
  }

  const detail = `Imported ${synced} item(s) from Monday, ${errors} error(s), removed ${pruned} stale row(s).${samples.length ? ' ' + samples.join(' | ') : ''}`
  return { ok: errors === 0, synced, errors, pruned, detail }
}

/** Guarded by its own lock — can't run concurrently with itself, and never
 *  touches the Local/Import/Export/EDAS syncs' rows (scoped to local_import = 'Gate Pass' throughout). */
export async function importMondayGatePassBoard(): Promise<MondayGatePassBoardResult> {
  const gotLock = await acquireSyncLock()
  if (!gotLock) {
    return { ok: true, synced: 0, errors: 0, pruned: 0, skipped: true, detail: 'Skipped — another ShipSync Gate Pass Monday sync is already in progress.' }
  }
  try {
    return await importInner()
  } finally {
    await releaseSyncLock()
  }
}

/** Server function for the "Sync from Monday" button on the ShipSync Gate Pass board. */
export const syncMondayGatePassBoard = createServerFn({ method: 'POST' })
  .handler(async (): Promise<MondayGatePassBoardResult> => importMondayGatePassBoard())
