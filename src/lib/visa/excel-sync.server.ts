/**
 * Visa ⇄ Excel tracker SYNC (Microsoft Graph workbook API).
 *
 * Extends the proven app→Excel write-back (excel-writeback.server.ts) with the
 * reverse direction (Excel→app reconcile) and a snapshot-based two-way sync
 * (newest-edit-wins, built on top).
 *
 * Trackers (PortOperationsandAgency site), resolved by STABLE name prefix because
 * the files get re-dated (e.g. "…Acc 08June26" → "…Acc as of 28June26"):
 *   - crew_visa     : Crew Visa Tracker — 178 per-vessel sheets, full crew/visa detail
 *   - visa_app_acc  : 2026 Visa Application Tracker Acc — per-year ledger
 *   - visa_app      : Visa Application Tracker — per-month (bloated ranges; not synced yet)
 */
import {
  GRAPH, gfetch, norm, normName, readSheet, listSheets, findCol,
  PASSPORT_ALIASES, GIVEN_ALIASES, SURNAME_ALIASES,
} from '@/lib/visa/excel-writeback.server'
import { getSpConfig, getGraphToken, resolveSpSite } from '@/lib/sharepoint-sync.server'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

export const TRACKERS = [
  { key: 'crew_visa',    label: 'Crew Visa Tracker',                prefix: 'CREWVISATRACKER2026' },
  { key: 'visa_app',     label: 'Visa Application Tracker',         prefix: 'VISAAPPLICATIONTRACKER2026' },
  { key: 'visa_app_acc', label: '2026 Visa Application Tracker Acc', prefix: '2026VISAAPPLICATIONTRACKERACC' },
] as const

// Columns we can read FROM the sheets (superset of the write-back). norm()-compared.
export const IMPORT_ALIASES: Record<string, string[]> = {
  given_name:         GIVEN_ALIASES,
  surname:            SURNAME_ALIASES,
  passport_number:    PASSPORT_ALIASES,
  passport_expiry:    ['EXPIRY', 'PASSPORT EXPIRY', 'PP EXPIRY'],   // bare EXPIRY sits next to PASSPORT
  date_of_birth:      ['DOB', 'DATE OF BIRTH', 'D.O.B'],
  nationality:        ['NATIONALITY', 'NATION', 'ICAO'],
  rank_rating:        ['RANK', 'RATING', 'RANK OR RATING', 'RANK RATING', 'POSITION', 'ROLE'],
  vessel_name:        ['VESSEL', 'VESSEL NAME', 'YACHT', 'BOAT'],
  status:             ['STATUS'],
  visa_number:        ['VISA REF', 'VISA REFERENCE', 'VISA NO', 'VISA NUMBER'],
  visa_issuance_date: ['VISA ISSUANCE', 'VISA ISSUE', 'ISSUANCE', 'ISSUE DATE'],
  visa_expiry:        ['VISA EXPIRY', 'VISA EXP'],   // NOT bare EXPIRY (that is passport expiry)
  sign_on_date:       ['SIGN ON', 'SIGNON', 'SIGN ON DATE'],
  sign_off_date:      ['SIGN OFF', 'SIGNOFF', 'SIGN OFF DATE'],
  arrival_date:       ['ARRIVAL', 'ARRIVAL DATE', 'DATE OF ARRIVAL'],
  first_entry_expiry: ['1ST ENTRY EXPIRY', 'FIRST ENTRY EXPIRY', '1ST ENTRY'],
}

// Fields on visa_applications that are synced both ways.
const VISA_SYNC_FIELDS = ['status', 'visa_number', 'visa_issuance_date', 'visa_expiry', 'sign_on_date', 'sign_off_date', 'arrival_date', 'first_entry_expiry'] as const
const DATE_FIELDS = new Set(['visa_issuance_date', 'visa_expiry', 'sign_on_date', 'sign_off_date', 'arrival_date', 'first_entry_expiry', 'passport_expiry', 'date_of_birth'])

