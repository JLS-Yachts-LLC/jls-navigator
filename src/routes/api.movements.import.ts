/**
 * Crew movement sheet import — POST /api/movements/import
 *
 * Vessels email their own sign on/off sheets (spreadsheet or PDF). This reads one
 * and returns MATCH PROPOSALS — it never writes. The browser shows the proposals
 * for review and then inserts the confirmed rows through the normal
 * crew_signon_events path, so the existing propagation trigger, crew status
 * updates and SharePoint push all behave exactly as for a hand-entered movement.
 *
 * Body is either:
 *   { csvText }                        — CSV / TSV pasted or read in the browser
 *   { fileBase64, mediaType }          — PDF or image, read by Anthropic vision
 *
 * A sheet commonly lists one row per crew member with SEPARATE "Sign On" and
 * "Sign Off" date columns, so a single row can yield two movements.
 */
import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Accent/case/punctuation-insensitive key for name comparison. */
const nameKey = (s: string) =>
  String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// ── Types ─────────────────────────────────────────────────────────────────────

export type RawMovement = {
  name: string
  event_type: 'sign_on' | 'sign_off' | null
  event_date: string | null      // ISO yyyy-mm-dd, or null when unreadable
  date_raw: string | null        // what the sheet actually said (shown on review)
  port: string | null
  vessel: string | null
  rank: string | null
  ambiguous_date: boolean        // e.g. 05/03/2026 — could be either order
}

