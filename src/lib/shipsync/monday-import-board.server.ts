/**
 * ShipSync Import tab ↔ Monday.com import.
 *
 * Mirrors the Monday "Shipment - Import/Transit" board into shipsync_packages
 * (local_import = 'Import'). Monday is the source of truth for the shipment's
 * own details; the one thing that travels the other way is a status change made
 * on the Import board, which is pushed back along with the group move it implies
 * (setShipmentStatus, at the foot of this file). A sibling of
 * shipsync/monday.server.ts (which covers the separate "Local Shipments" board
 * into local_import = 'Local'), kept in its own file since the two boards have
 * unrelated column layouts.
 *
 * Items are matched to existing rows by Monday's item id and then by AWB, so a
 * package the Power App already scanned in is updated rather than recorded a
 * second time. Anything the scan owns — status, delivery details, photos — is
 * left alone when Monday's version is merged on top.
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

/**
 * Fields the Power App owns — written when a package is scanned in or delivered
 * through ShipSync. Monday never knows better about these, so a re-pull must not
 * blank them. That matters now the sync merges onto scanned packages by AWB: the
 * record it builds carries `status: 'in_office'` for every item, which would have
 * reset a delivered shipment on the hour, every hour.
 */
const SCAN_OWNED_FIELDS = [
  'status', 'delivered_at', 'receiver_full_name', 'receiver_designation', 'receiver_email',
  'signature_url', 'delivery_photo_url', 'item_photo_url', 'office_photo_url',
  'scan_out_time', 'driver_scan_out_time', 'driver_scanned', 'warehouse_zone', 'documents',
] as const

/** Monday's version of a shipment, folded onto a row that already exists here. */
function mergeOntoExisting(
  record: Record<string, unknown>,
  existingExtra: Record<string, any> | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...record }

  // Status is only ever an opening value for a brand-new row. On an existing one
  // it is either a scan result or something a person set, and both outrank a
  // re-pull.
  delete merged.status

  for (const key of SCAN_OWNED_FIELDS) {
    const v = merged[key]
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) delete merged[key]
  }

  // Keep everything already in extra (the SharePoint link, photos, note links)
  // and let Monday's own keys land on top.
  merged.extra = { ...(existingExtra ?? {}), ...((record.extra as Record<string, unknown>) ?? {}) }
  return merged
}

export interface MondayImportBoardResult { ok: boolean; synced: number; errors: number; pruned: number; skipped?: boolean; detail: string }

