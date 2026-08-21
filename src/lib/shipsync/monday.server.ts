/**
 * ShipSync ↔ Monday.com import.
 *
 * One-way, read-only mirror of the Monday "Local Shipments" board into
 * shipsync_packages (local_import = 'Local'). Monday is the source of truth;
 * we never write back.
 *
 * The board's columns are discovered at sync time and the COMPLETE row is stored
 * verbatim in extra.monday ({ columnTitle: text }) so callers can render exactly
 * the columns the board has — no hardcoded column list. A best-effort map also
 * lands the well-known fields (AWB, client, courier, supplier, …) onto the
 * first-class shipsync_packages columns so the rest of the module keeps working.
 *
 * Credentials live in integration_settings (integration_name = 'monday'):
 *   config.api_token  — a Monday API v2 personal token (server-only secret)
 *   config.board_id   — the numeric Local Shipments board id
 * Both are entered by the user in Settings → Integrations → Monday.com.
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
  const boardId = cfg.board_id
  if (!apiToken || !boardId) {
    throw new Error('Monday.com integration not configured — add an API Token and Board ID in Settings → Integrations.')
  }
  return { apiToken: String(apiToken), boardId: String(boardId) }
}

/** POST a GraphQL query to the Monday API. Throws on transport or GraphQL errors. */
async function mondayGraphQL(token: string, query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      'API-Version': '2024-01',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Monday API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const json = await res.json() as any
  if (json.errors?.length) throw new Error(`Monday GraphQL: ${json.errors.map((e: any) => e.message).join('; ').slice(0, 200)}`)
  return json.data
}

type MondayColumn = { id: string; title: string; type: string }
type MondayItem = { id: string; name: string; column_values: { id: string; text: string | null }[] }

/**
 * Fetch every item on the board (paginated) plus the board's column definitions.
 * Uses items_page + cursor — the current Monday pagination API.
 */
async function fetchBoard(cfg: MondayConfig): Promise<{ columns: MondayColumn[]; items: MondayItem[] }> {
  // Columns (once).
  const colData = await mondayGraphQL(
    cfg.apiToken,
    `query ($board: [ID!]) { boards (ids: $board) { columns { id title type } } }`,
    { board: [cfg.boardId] },
  )
  const columns: MondayColumn[] = (colData?.boards?.[0]?.columns ?? []).map((c: any) => ({
    id: c.id, title: c.title, type: c.type,
  }))

  // Items, page by page.
  const items: MondayItem[] = []
  let cursor: string | null = null
  // First page comes from the board; subsequent pages via next_items_page(cursor).
  const firstPage = await mondayGraphQL(
    cfg.apiToken,
    `query ($board: [ID!]) {
       boards (ids: $board) {
         items_page (limit: 100) {
           cursor
           items { id name column_values { id text } }
         }
       }
     }`,
    { board: [cfg.boardId] },
  )
  const firstIp = firstPage?.boards?.[0]?.items_page
  items.push(...(firstIp?.items ?? []))
  cursor = firstIp?.cursor ?? null

  // Guard the loop so a misbehaving cursor can't run forever.
  for (let page = 0; cursor && page < 100; page++) {
    const next: any = await mondayGraphQL(
      cfg.apiToken,
      `query ($cursor: String!) {
         next_items_page (cursor: $cursor, limit: 100) {
           cursor
           items { id name column_values { id text } }
         }
       }`,
      { cursor },
    )
    const ip = next?.next_items_page
    items.push(...(ip?.items ?? []))
    cursor = ip?.cursor ?? null
  }

  return { columns, items }
}

/** Lowercased-title → value lookup for an item, so mapping is header-tolerant. */
function byTitle(item: MondayItem, colById: Map<string, MondayColumn>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const cv of item.column_values) {
    const col = colById.get(cv.id)
    if (col && cv.text != null && cv.text !== '') out[col.title] = cv.text
  }
  return out
}

/** Find the first non-empty value whose column title matches any of the keywords. */
function pick(row: Record<string, string>, ...keywords: string[]): string | null {
  const entries = Object.entries(row)
  for (const kw of keywords) {
    const hit = entries.find(([title]) => title.toLowerCase().includes(kw))
    if (hit && hit[1]) return hit[1]
  }
  return null
}