export type Proposal = RawMovement & {
  crew: { id: string; name: string; yacht_id: string | null } | null
  candidates: Array<{ id: string; name: string }>
  yacht: { id: string; name: string } | null
  duplicate: boolean
  note: string | null
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/** Split CSV/TSV text into rows of cells, honouring quoted fields. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const delim = (clean.split('\n')[0].match(/\t/g)?.length ?? 0) > (clean.split('\n')[0].match(/,/g)?.length ?? 0) ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', inQ = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQ) {
      if (c === '"') { if (clean[i + 1] === '"') { cell += '"'; i++ } else inQ = false }
      else cell += c
    } else if (c === '"') inQ = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

const HEADERS = {
  name:     ['name', 'crew', 'crew member', 'crew name', 'full name', 'crewmember'],
  first:    ['first name', 'given name', 'given names', 'firstname', 'forename'],
  last:     ['last name', 'surname', 'family name', 'lastname'],
  event:    ['event', 'type', 'movement', 'sign on off', 'sign on / off', 'status', 'action'],
  date:     ['date', 'movement date', 'event date'],
  signOn:   ['sign on', 'sign on date', 'signon', 'on board', 'joining', 'join date', 'embark', 'embarkation'],
  signOff:  ['sign off', 'sign off date', 'signoff', 'leaving', 'departure date', 'disembark', 'disembarkation'],
  port:     ['port', 'location', 'marina', 'place'],
  vessel:   ['vessel', 'yacht', 'boat', 'ship', 'vessel name'],
  rank:     ['rank', 'position', 'rating', 'role', 'rank rating'],
}

const findCol = (headers: string[], names: string[]) =>
  headers.findIndex(h => names.includes(h))

/** dd/mm/yyyy (preferred), yyyy-mm-dd, d MMM yyyy, dd.mm.yy … → ISO. */
export function parseDate(raw: string): { iso: string | null; ambiguous: boolean } {
  const s = String(raw ?? '').trim()
  if (!s) return { iso: null, ambiguous: false }

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)          // ISO
  if (m) return { iso: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, ambiguous: false }

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s)            // d/m/y — UK/UAE order
  if (m) {
    let [, a, b, y] = m
    const yyyy = y.length === 2 ? String(2000 + Number(y)) : y
    let dd = Number(a), mm = Number(b)
    // 13+ in the first slot can only be a day; 13+ in the second means the sheet
    // was written m/d/y, so swap. Otherwise both readings are valid — flag it.
    const ambiguous = dd <= 12 && mm <= 12 && dd !== mm
    if (mm > 12 && dd <= 12) { const t = dd; dd = mm; mm = t }
    if (dd > 31 || mm > 12) return { iso: null, ambiguous: false }
    return { iso: `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, ambiguous }
  }

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  m = /^(\d{1,2})[\s-]*([A-Za-z]{3,})[\s-]*(\d{2,4})$/.exec(s)     // 3 Aug 2026
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    if (mi >= 0) {
      const yyyy = m[3].length === 2 ? String(2000 + Number(m[3])) : m[3]
      return { iso: `${yyyy}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`, ambiguous: false }
    }
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return { iso: d.toISOString().slice(0, 10), ambiguous: false }
  return { iso: null, ambiguous: false }
}

/** "Sign On"/"on"/"joining" → sign_on, "Sign Off"/"off"/"leaving" → sign_off. */
export function parseEventType(raw: string): 'sign_on' | 'sign_off' | null {
  const s = nameKey(raw)
  if (!s) return null
  if (/(sign\s*off|signoff|off\s*board|leav|disembark|depart)/.test(s)) return 'sign_off'
  if (/(sign\s*on|signon|on\s*board|join|embark|arriv)/.test(s)) return 'sign_on'
  if (s === 'off') return 'sign_off'
  if (s === 'on') return 'sign_on'
  return null
}

/** Turn a delimited sheet into raw movements. */
export function movementsFromCsv(text: string): { rows: RawMovement[]; warnings: string[] } {
  const grid = parseDelimited(text)
  const warnings: string[] = []
  if (!grid.length) return { rows: [], warnings: ['The file appeared to be empty.'] }

  // The header is the first row that names something we recognise.
  let headerIdx = grid.findIndex(r => {
    const hs = r.map(c => nameKey(c))
    return findCol(hs, HEADERS.name) >= 0 || findCol(hs, HEADERS.last) >= 0
  })
  if (headerIdx < 0) { headerIdx = 0; warnings.push('No recognisable header row — the first row was assumed to be headings.') }

  const hs = grid[headerIdx].map(c => nameKey(c))
  const col = {
    name: findCol(hs, HEADERS.name), first: findCol(hs, HEADERS.first), last: findCol(hs, HEADERS.last),
    event: findCol(hs, HEADERS.event), date: findCol(hs, HEADERS.date),
    signOn: findCol(hs, HEADERS.signOn), signOff: findCol(hs, HEADERS.signOff),
    port: findCol(hs, HEADERS.port), vessel: findCol(hs, HEADERS.vessel), rank: findCol(hs, HEADERS.rank),
  }
  if (col.name < 0 && col.last < 0) {
    return { rows: [], warnings: [...warnings, 'Could not find a crew name column. Expected a heading like "Name", "Crew" or "Surname".'] }
  }
  if (col.date < 0 && col.signOn < 0 && col.signOff < 0) {
    return { rows: [], warnings: [...warnings, 'Could not find a date column. Expected "Date", "Sign On" or "Sign Off".'] }
  }

  const at = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '')
  const out: RawMovement[] = []

  for (const r of grid.slice(headerIdx + 1)) {
    const name = col.name >= 0
      ? at(r, col.name)
      : [at(r, col.first), at(r, col.last)].filter(Boolean).join(' ')
    if (!nameKey(name)) continue

    const base = {
      name,
      port: at(r, col.port) || null,
      vessel: at(r, col.vessel) || null,
      rank: at(r, col.rank) || null,
    }

    // Layout A: separate Sign On / Sign Off date columns → up to two movements.
    let emitted = false
    for (const [ci, type] of [[col.signOn, 'sign_on'], [col.signOff, 'sign_off']] as const) {
      const raw = at(r, ci as number)
      if (!raw) continue
      const { iso, ambiguous } = parseDate(raw)
      out.push({ ...base, event_type: type as 'sign_on' | 'sign_off', event_date: iso, date_raw: raw, ambiguous_date: ambiguous })
      emitted = true
    }
    if (emitted) continue

    // Layout B: one date column plus an event/type column.
    const raw = at(r, col.date)
    if (!raw) continue
    const { iso, ambiguous } = parseDate(raw)
    out.push({
      ...base,
      event_type: parseEventType(at(r, col.event)),
      event_date: iso, date_raw: raw, ambiguous_date: ambiguous,
    })
  }

  if (!out.length) warnings.push('No crew rows were found under the headings.')
  return { rows: out, warnings }
}

// ── PDF / image via Anthropic ────────────────────────────────────────────────

const DOC_PROMPT = `You are reading a yacht crew SIGN ON / SIGN OFF sheet.
Extract every crew movement listed. Return ONLY a JSON object (no prose, no code fences):
{
  "vessel": string|null,          // vessel/yacht name if printed anywhere on the sheet
  "movements": [
    {
      "name": string,             // crew member's full name as printed
      "event_type": "sign_on" | "sign_off" | null,
      "date": string|null,        // EXACTLY as printed, do not reformat
      "port": string|null,
      "rank": string|null
    }
  ]
}
Rules:
- A row with BOTH a sign-on and a sign-off date produces TWO movements for that person.
- Copy dates verbatim ("03/08/2026", "3 Aug 26"). Never guess or reorder them.
- If a column says Joining/Embarking treat it as sign_on; Leaving/Disembarking as sign_off.
- Skip rows that are totals, headings or blank.`

async function extractFromDocument(fileBase64: string, mediaType: string): Promise<{ rows: RawMovement[]; warnings: string[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { rows: [], warnings: ['Document reading is unavailable (ANTHROPIC_API_KEY not configured). Upload a CSV instead.'] }

  const isPdf = mediaType === 'application/pdf'
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }

  const payload = JSON.stringify({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: DOC_PROMPT }] }],
  })

  // Same rate-limit handling as the passport scanner — the key is shared with Leo.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  let res: Response | null = null
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: payload,
      })
    } catch (e: any) {
      return { rows: [], warnings: [`Could not reach the document reader: ${e?.message ?? 'network error'}`] }
    }
    if (res.status !== 429 && res.status !== 529) break
    if (attempt === 3) return { rows: [], warnings: ['The document reader is busy (rate limit). Try again in a minute.'] }
    const ra = parseInt(res.headers.get('retry-after') ?? '', 10)
    await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 20000) : Math.min(1500 * 2 ** attempt, 12000))
  }
  if (!res || !res.ok) {
    return { rows: [], warnings: [`Document reader error ${res?.status ?? 'unknown'}.`] }
  }

  const data: any = await res.json()
  const text: string = data?.content?.[0]?.text ?? ''
  const cleaned = text.replace(/```json|```/g, '').trim()
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}')
  let parsed: any = null
  try { parsed = JSON.parse(cleaned.slice(s, e + 1)) } catch { /* ignore */ }
  if (!parsed?.movements) return { rows: [], warnings: ['Could not read any movements from that document.'] }

  const sheetVessel = parsed.vessel ? String(parsed.vessel) : null
  const rows: RawMovement[] = []
  for (const m of parsed.movements) {
    const name = String(m?.name ?? '').trim()
    if (!name) continue
    const dateRaw = m?.date ? String(m.date) : ''
    const { iso, ambiguous } = parseDate(dateRaw)
    rows.push({
      name,
      event_type: m?.event_type === 'sign_on' || m?.event_type === 'sign_off' ? m.event_type : parseEventType(String(m?.event_type ?? '')),
      event_date: iso,
      date_raw: dateRaw || null,
      port: m?.port ? String(m.port) : null,
      vessel: m?.vessel ? String(m.vessel) : sheetVessel,
      rank: m?.rank ? String(m.rank) : null,
      ambiguous_date: ambiguous,
    })
  }
  return { rows, warnings: rows.length ? [] : ['The document was read but contained no crew movements.'] }
}

// ── Matching ─────────────────────────────────────────────────────────────────

/** Attach crew / yacht matches and duplicate flags. Reads only. */
async function buildProposals(raws: RawMovement[], fallbackYachtId: string | null): Promise<Proposal[]> {
  const sb = admin() as any
  const [{ data: crew }, { data: yachts }] = await Promise.all([
    sb.from('crew_members').select('id, full_name, first_name, last_name, yacht_id'),
    sb.from('yachts').select('id, vessel_name'),
  ])

  const crewList = ((crew ?? []) as any[]).map(c => ({
    id: c.id as string,
    name: (c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || '').trim(),
    yacht_id: (c.yacht_id ?? null) as string | null,
  })).filter(c => c.name)
  const yachtList = ((yachts ?? []) as any[]).map(y => ({ id: y.id as string, name: String(y.vessel_name ?? '') })).filter(y => y.name)

  // Existing movements, so an already-recorded one is flagged rather than doubled.
  const { data: existing } = await sb.from('crew_signon_events').select('crew_member_id, event_type, event_date')
  const seen = new Set(((existing ?? []) as any[]).map(e => `${e.crew_member_id}|${e.event_type}|${e.event_date}`))

  const out: Proposal[] = []
  for (const r of raws) {
    const key = nameKey(r.name)
    const tokens = key.split(' ').filter(t => t.length > 1)

    let exact = crewList.filter(c => nameKey(c.name) === key)
    if (!exact.length && tokens.length) {
      // Every word of the sheet name appears in the profile (handles middle names
      // and "Surname, First" ordering).
      exact = crewList.filter(c => { const k = nameKey(c.name); return tokens.every(t => k.includes(t)) })
    }
    const crewMatch = exact.length === 1 ? exact[0] : null
    const candidates = exact.length > 1 ? exact.slice(0, 8).map(c => ({ id: c.id, name: c.name })) : []

    const vKey = nameKey(r.vessel ?? '')
    const yMatch = vKey ? (yachtList.find(y => nameKey(y.name) === vKey) ?? yachtList.find(y => nameKey(y.name).includes(vKey) || vKey.includes(nameKey(y.name))) ?? null) : null
    const yacht = yMatch ?? (fallbackYachtId ? (yachtList.find(y => y.id === fallbackYachtId) ?? null) : null)
      ?? (crewMatch?.yacht_id ? (yachtList.find(y => y.id === crewMatch.yacht_id) ?? null) : null)

    const notes: string[] = []
    if (!crewMatch && candidates.length) notes.push(`${candidates.length} possible crew matches — pick one`)
    if (!crewMatch && !candidates.length) notes.push('No crew profile found for this name')
    if (!r.event_date) notes.push(r.date_raw ? `Could not read the date "${r.date_raw}"` : 'No date on this row')
    if (!r.event_type) notes.push('Sign on or sign off not stated')
    if (r.ambiguous_date) notes.push(`"${r.date_raw}" read as day/month — check`)

    const duplicate = !!(crewMatch && r.event_type && r.event_date &&
      seen.has(`${crewMatch.id}|${r.event_type}|${r.event_date}`))
    if (duplicate) notes.push('Already recorded in Polaris')

    out.push({ ...r, crew: crewMatch, candidates, yacht, duplicate, note: notes.join(' · ') || null })
  }
  return out
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function movementsImportHandler(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const sb = admin() as any
  const { data: { user } } = await sb.auth.getUser(auth.slice(7))
  if (!user) return json({ ok: false, error: 'Unauthorized' }, 401)

  let body: any
  try { body = await request.json() } catch { return json({ ok: false, error: 'Invalid request body' }, 400) }

  const yachtId: string | null = body.yacht_id || null
  let parsed: { rows: RawMovement[]; warnings: string[] }
  let source: 'csv' | 'document'

  if (typeof body.csvText === 'string' && body.csvText.trim()) {
    source = 'csv'
    parsed = movementsFromCsv(body.csvText)
  } else if (typeof body.fileBase64 === 'string' && body.fileBase64) {
    const mediaType = String(body.mediaType ?? 'application/pdf')
    if (mediaType !== 'application/pdf' && !/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) {
      return json({ ok: false, error: 'Upload a CSV, PDF or image of the sheet.' }, 415)
    }
    source = 'document'
    parsed = await extractFromDocument(body.fileBase64, mediaType)
  } else {
    return json({ ok: false, error: 'Nothing to import — attach a file.' }, 400)
  }

  if (!parsed.rows.length) {
    return json({ ok: true, source, rows: [], warnings: parsed.warnings })
  }
  const rows = await buildProposals(parsed.rows, yachtId)
  return json({ ok: true, source, rows, warnings: parsed.warnings })
}
