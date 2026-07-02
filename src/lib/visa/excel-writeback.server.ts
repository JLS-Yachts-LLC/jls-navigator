/**
 * Visa → Excel write-back (Microsoft Graph workbook API).
 *
 * When a visa application changes in the app, mirror the change into the
 * SharePoint Excel trackers in the PortOperationsandAgency site.
 *
 * Design / safety:
 *  - Reuses the SharePoint Graph app credentials from integration_settings
 *    (getSpConfig) — secrets never leave the server.
 *  - Structure-discovering: each workbook/sheet may have different columns and
 *    order, so we read the header row at runtime and match columns by header
 *    name (aliases), not fixed indices.
 *  - Matches the crew row by PASSPORT number (falls back to GIVEN NAME+SURNAME).
 *  - ONLY updates rows that already exist — never inserts or deletes rows.
 *  - Writes ONLY the cells whose columns exist in that workbook ("relevant to
 *    the fields being changed"); a workbook that lacks a column is skipped for
 *    that field.
 *  - Fire-and-forget from the UI: failures are logged, never block the user.
 */
import { getSpConfig, getGraphToken, resolveSpSite } from '@/lib/sharepoint-sync.server'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

export const GRAPH = 'https://graph.microsoft.com/v1.0'

// The three trackers in PortOperationsandAgency. These files get RE-DATED in place
// (e.g. "…Acc 08June26" → "…Acc as of 28June26"), so we match on a STABLE name
// prefix (normalized) rather than the full dated filename.
export const VISA_WORKBOOKS = [
  'Crew Visa Tracker 2026',
  'Visa Application Tracker 2026',
  '2026 Visa Application Tracker Acc',
]

// Canonical field → header aliases (compared case-insensitively, spaces/punct stripped)
// and how to render the value for Excel.
type FieldSpec = { dbKey: string; aliases: string[]; kind: 'text' | 'date' | 'status' }

// App visa-status → label written into the tracker's STATUS column.
// (Tunable: the trackers also use operational values like "closed"/"on board".)
export const STATUS_MAP: Record<string, string> = {
  draft: 'Draft', pending_docs: 'Pending Docs', need_to_apply: 'Need to Apply',
  submitted: 'Submitted', in_review: 'In Review', processing: 'Processing',
  approved: 'Approved', completed: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
}

const FIELDS: FieldSpec[] = [
  { dbKey: 'status',             aliases: ['STATUS'],                                   kind: 'status' },
  { dbKey: 'visa_number',        aliases: ['VISA REF', 'VISA REFERENCE', 'VISA NO', 'VISA NUMBER'], kind: 'text' },
  { dbKey: 'visa_issuance_date', aliases: ['VISA ISSUANCE', 'VISA ISSUE', 'ISSUANCE'],  kind: 'date' },
  { dbKey: 'visa_expiry',        aliases: ['VISA EXPIRY', 'VISA EXP'],                  kind: 'date' },
  { dbKey: 'sign_on_date',       aliases: ['SIGN ON', 'SIGNON'],                        kind: 'date' },
  { dbKey: 'sign_off_date',      aliases: ['SIGN OFF', 'SIGNOFF'],                      kind: 'date' },
  { dbKey: 'arrival_date',       aliases: ['ARRIVAL'],                                  kind: 'date' },
  { dbKey: 'first_entry_expiry', aliases: ['1ST ENTRY EXPIRY', 'FIRST ENTRY EXPIRY', '1ST ENTRY'], kind: 'date' },
]
export const PASSPORT_ALIASES = ['PASSPORT', 'PASSPORT NO', 'PASSPORT NUMBER']
export const GIVEN_ALIASES = ['GIVEN NAME', 'FIRST NAME', 'NAME']
export const SURNAME_ALIASES = ['SURNAME', 'LAST NAME', 'FAMILY NAME']

export const norm = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const normName = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z]/g, '')

/** YYYY-MM-DD (or ISO) → Excel serial date number (1900 date system). */
export function toExcelSerial(value: string): number | null {
  const d = new Date(value.length <= 10 ? value + 'T00:00:00Z' : value)
  if (isNaN(d.getTime())) return null
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.round(ms / 86400000) + 25569 // days since 1899-12-30
}