/** Parse a Monday date-ish text into an ISO date, or null. */
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

/** A Monday "Files" column's text is one or more URLs (comma-separated when
 *  more than one file). Filters to actual links — a bare filename with no URL
 *  can't be turned into a working document link, so it's dropped rather than
 *  stored broken. */
function toDocuments(v: string | null): { name: string; url: string }[] | null {
  if (!v) return null
  const docs = v.split(',').map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s))
    .map((url) => ({ name: decodeURIComponent(url.split('/').pop() || 'Document'), url }))
  return docs.length ? docs : null
}

export interface MondayImportResult { ok: boolean; synced: number; errors: number; pruned: number; detail: string }

/**
 * Pull the Monday Local Shipments board into shipsync_packages. Upserts on
 * extra.monday_item_id so re-running updates existing rows in place. Also
 * prunes any row that was itself created by an earlier Monday sync (has a
 * monday_item_id) but whose item is no longer on the CURRENTLY configured
 * board — e.g. leftovers from a wrong board id that got corrected. Never
 * touches rows without a monday_item_id (hand-entered packages).
 */
export async function importMondayShipments(_opts: { limit?: number } = {}): Promise<MondayImportResult> {
  const cfg = await getMondayConfig()
  const { columns, items } = await fetchBoard(cfg)
  const colById = new Map(columns.map((c) => [c.id, c] as const))

  // Existing Local rows, keyed by Monday item id → our row id (for upsert).
  const { data: existingRows } = await db()
    .from('shipsync_packages')
    .select('id, extra')
    .eq('local_import', 'Local')
  const idByMonday = new Map<string, string>()
  for (const r of (existingRows ?? []) as any[]) {
    const mid = r.extra?.monday_item_id
    if (mid) idByMonday.set(String(mid), r.id)
  }

  const now = new Date().toISOString()
  const columnOrder = columns.map((c) => c.title)
  let synced = 0, errors = 0
  const samples: string[] = []

  for (const item of items) {
    const row = byTitle(item, colById)
    const record: Record<string, unknown> = {
      // This board has no dedicated tracking/AWB column — the tracking number
      // lives in the item's own name/title instead, so fall back to it.
      barcode: pick(row, 'waybill', 'awb', 'tracking', 'barcode') ?? item.name ?? null,
      boat_name: (pick(row, 'client', 'vessel', 'boat', 'yacht') ?? item.name)?.toUpperCase() ?? null,
      package_owner: pick(row, 'consignee', 'owner', 'receiver'),
      courier: pick(row, 'courier', 'carrier', 'freight'),
      num_packages: toNumber(pick(row, 'number of packages', 'no. of', 'qty', 'packages')) ?? 1,
      supplier: pick(row, 'supplier', 'shipper', 'sender'),
      origin: pick(row, 'origin', 'from', 'country'),
      boe_no: pick(row, 'boe', 'bill of entry', 'declaration'),
      commodity: pick(row, 'commodity', 'goods', 'description', 'contents'),
      weight_kg: toNumber(pick(row, 'weight', 'kg', 'gross')),
      received_at: toDate(pick(row, 'date received', 'received', 'arrival', 'eta')),
      planned_delivery_date: toDate(pick(row, 'delivery date', 'planned', 'delivered')),
      documents: toDocuments(pick(row, 'files', 'file', 'attachment')),
      local_import: 'Local',
      status: 'in_office' as const,
      extra: {
        monday_item_id: item.id,
        monday_item_name: item.name,
        monday_columns: columnOrder,
        monday: row,
        imported_at: now,
      },
    }

    try {
      const existingId = idByMonday.get(item.id)
      if (existingId) {
        const { error } = await db().from('shipsync_packages').update(record).eq('id', existingId)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await db().from('shipsync_packages').insert([record])
        if (error) throw new Error(error.message)
      }
      synced++
    } catch (e: any) {
      errors++
      if (samples.length < 3) samples.push(`${item.name}: ${e?.message ?? 'error'}`)
    }
  }

  // Prune previously-synced rows whose item no longer exists on this board —
  // e.g. leftovers from a wrong board id that's since been corrected. Only
  // ever touches rows this sync itself created (monday_item_id set).
  const currentItemIds = new Set(items.map((i) => i.id))
  let pruned = 0
  for (const [mid, rowId] of idByMonday) {
    if (currentItemIds.has(mid)) continue
    const { error } = await db().from('shipsync_packages').delete().eq('id', rowId)
    if (!error) pruned++
  }

  const detail = `Imported ${synced} item(s) from Monday, ${errors} error(s), removed ${pruned} stale row(s) from a prior board.${samples.length ? ' ' + samples.join(' | ') : ''}`
  return { ok: errors === 0, synced, errors, pruned, detail }
}

