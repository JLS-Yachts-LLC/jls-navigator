/**
 * ShipSync ↔ Monday.com import.
 *
 * One-way, read-only mirror of a Monday "Import" board into shipsync_packages
 * (local_import = 'Import'). Monday is the source of truth; we never write back.
 *
 * The board's columns are discovered at sync time and the COMPLETE row is stored
 * verbatim in extra.monday ({ columnTitle: text }) so the Import tab can render
 * exactly the columns the board has — no hardcoded column list. A best-effort map
 * also lands the well-known fields (AWB, client, courier, supplier, …) onto the
 * first-class shipsync_packages columns so the rest of the module keeps working.
 *
 * Credentials live in integration_settings (integration_name = 'monday'):
 *   config.api_token  — a Monday API v2 personal token (server-only secret)
 *   config.board_id   — the numeric Import board id
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

export interface MondayImportResult { ok: boolean; synced: number; errors: number; detail: string }

/**
 * Pull the Monday Import board into shipsync_packages. Upserts on
 * extra.monday_item_id so re-running updates existing rows in place.
 */
export async function importMondayShipments(_opts: { limit?: number } = {}): Promise<MondayImportResult> {
  const cfg = await getMondayConfig()
  const { columns, items } = await fetchBoard(cfg)
  const colById = new Map(columns.map((c) => [c.id, c] as const))

  // Existing Import rows, keyed by Monday item id → our row id (for upsert).
  const { data: existingRows } = await db()
    .from('shipsync_packages')
    .select('id, extra')
    .eq('local_import', 'Import')
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
      barcode: pick(row, 'waybill', 'awb', 'tracking', 'barcode'),
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
      local_import: 'Import',
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

  const detail = `Imported ${synced} item(s) from Monday, ${errors} error(s).${samples.length ? ' ' + samples.join(' | ') : ''}`
  return { ok: errors === 0, synced, errors, detail }
}

/** Server function for the "Sync from Monday" button on the Import tab. */
export const syncMondayImport = createServerFn({ method: 'POST' })
  .handler(async (): Promise<MondayImportResult> => importMondayShipments({}))