const APP_STATUSES = ['draft', 'pending_docs', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled', 'expired', 'amendment_required']
function normStatus(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  if (APP_STATUSES.includes(s.replace(/\s+/g, '_'))) return s.replace(/\s+/g, '_')
  if (/(approv|issued|complete|closed|done|granted|collected|on ?board)/.test(s)) return 'approved'
  if (/cancel/.test(s)) return 'cancelled'
  if (/(reject|declin)/.test(s)) return 'rejected'
  if (/expir/.test(s)) return 'expired'
  if (/(amend|correct|resubmit|return)/.test(s)) return 'amendment_required'
  if (/(submit|applied|lodged|process|review|progress)/.test(s)) return 'submitted'
  if (/(pending|await|docs|need|apply|draft|new)/.test(s)) return 'pending_docs'
  if (/(sign ?off|signed ?off)/.test(s)) return 'signed off' // allowed by the status check
  // Unknown free text → null: visa_applications now has a status CHECK constraint,
  // so raw sheet text must never be written. The create path falls back by expiry.
  return null
}

/** Excel serial (1900 system) → ISO date (YYYY-MM-DD). */
function fromExcelSerial(n: number): string | null {
  if (!isFinite(n) || n < 1 || n > 80000) return null
  const d = new Date((Math.round(n) - 25569) * 86400000)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
/** Parse a sheet cell into an ISO date, handling Excel serials + text dates. */
function parseSheetDate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return fromExcelSerial(v)
  const s = String(v).trim()
  if (/^\d+(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s))
  const iso = new Date(s)
  if (!isNaN(iso.getTime()) && /\d{4}/.test(s)) return iso.toISOString().slice(0, 10)
  const m = /^(\d{1,2})[\/\-. ]([A-Za-z]{3,}|\d{1,2})[\/\-. ](\d{2,4})$/.exec(s)
  if (m) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const mon = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) - 1 : months.indexOf(m[2].slice(0, 3).toLowerCase())
    let yr = parseInt(m[3], 10); if (yr < 100) yr += 2000
    if (mon >= 0 && mon < 12) {
      const dd = new Date(Date.UTC(yr, mon, parseInt(m[1], 10)))
      if (!isNaN(dd.getTime())) return dd.toISOString().slice(0, 10)
    }
  }
  return null
}

async function resolveTrackerItem(token: string, siteId: string, prefixNorm: string): Promise<{ id: string; name: string } | null> {
  const seen = new Map<string, string>()
  for (const q of ['Visa', 'Tracker']) {
    const res = await gfetch(token, `${GRAPH}/sites/${siteId}/drive/root/search(q='${encodeURIComponent(q)}')?$select=id,name,file&$top=200`)
    if (!res.ok) continue
    const json: any = await res.json()
    for (const it of (json.value ?? [])) if (it.file && /\.xlsx$/i.test(it.name ?? '')) seen.set(it.id, it.name)
  }
  for (const [id, name] of seen) if (norm(name).startsWith(prefixNorm)) return { id, name }
  return null
}

// ───────────────────────── Inspection (read-only, no PII) ─────────────────────────
export type TrackerInspectSheet = {
  name: string; headerRow: number | null; headers: string[]
  dataRows: number; populatedRows: number; mapped: Record<string, number>
}
export type TrackerInspect = {
  key: string; label: string; prefix: string; matchedName: string | null
  sheetCount: number; sheetNames: string[]; sheets: TrackerInspectSheet[]; error?: string
}

/** Raw peek at the top-left block of one sheet (diagnostic: find header layout). */
export async function peekSheet(trackerKey: string, sheet: string, rows = 8, cols = 16): Promise<{ ok: boolean; matchedName?: string; address?: string; grid?: any[][]; error?: string }> {
  try {
    const t = TRACKERS.find(x => x.key === trackerKey)
    if (!t) return { ok: false, error: `unknown tracker ${trackerKey}` }
    const cfg = await getSpConfig()
    const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
    const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)
    const item = await resolveTrackerItem(token, siteId, t.prefix)
    if (!item) return { ok: false, error: 'workbook not found' }
    const res = await gfetch(token, `${GRAPH}/sites/${siteId}/drive/items/${item.id}/workbook/worksheets('${encodeURIComponent(sheet)}')/usedRange(valuesOnly=true)?$select=address,values`)
    if (!res.ok) return { ok: false, error: `read failed ${res.status}: ${(await res.text()).slice(0, 200)}` }
    const json: any = await res.json()
    const grid = (json.values ?? []).slice(0, rows).map((r: any[]) => r.slice(0, cols))
    return { ok: true, matchedName: item.name, address: json.address, grid }
  } catch (e: any) { return { ok: false, error: e?.message ?? String(e) } }
}