/** Server function for the "Sync from Monday" button on the Local Packages tab. */
export const syncMondayImport = createServerFn({ method: 'POST' })
  .handler(async (): Promise<MondayImportResult> => importMondayShipments({}))

/**
 * Read-only diagnostic: the board's real column titles plus several sample
 * items' raw values (with the item name included), so a mapping mismatch or
 * genuinely-sparse source data can be told apart. Never writes anything.
 */
export async function debugMondayBoard(): Promise<{ columns: string[]; totalItems: number; samples: Record<string, string>[] }> {
  const cfg = await getMondayConfig()
  const { columns, items } = await fetchBoard(cfg)
  const colById = new Map(columns.map((c) => [c.id, c] as const))
  const samples = items.slice(0, 8).map((it) => ({ __itemName: it.name, ...byTitle(it, colById) }))
  return { columns: columns.map((c) => c.title), totalItems: items.length, samples }
}

/**
 * Read-only diagnostic: finds the first item with a Files value and attempts
 * to download it from Monday two ways (with the API token as a Bearer header,
 * and with no auth at all) to determine whether Monday's file links actually
 * need authentication to fetch — needed before deciding how to re-host them.
 * Never writes anything; downloads are discarded, not stored.
 */
export async function debugMondayFileAccess(): Promise<Record<string, unknown>> {
  const cfg = await getMondayConfig()
  const { columns, items } = await fetchBoard(cfg)
  const colById = new Map(columns.map((c) => [c.id, c] as const))

  let fileUrl: string | null = null
  for (const item of items) {
    const row = byTitle(item, colById)
    const raw = pick(row, 'files', 'file', 'attachment')
    const match = raw?.split(',').map((s) => s.trim()).find((s) => /^https?:\/\//i.test(s))
    if (match) { fileUrl = match; break }
  }
  if (!fileUrl) return { ok: false, error: 'No file URL found in the first pass over items.' }

  async function probe(headers: Record<string, string>) {
    try {
      const res = await fetch(fileUrl!, { headers })
      return { status: res.status, contentType: res.headers.get('content-type'), contentLength: res.headers.get('content-length') }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  return {
    ok: true,
    fileUrl,
    withBearerToken: await probe({ Authorization: `Bearer ${cfg.apiToken}` }),
    withRawToken: await probe({ Authorization: cfg.apiToken }),
    noAuth: await probe({}),
  }
}

/**
 * Read-only diagnostic: finds one item on the board by its exact name (the
 * tracking number, since that's what barcode is mapped from) and shows both
 * what Monday has for it AND what's actually stored in shipsync_packages for
 * that same item — side by side, to catch a real sync bug rather than guess.
 */
export async function debugMondayItemLookup(itemName: string): Promise<Record<string, unknown>> {
  const cfg = await getMondayConfig()
  const { columns, items } = await fetchBoard(cfg)
  const colById = new Map(columns.map((c) => [c.id, c] as const))

  const item = items.find((it) => it.name === itemName)
  if (!item) return { ok: false, error: `No item named "${itemName}" found on the board (${items.length} items total).` }

  const mondayRow = byTitle(item, colById)

  const { data: stored, error } = await db()
    .from('shipsync_packages')
    .select('*')
    .filter('extra->>monday_item_id', 'eq', item.id)
    .maybeSingle()

  return {
    ok: true,
    mondayItemId: item.id,
    monday: mondayRow,
    storedRowFound: !!stored,
    storedRowError: error?.message ?? null,
    stored,
  }
}
