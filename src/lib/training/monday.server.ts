/**
 * JLS Yacht Training Institute ↔ Monday.com.
 *
 * One-way, read-only mirror of the school's own 4 Monday boards into
 * training_instructors / training_students / training_courses /
 * training_classes. Monday is the source of truth; we never write back.
 *
 *   Instructors        https://jlsyachts.monday.com/boards/5083658513
 *   Student_Contacts    https://jlsyachts.monday.com/boards/5083658992
 *   Courses             https://jlsyachts.monday.com/boards/5083657645
 *   Class                https://jlsyachts.monday.com/boards/5084032924
 *
 * Board relation columns (Instructor/Course/Student/Class links) come back
 * from Monday's API as plain display text — the linked item's own name(s),
 * comma-joined when there's more than one — so they're stored as text here
 * too, not resolved into foreign keys. That's the same shape Monday's own
 * board_relation column shows on screen, and keeps the sync one-directional
 * and simple: no cross-board id-resolution pass needed.
 *
 * Credentials are shared with the ShipSync/Yacht Shipments Monday
 * integrations — integration_settings (integration_name = 'monday').
 * config.api_token is a Monday API v2 personal token (server-only secret),
 * entered by the user in Settings → Integrations → Monday.com. The 4 board
 * ids below are fixed (the school doesn't add new boards), so — unlike
 * ShipSync's board id — they live in code, not in that same config.
 */
import { createServerFn } from '@tanstack/react-start'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const db = () => supabaseAdmin as any

const MONDAY_API = 'https://api.monday.com/v2'

const BOARD_IDS = {
  instructors: '5083658513',
  students: '5083658992',
  courses: '5083657645',
  classes: '5084032924',
} as const

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

type MondayColumn = { id: string; title: string }
type MondayItem = { id: string; name: string; group: { title: string } | null; column_values: { id: string; text: string | null }[] }