export async function inspectTrackers(opts: { trackerKey?: string; sampleSheets?: number; sheetOffset?: number } = {}): Promise<{ ok: boolean; trackers: TrackerInspect[]; error?: string }> {
  try {
    const cfg = await getSpConfig()
    const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
    const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)
    const sample = Math.max(0, opts.sampleSheets ?? 4)
    const offset = Math.max(0, opts.sheetOffset ?? 0)
    const targets = opts.trackerKey ? TRACKERS.filter(t => t.key === opts.trackerKey) : TRACKERS

    const out: TrackerInspect[] = []
    for (const t of targets) {
      const item = await resolveTrackerItem(token, siteId, t.prefix)
      if (!item) { out.push({ key: t.key, label: t.label, prefix: t.prefix, matchedName: null, sheetCount: 0, sheetNames: [], sheets: [] }); continue }
      const allSheets = await listSheets(token, siteId, item.id)
      const sheets: TrackerInspectSheet[] = []
      for (const sheetName of allSheets.slice(offset, offset + sample)) {
        const sd = await readSheet(token, siteId, item.id, sheetName)
        if (!sd) { sheets.push({ name: sheetName, headerRow: null, headers: [], dataRows: 0, populatedRows: 0, mapped: {} }); continue }
        const mapped: Record<string, number> = {}
        for (const [field, aliases] of Object.entries(IMPORT_ALIASES)) { const col = findCol(sd.headers, aliases); if (col >= 0) mapped[field] = col }
        const ppCol = mapped.passport_number ?? -1
        const gnCol = mapped.given_name ?? -1
        let populated = 0
        for (let r = sd.headerRow + 1; r < sd.values.length; r++) { const row = sd.values[r]; if ((ppCol >= 0 && norm(row[ppCol])) || (gnCol >= 0 && normName(row[gnCol]))) populated++ }
        sheets.push({ name: sheetName, headerRow: sd.headerRow, headers: (sd.values[sd.headerRow] ?? []).map((h) => String(h ?? '')), dataRows: Math.max(0, sd.values.length - sd.headerRow - 1), populatedRows: populated, mapped })
      }
      out.push({ key: t.key, label: t.label, prefix: t.prefix, matchedName: item.name, sheetCount: allSheets.length, sheetNames: allSheets, sheets })
    }
    return { ok: true, trackers: out }
  } catch (e: any) { return { ok: false, trackers: [], error: e?.message ?? String(e) } }
}

// ───────────────────────── Excel → app reconcile (crew_visa) ─────────────────────────
const db = () => supabaseAdmin as any

type RowAction = {
  vessel: string; given: string; surname: string; passport: string
  action: 'update' | 'create' | 'unchanged' | 'skip'
  visaId?: string; changes?: Record<string, { from: any; to: any }>; reason?: string
}
export type ReconcileResult = {
  ok: boolean; mode: 'dry' | 'apply'
  vesselOffset: number; vesselLimit: number; vesselsProcessed: number; nextOffset: number | null
  summary: Record<string, number>; actions: RowAction[]; runId?: string; error?: string
}