async function importInner(): Promise<MondayImportBoardResult> {
  const cfg = await getMondayConfig()
  const { columns, groups, items } = await fetchBoard(cfg)
  const colById = new Map(columns.map((c) => [c.id, c] as const))
  const columnOrder = columns.map((c) => c.title)
  const groupOrder = groups.map((g) => g.title)

  const existingRows: { id: string; extra: any; barcode: string | null }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db()
      .from('shipsync_packages')
      .select('id, extra, barcode')
      // Transit belongs here too: a shipment scanned in as Transit is part of the
      // same Import/Transit section, and is a candidate for AWB matching below.
      .in('local_import', ['Import', 'Transit'])
      .range(offset, offset + 999)
    if (!page || page.length === 0) break
    existingRows.push(...(page as any[]))
    if (page.length < 1000) break
  }
  const idByMonday = new Map<string, string>()
  // AWB → row, so a shipment already scanned in through the Power App is updated
  // rather than inserted a second time. Matching only on Monday's own item id put
  // 83 AWBs into Polaris twice — once from the scan, once from Monday.
  const idByBarcode = new Map<string, string>()
  const extraById = new Map<string, Record<string, any>>()
  for (const r of existingRows) {
    const mid = r.extra?.monday_item_id
    if (mid) idByMonday.set(String(mid), r.id)
    const bc = String(r.barcode ?? '').toLowerCase().trim()
    if (bc) idByBarcode.set(bc, r.id)
    extraById.set(String(r.id), (r.extra ?? {}) as Record<string, any>)
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

    const awb = String(record.barcode ?? '').toLowerCase().trim()
    const existingId = idByMonday.get(item.id) ?? (awb ? idByBarcode.get(awb) : undefined)
    if (existingId) {
      toUpdate.push({ id: existingId, itemName: item.name, record: mergeOntoExisting(record, extraById.get(existingId)) })
      // Claim the AWB so two Monday items sharing one never fight over the row.
      if (awb) idByBarcode.delete(awb)
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

// ─── Status → group, written back to Monday ───────────────────────────────────

/**
 * Where a shipment belongs once its status changes, in the team's own workflow:
 * received into the building takes it out of Incoming and into Import or Transit
 * depending on the shipment type; delivered moves it to Delivered Shipment; and
 * invoiced moves it to Completed. Anything else leaves the group alone.
 *
 * Titles are matched against the board's real groups case-insensitively, because
 * Monday's own spelling has drifted ("Incomming", "IMPORT" vs "Import").
 */
function targetGroupTitle(status: string, shipmentType: string): string | null {
  switch (status) {
    case 'Warehouse':
    case 'Office':
    case 'In Warehouse':
      return /transit/i.test(shipmentType) ? 'TRANSIT' : 'IMPORT'
    case 'Delivered - TBI':
      return 'Delivered Shipment'
    case 'Complete':
      return 'Completed'
    default:
      return null
  }
}

export interface StatusPushResult {
  /** The group the shipment ended up in, or null when the status implies no move. */
  group: string | null
  /** False when the shipment only exists in Polaris, so there was nothing to push. */
  pushedToMonday: boolean
  note?: string
}

/**
 * Set a shipment's status and move it to the group that status implies — in
 * Monday as well as here.
 *
 * Both halves matter. The Import board mirrors Monday and the hourly sync rewrites
 * each row wholesale, so a change made only in Polaris (status included) was
 * silently reverted within the hour. Pushing it to Monday first means the sync
 * finds the board already agreeing and leaves it be.
 *
 * Shipments scanned in through SharePoint have no Monday item behind them; those
 * are updated locally and reported as not pushed, rather than failing.
 */
export async function setShipmentStatus(packageId: string, status: string): Promise<StatusPushResult> {
  const { data: row } = await db()
    .from('shipsync_packages')
    .select('id, extra, local_import')
    .eq('id', packageId)
    .maybeSingle()
  if (!row) throw new Error('Shipment not found')

  const extra = (row.extra ?? {}) as Record<string, any>
  const mondayRow = (extra.monday ?? {}) as Record<string, string>
  const shipmentType = mondayRow['Shipment Type'] ?? row.local_import ?? ''
  const wantedTitle = targetGroupTitle(status, shipmentType)
  const itemId = extra.monday_item_id ? String(extra.monday_item_id) : null

  let groupTitle: string | null = null
  let groupId: string | null = null
  let pushedToMonday = false
  let note: string | undefined

  if (itemId) {
    const cfg = await getMondayConfig()
    const meta = await mondayGraphQL(
      cfg.apiToken,
      `query ($board: [ID!]) { boards (ids: $board) { columns { id title } groups { id title } } }`,
      { board: [cfg.boardId] },
    )
    const columns: Array<{ id: string; title: string }> = meta?.boards?.[0]?.columns ?? []
    const groups: MondayGroup[] = meta?.boards?.[0]?.groups ?? []

    const statusCol = columns.find((c) => c.title.trim().toUpperCase() === 'STATUS')
    if (statusCol) {
      await mondayGraphQL(
        cfg.apiToken,
        `mutation ($board: ID!, $item: ID!, $col: String!, $val: String!) {
           change_simple_column_value (board_id: $board, item_id: $item, column_id: $col, value: $val) { id }
         }`,
        { board: cfg.boardId, item: itemId, col: statusCol.id, val: status },
      )
      pushedToMonday = true
    } else {
      note = 'No STATUS column found on the Monday board — status saved in Polaris only.'
    }

    if (wantedTitle) {
      const g = groups.find((x) => x.title.trim().toLowerCase() === wantedTitle.toLowerCase())
      if (g) {
        await mondayGraphQL(
          cfg.apiToken,
          `mutation ($item: ID!, $group: String!) { move_item_to_group (item_id: $item, group_id: $group) { id } }`,
          { item: itemId, group: g.id },
        )
        groupTitle = g.title
        groupId = g.id
      } else {
        note = `Monday has no "${wantedTitle}" group — status changed but the shipment was not moved.`
      }
    }
  } else {
    note = 'Scanned shipment with no Monday item — updated in Polaris only.'
    if (wantedTitle) groupTitle = wantedTitle
  }

  // Mirror locally so the board is right immediately and the next sync agrees.
  const nextExtra: Record<string, any> = {
    ...extra,
    monday: { ...mondayRow, STATUS: status },
  }
  if (groupTitle) nextExtra.monday_group_title = groupTitle
  if (groupId) nextExtra.monday_group_id = groupId

  const { error } = await db().from('shipsync_packages').update({ extra: nextExtra }).eq('id', packageId)
  if (error) throw new Error(error.message)

  return { group: groupTitle, pushedToMonday, note }
}

/** Server function for the Import board's Status dropdown. */
export const pushShipmentStatus = createServerFn({ method: 'POST' })
  .inputValidator((d: { packageId: string; status: string }) => d)
  .handler(async ({ data }): Promise<StatusPushResult> => setShipmentStatus(data.packageId, data.status))