/** Columns + every item (fully paginated), for one board. */
async function fetchBoard(token: string, boardId: string): Promise<{ columns: MondayColumn[]; items: MondayItem[] }> {
  const colData = await mondayGraphQL(
    token,
    `query ($board: [ID!]) { boards (ids: $board) { columns { id title } } }`,
    { board: [boardId] },
  )
  const columns: MondayColumn[] = colData?.boards?.[0]?.columns ?? []

  const items: MondayItem[] = []
  const firstPage = await mondayGraphQL(
    token,
    `query ($board: [ID!]) {
       boards (ids: $board) {
         items_page (limit: 100) {
           cursor
           items { id name group { title } column_values { id text } }
         }
       }
     }`,
    { board: [boardId] },
  )
  const firstIp = firstPage?.boards?.[0]?.items_page
  items.push(...(firstIp?.items ?? []))
  let cursor: string | null = firstIp?.cursor ?? null

  for (let page = 0; cursor && page < 100; page++) {
    const next: any = await mondayGraphQL(
      token,
      `query ($cursor: String!) {
         next_items_page (cursor: $cursor, limit: 100) {
           cursor
           items { id name group { title } column_values { id text } }
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

/** Title → text lookup for one item, header-tolerant like the ShipSync sync. */
function byTitle(item: MondayItem, colById: Map<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const cv of item.column_values) {
    const title = colById.get(cv.id)
    if (title && cv.text != null && cv.text !== '') out[title] = cv.text
  }
  return out
}

function toDate(v: string | undefined | null): string | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
function toNumber(v: string | undefined | null): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(/[^\d.-]/g, ''))
  return isNaN(n) ? null : n
}

/** Monday's Timeline column renders as text like "2025-11-04 - 2025-11-16". */
function toTimelineRange(v: string | undefined | null): { start: string | null; end: string | null } {
  if (!v) return { start: null, end: null }
  const [a, b] = v.split(' - ').map((s) => s.trim())
  return { start: toDate(a), end: toDate(b ?? a) }
}

/**
 * Upsert one board's items into one table, keyed on extra.monday_item_id.
 * Shared by all 4 syncs — only `buildRecord` differs per board.
 */
async function syncBoardIntoTable(opts: {
  token: string
  boardId: string
  table: string
  buildRecord: (item: MondayItem, row: Record<string, string>) => Record<string, unknown>
}): Promise<{ ok: boolean; synced: number; errors: number; pruned: number; detail: string }> {
  const { columns, items } = await fetchBoard(opts.token, opts.boardId)
  const colById = new Map(columns.map((c) => [c.id, c.title] as const))

  const existing: { id: string; extra: any }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data: page } = await db().from(opts.table).select('id, extra').range(offset, offset + 999)
    if (!page || page.length === 0) break
    existing.push(...(page as any[]))
    if (page.length < 1000) break
  }
  const idByMonday = new Map<string, string>()
  for (const r of existing) {
    const mid = r.extra?.monday_item_id
    if (mid) idByMonday.set(String(mid), r.id)
  }

  const now = new Date().toISOString()
  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; record: Record<string, unknown> }[] = []

  for (const item of items) {
    if (!item.name?.trim()) continue // Monday's own blank "New item" placeholder rows
    const row = byTitle(item, colById)
    const record = {
      ...opts.buildRecord(item, row),
      extra: { monday_item_id: item.id, monday_group: item.group?.title ?? null, monday: row, imported_at: now },
    }
    const existingId = idByMonday.get(item.id)
    if (existingId) toUpdate.push({ id: existingId, record })
    else toInsert.push(record)
  }

  let synced = 0, errors = 0
  if (toInsert.length > 0) {
    const { error } = await db().from(opts.table).insert(toInsert)
    if (!error) synced += toInsert.length
    else {
      for (const rec of toInsert) {
        const r = await db().from(opts.table).insert([rec])
        if (r.error) errors++
        else synced++
      }
    }
  }
  const CONCURRENCY = 25
  for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
    const batch = toUpdate.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(({ id, record }) => db().from(opts.table).update(record).eq('id', id)))
    for (const r of results as any[]) { if (r.error) errors++; else synced++ }
  }

  // Prune rows this sync itself created whose Monday item no longer exists.
  const currentIds = new Set(items.map((i) => i.id))
  let pruned = 0
  for (const [mid, rowId] of idByMonday) {
    if (currentIds.has(mid)) continue
    const { error } = await db().from(opts.table).delete().eq('id', rowId)
    if (!error) pruned++
  }

  return { ok: errors === 0, synced, errors, pruned, detail: `Synced ${synced} item(s), ${errors} error(s), removed ${pruned} stale row(s).` }
}

async function syncInstructors(token: string) {
  return syncBoardIntoTable({
    token, boardId: BOARD_IDS.instructors, table: 'training_instructors',
    buildRecord: (item, row) => ({
      full_name: item.name,
      eid_expiry: toDate(row['EID Expiry']),
      passport_expiry: toDate(row['Passport Expiry']),
      labour_card_expiry: toDate(row['Labour Card']),
      residence_visa_expiry: toDate(row['Residence Visa']),
      driving_license_expiry: toDate(row['24M Driving License']),
      seamen_card_expiry: toDate(row['Seamen Card']),
      class_name: row['Class'] ?? null,
      schedule: row['Schedule'] ?? null,
    }),
  })
}

async function syncStudents(token: string) {
  return syncBoardIntoTable({
    token, boardId: BOARD_IDS.students, table: 'training_students',
    buildRecord: (item, row) => ({
      full_name: item.name,
      mobile: row['Mobile'] ?? null,
      email: row['Email'] ?? null,
      birthday: toDate(row['Birthday']),
      address: row['Address'] ?? null,
      payment_status: row['Payment Status'] ?? null,
      payment_amount: toNumber(row['Payment Amount']),
      class_name: row['Class'] ?? null,
      instructor_name: row['Instructor'] ?? null,
      schedule: row['Schedule'] ?? null,
      enrollment_status: row['Enrollment Status'] ?? null,
      sequence_number: toNumber(row['Sequence Number']),
      monday_group: item.group?.title ?? null,
    }),
  })
}

async function syncCourses(token: string) {
  return syncBoardIntoTable({
    token, boardId: BOARD_IDS.courses, table: 'training_courses',
    buildRecord: (item, row) => ({
      name: item.name,
      price_aed: toNumber(row['Price (AED)']),
      duration: row['Duration'] ?? null,
      client_type: row['Client Type'] ?? null,
      timings: row['Timings'] ?? null,
    }),
  })
}

async function syncClasses(token: string) {
  return syncBoardIntoTable({
    token, boardId: BOARD_IDS.classes, table: 'training_classes',
    buildRecord: (item, row) => {
      const { start, end } = toTimelineRange(row['Timeline'])
      return {
        name: item.name,
        instructor_name: row['Instructor'] ?? row['Instructors'] ?? null,
        status: row['Status'] ?? null,
        course_name: row['Courses'] ?? null,
        timeline_start: start,
        timeline_end: end,
        student_names: row['link to Student_Contacts'] ?? null,
      }
    },
  })
}

export interface TrainingSyncResult { ok: boolean; synced: number; errors: number; pruned: number; detail: string }

// One zero-argument server function per board — same shape as every other
// "Sync from Monday" button in ShipSync/Yacht Shipments (createServerFn with
// no params, called from the client as `await fn()`), rather than a single
// parameterized function whose client-side calling convention isn't
// exercised anywhere else in this codebase.
export const syncTrainingInstructors = createServerFn({ method: 'POST' })
  .handler(async (): Promise<TrainingSyncResult> => syncInstructors(await getMondayApiToken()))
export const syncTrainingStudents = createServerFn({ method: 'POST' })
  .handler(async (): Promise<TrainingSyncResult> => syncStudents(await getMondayApiToken()))
export const syncTrainingCourses = createServerFn({ method: 'POST' })
  .handler(async (): Promise<TrainingSyncResult> => syncCourses(await getMondayApiToken()))
export const syncTrainingClasses = createServerFn({ method: 'POST' })
  .handler(async (): Promise<TrainingSyncResult> => syncClasses(await getMondayApiToken()))

/** Server function to sync all 4 boards in one call — used by the page-level "Sync all" action. */
export const syncAllTrainingBoards = createServerFn({ method: 'POST' })
  .handler(async (): Promise<Record<string, TrainingSyncResult>> => {
    const token = await getMondayApiToken()
    const [instructors, students, courses, classes] = await Promise.all([
      syncInstructors(token), syncStudents(token), syncCourses(token), syncClasses(token),
    ])
    return { instructors, students, courses, classes }
  })

/**
 * Read-only diagnostic: the 4 boards' real column titles, groups, and a
 * handful of raw sample items each — used to build the mapping above off
 * real data instead of guessing. Never writes anything.
 */
export async function probeTrainingBoards(): Promise<Record<string, unknown>> {
  const token = await getMondayApiToken()
  const results = []
  for (const [key, boardId] of Object.entries(BOARD_IDS)) {
    try {
      const meta = await mondayGraphQL(
        token,
        `query ($board: [ID!]) { boards (ids: $board) { name columns { id title type settings_str } groups { id title } } }`,
        { board: [boardId] },
      )
      const board = meta?.boards?.[0]
      if (!board) { results.push({ key, boardId, ok: false, error: 'Board not found or not accessible with this token.' }); continue }
      const { items } = await fetchBoard(token, boardId)
      const colById = new Map<string, string>((board.columns ?? []).map((c: any) => [c.id, c.title]))
      results.push({
        key, boardId, ok: true, name: board.name,
        columns: board.columns, groups: board.groups,
        totalItems: items.length,
        sampleItems: items.slice(0, 8).map((it) => ({ __name: it.name, __group: it.group?.title ?? null, ...byTitle(it, colById) })),
      })
    } catch (e) {
      results.push({ key, boardId, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { boards: results }
}