/** Build the canonical field map from a crew_visa sheet row. */
function rowToVals(row: any[], mapped: Record<string, number>): Record<string, any> {
  const get = (k: string) => { const c = mapped[k]; return c == null || c < 0 ? undefined : row[c] }
  const out: Record<string, any> = {}
  const given = String(get('given_name') ?? '').trim()
  const surname = String(get('surname') ?? '').trim()
  const passport = String(get('passport_number') ?? '').trim()
  if (given) out.given_name = given
  if (surname) out.surname = surname
  if (passport) out.passport_number = passport
  const nat = String(get('nationality') ?? '').trim(); if (nat) out.nationality = nat
  const rank = String(get('rank_rating') ?? '').trim(); if (rank) out.rank_rating = rank
  const status = normStatus(get('status')); if (status) out.status = status
  const vnum = String(get('visa_number') ?? '').trim(); if (vnum) out.visa_number = vnum
  for (const f of ['visa_issuance_date', 'visa_expiry', 'sign_on_date', 'sign_off_date', 'arrival_date', 'first_entry_expiry']) {
    const d = parseSheetDate(get(f)); if (d) out[f] = d
  }
  return out
}

/** Compare two canonical values for a field (dates normalized to YYYY-MM-DD). */
function sameVal(field: string, a: any, b: any): boolean {
  if (a == null || a === '') return b == null || b === ''
  if (DATE_FIELDS.has(field)) return String(a).slice(0, 10) === String(b).slice(0, 10)
  return norm(a) === norm(b)
}

/**
 * Reconcile the Crew Visa Tracker (per-vessel sheets) INTO the app.
 * Sheets are authoritative here (the "update the app against the spreadsheets" pass).
 * Chunked over vessels via vesselOffset/vesselLimit; returns nextOffset to continue.
 */