/** 0-based column index → Excel column letters (0→A, 26→AA). */
export function colLetters(idx: number): string {
  let n = idx, s = ''
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return s
}

export async function gfetch(token: string, url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

/** Resolve a workbook's driveItem id by a STABLE name prefix within the site's drive.
 *  Tolerant of re-dating: matches the .xlsx whose normalized name starts with the prefix. */
async function resolveWorkbookId(token: string, siteId: string, prefix: string): Promise<string | null> {
  const prefixNorm = norm(prefix)
  // Search a leading word of the prefix (drive search needs a query term).
  const q = prefix.split(/\s+/).slice(0, 2).join(' ')
  const res = await gfetch(token, `${GRAPH}/sites/${siteId}/drive/root/search(q='${encodeURIComponent(q)}')?$select=id,name,file&$top=200`)
  if (!res.ok) return null
  const items: any[] = ((await res.json()) as any).value ?? []
  const xlsx = items.filter(i => i.file && /\.xlsx$/i.test(i.name ?? ''))
  const exact = xlsx.find(i => norm(i.name).startsWith(prefixNorm))
  return (exact ?? xlsx[0])?.id ?? null
}

export type SheetData = { name: string; headerRow: number; headers: string[]; values: any[][]; address: string }

/** GET a worksheet's used range (raw values). */
export async function readSheet(token: string, siteId: string, itemId: string, sheet: string): Promise<SheetData | null> {
  const res = await gfetch(
    token,
    `${GRAPH}/sites/${siteId}/drive/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheet)}')/usedRange(valuesOnly=true)?$select=address,values`,
  )
  if (!res.ok) return null
  const json: any = await res.json()
  const values: any[][] = json.values ?? []
  // Find the header row: the first row that contains a PASSPORT or GIVEN NAME header.
  let headerRow = -1
  for (let r = 0; r < Math.min(values.length, 8); r++) {
    const set = values[r].map(norm)
    if (PASSPORT_ALIASES.some(a => set.includes(norm(a))) || GIVEN_ALIASES.some(a => set.includes(norm(a)))) {
      headerRow = r; break
    }
  }
  if (headerRow < 0) return null
  return { name: sheet, headerRow, headers: values[headerRow].map(norm), values, address: json.address ?? '' }
}

export function findCol(headers: string[], aliases: string[]): number {
  const wanted = aliases.map(norm)
  return headers.findIndex(h => wanted.includes(h))
}

export async function listSheets(token: string, siteId: string, itemId: string): Promise<string[]> {
  const res = await gfetch(token, `${GRAPH}/sites/${siteId}/drive/items/${itemId}/workbook/worksheets?$select=name`)
  if (!res.ok) return []
  const json: any = await res.json()
  return (json.value ?? []).map((w: any) => w.name as string)
}

/** Parse the top-left cell of an A1-style address (e.g. "Sheet1!B3:P40" → {row:2,col:1}). */
export function parseAnchor(address: string): { row: number; col: number } {
  const m = /!?\$?([A-Z]+)\$?(\d+)/.exec(address.split(':')[0] ?? '')
  if (!m) return { row: 0, col: 0 }
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: parseInt(m[2], 10) - 1, col: col - 1 }
}

export type ExcelWritebackResult = {
  ok: boolean
  updated: { workbook: string; sheet: string; cell: string; field: string; value: any }[]
  skipped: { workbook: string; reason: string }[]
  error?: string
}

/**
 * Push one visa application's current values into the Excel trackers.
 * @param dryRun when true, computes the cells/values but performs no writes.
 */
