/**
 * Read-only, generic Monday.com board probe — pass any board id, get its
 * title, columns (with settings, so status-column colours are included),
 * groups, and a few raw sample items. Reuses the same API token as every
 * other ShipSync/Training Monday integration (integration_settings,
 * integration_name = 'monday'). Never writes anything. Meant for scoping a
 * new board integration before building it, not for ongoing use.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const db = () => supabaseAdmin as any
const MONDAY_API = 'https://api.monday.com/v2'

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

export async function probeMondayBoard(boardId: string): Promise<Record<string, unknown>> {
  const token = await getMondayApiToken()
  const meta = await mondayGraphQL(
    token,
    `query ($board: [ID!]) { boards (ids: $board) { name columns { id title type settings_str } groups { id title } } }`,
    { board: [boardId] },
  )
  const board = meta?.boards?.[0]
  if (!board) return { ok: false, error: 'Board not found or not accessible with this token.' }

  const itemsData = await mondayGraphQL(
    token,
    `query ($board: [ID!]) {
       boards (ids: $board) {
         items_page (limit: 10) {
           items { id name group { title } column_values { id text } }
         }
       }
     }`,
    { board: [boardId] },
  )
  const rawItems = itemsData?.boards?.[0]?.items_page?.items ?? []
  const colTitleById = new Map<string, string>((board.columns ?? []).map((c: any) => [c.id, c.title]))
  const sampleItems = rawItems.map((it: any) => ({
    __name: it.name,
    __group: it.group?.title ?? null,
    ...Object.fromEntries(
      it.column_values.filter((cv: any) => cv.text != null && cv.text !== '').map((cv: any) => [colTitleById.get(cv.id) ?? cv.id, cv.text]),
    ),
  }))

  return { ok: true, boardId, name: board.name, columns: board.columns, groups: board.groups, sampleItems }
}