export async function reconcileCrewVisa(opts: {
  vesselOffset?: number; vesselLimit?: number; dryRun?: boolean; createMissing?: boolean
} = {}): Promise<ReconcileResult> {
  const vesselOffset = Math.max(0, opts.vesselOffset ?? 0)
  const vesselLimit = Math.max(1, Math.min(opts.vesselLimit ?? 20, 40))
  const dryRun = opts.dryRun ?? true
  const createMissing = opts.createMissing ?? true
  const summary: Record<string, number> = { vessels: 0, sheets_empty: 0, rows: 0, matched: 0, updated: 0, created: 0, unchanged: 0, skipped: 0, fields_changed: 0 }
  const actions: RowAction[] = []
  const ACTION_CAP = 500

  try {
    const cfg = await getSpConfig()
    const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
    const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)
    const t = TRACKERS.find(x => x.key === 'crew_visa')!
    const item = await resolveTrackerItem(token, siteId, t.prefix)
    if (!item) return { ok: false, mode: dryRun ? 'dry' : 'apply', vesselOffset, vesselLimit, vesselsProcessed: 0, nextOffset: null, summary, actions, error: 'Crew Visa Tracker not found in site drive' }

    const allSheets = await listSheets(token, siteId, item.id)
    const slice = allSheets.slice(vesselOffset, vesselOffset + vesselLimit)
    const nextOffset = vesselOffset + vesselLimit < allSheets.length ? vesselOffset + vesselLimit : null

    const { data: yachts } = await db().from('yachts').select('id, vessel_name')
    const yachtByName = new Map<string, string>()
    for (const y of (yachts ?? [])) if (y.vessel_name) yachtByName.set(normName(y.vessel_name), y.id)

    const { data: visas } = await db().from('visa_applications')
      .select('id, given_name, surname, passport_number, vessel_name, yacht_id, status, visa_number, visa_issuance_date, visa_expiry, sign_on_date, sign_off_date, arrival_date, first_entry_expiry, updated_at')
    const byPassport = new Map<string, any[]>()
    const byNameVessel = new Map<string, any[]>()
    for (const v of (visas ?? [])) {
      if (v.passport_number) { const k = norm(v.passport_number); if (!byPassport.has(k)) byPassport.set(k, []); byPassport.get(k)!.push(v) }
      const nk = normName(v.given_name) + '|' + normName(v.surname) + '|' + normName(v.vessel_name)
      if (!byNameVessel.has(nk)) byNameVessel.set(nk, []); byNameVessel.get(nk)!.push(v)
    }
    const { data: passports } = await db().from('crew_passports').select('crew_id, passport_number')
    const crewByPassport = new Map<string, string>()
    for (const p of (passports ?? [])) if (p.passport_number) crewByPassport.set(norm(p.passport_number), p.crew_id)

    const toCreate: any[] = []
    const toUpdate: { id: string; patch: Record<string, any> }[] = []

    for (const sheetName of slice) {
      summary.vessels++
      const sd = await readSheet(token, siteId, item.id, sheetName)
      if (!sd) { summary.sheets_empty++; continue }
      const mapped: Record<string, number> = {}
      for (const [field, aliases] of Object.entries(IMPORT_ALIASES)) { const c = findCol(sd.headers, aliases); if (c >= 0) mapped[field] = c }
      const yachtId = yachtByName.get(normName(sheetName)) ?? null

      // A vessel sheet often lists the same crew across multiple rows (past
      // voyages / renewals). Collapse to ONE canonical row per crew — the
      // latest visa (by issuance, then expiry) — so we sync current state and
      // never create duplicates.
      const groups = new Map<string, Record<string, any>>()
      const order: string[] = []
      for (let r = sd.headerRow + 1; r < sd.values.length; r++) {
        const v = rowToVals(sd.values[r], mapped)
        if (!v.passport_number && !(v.given_name && v.surname)) continue
        const key = v.passport_number ? 'P:' + norm(v.passport_number) : 'N:' + normName(v.given_name) + '|' + normName(v.surname)
        const prev = groups.get(key)
        if (!prev) { groups.set(key, v); order.push(key) }
        else {
          const newer = (v.visa_issuance_date ?? '') > (prev.visa_issuance_date ?? '') ||
            ((v.visa_issuance_date ?? '') === (prev.visa_issuance_date ?? '') && (v.visa_expiry ?? '') > (prev.visa_expiry ?? ''))
          // merge: prefer newer row's values, but keep any field the newer row lacks
          groups.set(key, newer ? { ...prev, ...v } : { ...v, ...prev })
        }
      }

      for (const key of order) {
        const vals = groups.get(key)!
        summary.rows++
        const given = vals.given_name ?? '', surname = vals.surname ?? '', passport = vals.passport_number ?? ''

        let match: any | undefined
        if (passport) {
          const cands = byPassport.get(norm(passport)) ?? []
          match = cands.find(c => normName(c.vessel_name) === normName(sheetName)) ?? cands[0]
        }
        if (!match && given && surname) {
          match = (byNameVessel.get(normName(given) + '|' + normName(surname) + '|' + normName(sheetName)) ?? [])[0]
        }

        if (match) {
          summary.matched++
          const changes: Record<string, { from: any; to: any }> = {}
          for (const f of VISA_SYNC_FIELDS) {
            const to = (vals as any)[f]
            if (to == null || to === '') continue
            if (!sameVal(f, match[f], to)) changes[f] = { from: match[f] ?? null, to }
          }
          if (Object.keys(changes).length === 0) { summary.unchanged++; if (actions.length < ACTION_CAP) actions.push({ vessel: sheetName, given, surname, passport, action: 'unchanged', visaId: match.id }); continue }
          summary.updated++; summary.fields_changed += Object.keys(changes).length
          if (actions.length < ACTION_CAP) actions.push({ vessel: sheetName, given, surname, passport, action: 'update', visaId: match.id, changes })
          if (!dryRun) {
            const patch: Record<string, any> = {}
            for (const f of Object.keys(changes)) patch[f] = changes[f].to
            patch.sharepoint_synced_at = new Date().toISOString()
            toUpdate.push({ id: match.id, patch })
          }
        } else if (createMissing) {
          summary.created++
          if (actions.length < ACTION_CAP) actions.push({ vessel: sheetName, given, surname, passport, action: 'create', changes: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { from: null, to: v }])) })
          if (!dryRun) {
            // Fallback status: historical rows without a STATUS import as 'expired'
            // when their visa expiry is past, so the pipeline isn't flooded with
            // stale 'submitted' applications.
            const todayIso = new Date().toISOString().slice(0, 10)
            const fallback = vals.visa_expiry && String(vals.visa_expiry) < todayIso ? 'expired' : 'submitted'
            toCreate.push({
              ...vals, vessel_name: sheetName, yacht_id: yachtId,
              crew_member_id: passport ? (crewByPassport.get(norm(passport)) ?? null) : null,
              country_code: 'AE', status: vals.status ?? fallback, sharepoint_synced_at: new Date().toISOString(),
            })
          }
        } else {
          summary.skipped++
          if (actions.length < ACTION_CAP) actions.push({ vessel: sheetName, given, surname, passport, action: 'skip', reason: 'no match; create disabled' })
        }
      }
    }

    const insertErrors = new Map<string, number>()
    if (!dryRun) {
      for (const u of toUpdate) await db().from('visa_applications').update({ ...u.patch, updated_at: new Date().toISOString() }).eq('id', u.id)
      for (let i = 0; i < toCreate.length; i += 100) {
        const chunk = toCreate.slice(i, i + 100)
        const { error } = await db().from('visa_applications').insert(chunk)
        if (error) {
          // One bad row sinks a whole chunk — retry rows individually so the rest
          // land, and collect the distinct errors for the report.
          for (const row of chunk) {
            const { error: e2 } = await db().from('visa_applications').insert(row)
            if (e2) {
              summary.created--; summary.skipped++
              insertErrors.set(e2.message, (insertErrors.get(e2.message) ?? 0) + 1)
            }
          }
        }
      }
    }
    if (insertErrors.size) {
      // Surface at the FRONT of the actions list so caps never hide them.
      for (const [msg, n] of insertErrors) actions.unshift({ vessel: '—', given: '', surname: '', passport: '', action: 'skip', reason: `insert failed ×${n}: ${msg.slice(0, 160)}` })
    }

    let runId: string | undefined
    try {
      const { data: run } = await db().from('visa_sync_runs').insert({
        direction: 'pull_crew', mode: dryRun ? 'dry' : 'apply', finished_at: new Date().toISOString(),
        vessel_offset: vesselOffset, vessel_limit: vesselLimit, vessels_processed: summary.vessels, next_offset: nextOffset,
        summary, details: actions.slice(0, ACTION_CAP), ok: true,
      }).select('id').single()
      runId = run?.id
    } catch { /* non-fatal */ }

    return { ok: true, mode: dryRun ? 'dry' : 'apply', vesselOffset, vesselLimit, vesselsProcessed: summary.vessels, nextOffset, summary, actions: actions.slice(0, 80), runId }
  } catch (e: any) {
    return { ok: false, mode: dryRun ? 'dry' : 'apply', vesselOffset, vesselLimit, vesselsProcessed: summary.vessels, nextOffset: null, summary, actions, error: e?.message ?? String(e) }
  }
}

