/**
 * Read-only Monday.com probe for the 4 JLS Yacht Training Institute boards
 * (https://jlsyachts.monday.com/boards/5083658513, 5083658992, 5083657645,
 * 5084032924). Reuses the same integration_settings.config.api_token as the
 * ShipSync/Yacht Shipments Monday integrations (Settings → Integrations →
 * Monday.com) — the token isn't board-specific, so no new config is needed
 * just to READ these boards' schema. Never writes anything.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const db = () => supabaseAdmin as any

const MONDAY_API = 'https://api.monday.com/v2'

const TRAINING_BOARD_IDS = ['5083658513', '5083658992', '5083657645', '5084032924']

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

/**
 * For one board: its title, columns (id/title/type/settings), groups
 * (id/title), and a handful of raw sample items so real values — not just
 * column names — inform the schema this gets mapped onto.
 */
async function probeBoard(token: string, boardId: string) {
  const meta = await mondayGraphQL(
    token,
    `query ($board: [ID!]) {
       boards (ids: $board) {
         name
         columns { id title type settings_str }
         groups { id title }
       }
     }`,
    { board: [boardId] },
  )
  const board = meta?.boards?.[0]
  if (!board) return { boardId, ok: false, error: 'Board not found or not accessible with this token.' }

  const itemsData = await mondayGraphQL(
    token,
    `query ($board: [ID!]) {
       boards (ids: $board) {
         items_page (limit: 8) {
           items { id name group { id title } column_values { id text } }
         }
       }
     }`,
    { board: [boardId] },
  )
  const rawItems = itemsData?.boards?.[0]?.items_page?.items ?? []
  const colTitleById = new Map((board.columns ?? []).map((c: any) => [c.id, c.title]))
  const samples = rawItems.map((it: any) => ({
    __name: it.name,
    __group: it.group?.title ?? null,
    ...Object.fromEntries(
      it.column_values
        .filter((cv: any) => cv.text != null && cv.text !== '')
        .map((cv: any) => [colTitleById.get(cv.id) ?? cv.id, cv.text]),
    ),
  }))

  return {
    boardId,
    ok: true,
    name: board.name,
    columns: (board.columns ?? []).map((c: any) => ({ id: c.id, title: c.title, type: c.type, settings: c.settings_str })),
    groups: board.groups ?? [],
    sampleItems: samples,
  }
}

export async function probeTrainingBoards(): Promise<Record<string, unknown>> {
  const token = await getMondayApiToken()
  const results = []
  for (const boardId of TRAINING_BOARD_IDS) {
    try {
      results.push(await probeBoard(token, boardId))
    } catch (e) {
      results.push({ boardId, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { boards: results }
}