export async function pushVisaToExcel(visaId: string, opts: { dryRun?: boolean } = {}): Promise<ExcelWritebackResult> {
  const result: ExcelWritebackResult = { ok: true, updated: [], skipped: [] }
  try {
    const { data: visa } = await (supabaseAdmin as any)
      .from('visa_applications')
      .select('id, given_name, surname, passport_number, status, visa_number, visa_issuance_date, visa_expiry, sign_on_date, sign_off_date, arrival_date, first_entry_expiry, yacht:yachts(vessel_name)')
      .eq('id', visaId)
      .maybeSingle()
    if (!visa) return { ...result, ok: false, error: 'visa not found' }

    const passport = norm(visa.passport_number)
    const given = normName(visa.given_name)
    const surname = normName(visa.surname)
    if (!passport && !(given && surname)) {
      return { ...result, ok: false, error: 'no passport or name to match on' }
    }
    const vessel = visa.yacht?.vessel_name as string | undefined

    const cfg = await getSpConfig()
    const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
    const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

    for (const filename of VISA_WORKBOOKS) {
      const itemId = await resolveWorkbookId(token, siteId, filename)
      if (!itemId) { result.skipped.push({ workbook: filename, reason: 'file not found in site drive' }); continue }

      // Candidate sheets: the vessel's own sheet first (per-yacht trackers),
      // else scan all sheets (flat trackers) up to a sane cap.
      const allSheets = await listSheets(token, siteId, itemId)
      let candidates: string[]
      const vesselSheet = vessel ? allSheets.find(s => normName(s) === normName(vessel)) : undefined
      if (vesselSheet) candidates = [vesselSheet]
      else candidates = allSheets.slice(0, 40) // cap; logged below if truncated
      if (!vesselSheet && allSheets.length > 40) {
        console.warn(`[visa-excel] ${filename}: scanning first 40/${allSheets.length} sheets (no vessel match for "${vessel}")`)
      }

      let matched = false
      for (const sheetName of candidates) {
        const sheet = await readSheet(token, siteId, itemId, sheetName)
        if (!sheet) continue
        const ppCol = findCol(sheet.headers, PASSPORT_ALIASES)
        const givenCol = findCol(sheet.headers, GIVEN_ALIASES)
        const surnameCol = findCol(sheet.headers, SURNAME_ALIASES)

        // Find the data row matching this crew member.
        let rowIdx = -1
        for (let r = sheet.headerRow + 1; r < sheet.values.length; r++) {
          const row = sheet.values[r]
          if (passport && ppCol >= 0 && norm(row[ppCol]) === passport) { rowIdx = r; break }
          if (given && surname && givenCol >= 0 && surnameCol >= 0 &&
              normName(row[givenCol]) === given && normName(row[surnameCol]) === surname) { rowIdx = r; break }
        }
        if (rowIdx < 0) continue
        matched = true

        // Compute which individual cells need changing. We PATCH each cell
        // separately (never the whole row) so formula cells in other columns
        // are never overwritten with static values.
        const anchor = parseAnchor(sheet.address)
        const existing = sheet.values[rowIdx]
        const excelRow = anchor.row + rowIdx + 1
        const changes: { cell: string; field: string; value: any }[] = []
        for (const f of FIELDS) {
          const col = findCol(sheet.headers, f.aliases)
          if (col < 0) continue
          const raw = (visa as any)[f.dbKey]
          if (raw === null || raw === undefined || raw === '') continue
          const value = f.kind === 'date'
            ? toExcelSerial(String(raw))
            : f.kind === 'status'
              ? (STATUS_MAP[String(raw)] ?? String(raw))
              : String(raw)
          if (value === null) continue
          if (norm(existing[col]) === norm(value)) continue // unchanged
          changes.push({ cell: `${colLetters(anchor.col + col)}${excelRow}`, field: f.dbKey, value })
        }

        if (changes.length === 0) { result.skipped.push({ workbook: filename, reason: `row found in "${sheetName}" but nothing to update` }); break }

        if (!opts.dryRun) {
          let failed = false
          for (const c of changes) {
            const patch = await gfetch(
              token,
              `${GRAPH}/sites/${siteId}/drive/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${c.cell}')`,
              { method: 'PATCH', body: JSON.stringify({ values: [[c.value]] }) },
            )
            if (!patch.ok) {
              const txt = await patch.text().catch(() => '')
              result.skipped.push({ workbook: filename, reason: `PATCH ${c.cell} failed (${patch.status}): ${txt.slice(0, 140)}` })
              failed = true; break
            }
          }
          if (failed) break
        }
        for (const c of changes) result.updated.push({ workbook: filename, sheet: sheetName, ...c })
        break // one matching row per workbook
      }
      if (!matched) result.skipped.push({ workbook: filename, reason: `no matching row (passport ${visa.passport_number ?? '—'})` })
    }
    return result
  } catch (e: any) {
    return { ...result, ok: false, error: e?.message ?? String(e) }
  }
}