// ───────────── Two-way sync (snapshot-guarded, newest-edit-wins) ─────────────
// The app->sheet direction already runs on every visa edit (pushVisaToExcel).
// This adds the sheet->app direction with a per-(visa,workbook) snapshot so a
// sheet change is only pulled into the app when the app did not change that field
// more recently. Conflicts (both sides changed) resolve newest-wins using the
// workbook lastModifiedDateTime vs the record updated_at.
export type TwoWayResult = {
  ok: boolean; mode: 'dry' | 'apply'
  vesselOffset: number; vesselLimit: number; vesselsProcessed: number; nextOffset: number | null
  summary: Record<string, number>
  actions: { vessel: string; passport: string; given: string; surname: string; pulled: string[]; conflicts: string[] }[]
  error?: string
}

export async function syncCrewVisaTwoWay(opts: { vesselOffset?: number; vesselLimit?: number; dryRun?: boolean } = {}): Promise<TwoWayResult> {
  const vesselOffset = Math.max(0, opts.vesselOffset ?? 0)
  const vesselLimit = Math.max(1, Math.min(opts.vesselLimit ?? 20, 40))
  const dryRun = opts.dryRun ?? true
  const summary: Record<string, number> = { vessels: 0, sheets_empty: 0, matched: 0, pulled_fields: 0, conflicts: 0, agreed: 0, unmatched: 0 }
  const actions: TwoWayResult['actions'] = []
  try {
    const cfg = await getSpConfig()
    const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
    const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)
    const t = TRACKERS.find(x => x.key === 'crew_visa')!
    const item = await resolveTrackerItem(token, siteId, t.prefix)
    if (!item) return { ok: false, mode: dryRun ? 'dry' : 'apply', vesselOffset, vesselLimit, vesselsProcessed: 0, nextOffset: null, summary, actions, error: 'Crew Visa Tracker not found' }

    // Workbook last-modified — the best available "sheet changed at" signal.
    let fileMtime = 0
    const metaRes = await gfetch(token, `${GRAPH}/sites/${siteId}/drive/items/${item.id}?$select=lastModifiedDateTime`)
    if (metaRes.ok) { const m: any = await metaRes.json(); fileMtime = Date.parse(m.lastModifiedDateTime ?? '') || 0 }

    const allSheets = await listSheets(token, siteId, item.id)
    const slice = allSheets.slice(vesselOffset, vesselOffset + vesselLimit)
    const nextOffset = vesselOffset + vesselLimit < allSheets.length ? vesselOffset + vesselLimit : null

    const { data: visas } = await db().from('visa_applications')
      .select('id, given_name, surname, passport_number, vessel_name, status, visa_number, visa_issuance_date, visa_expiry, sign_on_date, sign_off_date, arrival_date, first_entry_expiry, updated_at')
    const byPassport = new Map<string, any[]>()
    const byNameVessel = new Map<string, any[]>()
    for (const v of (visas ?? [])) {
      if (v.passport_number) { const k = norm(v.passport_number); if (!byPassport.has(k)) byPassport.set(k, []); byPassport.get(k)!.push(v) }
      const nk = normName(v.given_name) + '|' + normName(v.surname) + '|' + normName(v.vessel_name)
      if (!byNameVessel.has(nk)) byNameVessel.set(nk, []); byNameVessel.get(nk)!.push(v)
    }
    const { data: states } = await db().from('visa_excel_sync_state').select('visa_application_id, snapshot').eq('workbook', 'crew_visa')
    const snapByVisa = new Map<string, Record<string, any>>()
    for (const s of (states ?? [])) snapByVisa.set(s.visa_application_id, s.snapshot ?? {})

    const appPatches: { id: string; patch: Record<string, any> }[] = []
    const snapUpserts: any[] = []

    for (const sheetName of slice) {
      summary.vessels++
      const sd = await readSheet(token, siteId, item.id, sheetName)
      if (!sd) { summary.sheets_empty++; continue }
      const mapped: Record<string, number> = {}
      for (const [field, aliases] of Object.entries(IMPORT_ALIASES)) { const c = findCol(sd.headers, aliases); if (c >= 0) mapped[field] = c }

      // De-dupe to the latest visa per crew (same rule as the pull).
      const groups = new Map<string, Record<string, any>>()
      for (let r = sd.headerRow + 1; r < sd.values.length; r++) {
        const v = rowToVals(sd.values[r], mapped)
        if (!v.passport_number && !(v.given_name && v.surname)) continue
        const key = v.passport_number ? 'P:' + norm(v.passport_number) : 'N:' + normName(v.given_name) + '|' + normName(v.surname)
        const prev = groups.get(key)
        if (!prev || (v.visa_issuance_date ?? '') > (prev.visa_issuance_date ?? '')) groups.set(key, prev ? { ...prev, ...v } : v)
      }

      for (const vals of groups.values()) {
        const passport = vals.passport_number ?? ''
        let match: any | undefined
        if (passport) { const c = byPassport.get(norm(passport)) ?? []; match = c.find(x => normName(x.vessel_name) === normName(sheetName)) ?? c[0] }
        if (!match && vals.given_name && vals.surname) match = (byNameVessel.get(normName(vals.given_name) + '|' + normName(vals.surname) + '|' + normName(sheetName)) ?? [])[0]
        if (!match) { summary.unmatched++; continue }
        summary.matched++

        const snap = snapByVisa.get(match.id) ?? {}
        const appNewer = (Date.parse(match.updated_at ?? '') || 0) >= fileMtime
        const patch: Record<string, any> = {}
        const nextSnap: Record<string, any> = { ...snap }
        const pulled: string[] = []
        const conflicts: string[] = []

        for (const f of VISA_SYNC_FIELDS) {
          const appVal = match[f] ?? null
          const sheetVal = (vals as any)[f] ?? null
          if (sheetVal == null || sheetVal === '') { nextSnap[f] = appVal; continue }
          if (sameVal(f, appVal, sheetVal)) { summary.agreed++; nextSnap[f] = appVal; continue }
          const snapVal = snap[f] ?? null
          const appChanged = !sameVal(f, appVal, snapVal)
          const sheetChanged = !sameVal(f, sheetVal, snapVal)
          if (sheetChanged && !appChanged) { patch[f] = sheetVal; pulled.push(f); nextSnap[f] = sheetVal }
          else if (appChanged && !sheetChanged) { nextSnap[f] = appVal } // app newer; auto-push keeps the sheet in step
          else { conflicts.push(f); if (appNewer) { nextSnap[f] = appVal } else { patch[f] = sheetVal; pulled.push(f); nextSnap[f] = sheetVal } }
        }

        if (pulled.length) summary.pulled_fields += pulled.length
        if (conflicts.length) summary.conflicts += conflicts.length
        if (pulled.length || conflicts.length) actions.push({ vessel: sheetName, passport, given: vals.given_name ?? '', surname: vals.surname ?? '', pulled, conflicts })

        if (!dryRun) {
          if (Object.keys(patch).length) appPatches.push({ id: match.id, patch })
          snapUpserts.push({ visa_application_id: match.id, workbook: 'crew_visa', sheet: sheetName, match_passport: passport || null, snapshot: nextSnap, sheet_file_mtime: fileMtime ? new Date(fileMtime).toISOString() : null, app_updated_at: match.updated_at ?? null, last_synced_at: new Date().toISOString() })
        }
      }
    }

    if (!dryRun) {
      for (const p of appPatches) await db().from('visa_applications').update({ ...p.patch, updated_at: new Date().toISOString() }).eq('id', p.id)
      for (let i = 0; i < snapUpserts.length; i += 100) {
        await db().from('visa_excel_sync_state').upsert(snapUpserts.slice(i, i + 100), { onConflict: 'visa_application_id,workbook' })
      }
    }
    return { ok: true, mode: dryRun ? 'dry' : 'apply', vesselOffset, vesselLimit, vesselsProcessed: summary.vessels, nextOffset, summary, actions: actions.slice(0, 100) }
  } catch (e: any) {
    return { ok: false, mode: dryRun ? 'dry' : 'apply', vesselOffset, vesselLimit, vesselsProcessed: summary.vessels, nextOffset: null, summary, actions, error: e?.message ?? String(e) }
  }
}

// Cron tick: process ONE chunk of vessels per run using a rotating cursor stored
// in visa_sync_runs (direction two_way_cron). Cycles through all vessels over
// several ticks, then wraps back to the start — a hands-free keep-in-sync loop.
export async function runTwoWaySyncTick(vesselLimit = 25): Promise<{ ok: boolean; offset: number; nextOffset: number | null; summary?: Record<string, number>; error?: string }> {
  try {
    const { data: last } = await db().from('visa_sync_runs')
      .select('next_offset').eq('direction', 'two_way_cron').order('started_at', { ascending: false }).limit(1).maybeSingle()
    const offset = last?.next_offset ?? 0
    const r = await syncCrewVisaTwoWay({ vesselOffset: offset, vesselLimit, dryRun: false })
    try {
      await db().from('visa_sync_runs').insert({
        direction: 'two_way_cron', mode: 'apply', finished_at: new Date().toISOString(),
        vessel_offset: offset, vessel_limit: vesselLimit, vessels_processed: r.vesselsProcessed,
        next_offset: r.nextOffset ?? 0, // wrap to 0 when the pass completes
        summary: r.summary, ok: r.ok, error: r.error ?? null,
      })
    } catch { /* logging is best-effort */ }
    return { ok: r.ok, offset, nextOffset: r.nextOffset, summary: r.summary, error: r.error }
  } catch (e: any) {
    return { ok: false, offset: 0, nextOffset: null, error: e?.message ?? String(e) }
  }
}
