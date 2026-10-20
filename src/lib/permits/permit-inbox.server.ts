/**
 * Permit Inbox — permits that arrive by email, read and matched to a vessel,
 * waiting for the Agency team to confirm.
 *
 * Faisal receives the GDRFA vessel entry permits (and others), from senders and
 * authorities that vary — so an Outlook rule on sender or subject can't catch
 * them. Instead Polaris looks at every PDF attached to mail in the watched
 * mailboxes (`permit_inbox_mailboxes`) and lets Claude decide whether it is a
 * permit at all, and if so read it.
 *
 *  • Nothing is written to `permits` here. A permit lands in `permit_inbox` with
 *    the vessel it most likely belongs to; a person confirms it (see
 *    `confirmInboxPermit`), which creates or updates the permit and files the PDF
 *    in the vessel's SharePoint folder.
 *  • The mailbox is only read. Unread state, folders and categories are never
 *    touched — Faisal works it by hand (same rule as the itsupport poller).
 *  • A PDF that isn't a permit is not stored: only its name, sender and time are
 *    kept, so a wrong call can be found and read again from the mailbox.
 *  • Dedupe is by Internet message id (stable when mail is moved between folders,
 *    unlike Graph's id) and by the file's hash, so a permit forwarded twice is
 *    read once.
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { getMailGraphTokenForRead } from '@/lib/graph-mail.server'
import { storageRef, parseStorageRef } from '@/lib/signed-url'
import { nameKey } from '@/lib/crew-name-match'

const db = () => supabaseAdmin as any

const MODEL = 'claude-opus-5-5'
/** Claude reads PDFs up to 32 MB; permits are a page or two, so anything far larger is not one. */
const MAX_PDF_BYTES = 15 * 1024 * 1024
/** PDFs read per mailbox per tick — the rest wait for the next tick (Worker time + subrequests). */
const MAX_READS_PER_TICK = 4
/** Days looked back on a normal tick; the first run of a new mailbox looks back further. */
const LOOKBACK_DAYS = 3
const FIRST_RUN_DAYS = 14

// ── Reading a PDF ────────────────────────────────────────────────────────────

export type PermitKind =
  | 'vessel_entry' | 'vessel_exit' | 'cruising_mothership' | 'cruising_tenders' | 'sanitation'
  | 'navigation_license' | 'tdra' | 'dma' | 'gate_pass' | 'abu_dhabi' | 'other_permit' | 'not_a_permit'

export type PermitReading = {
  is_permit: boolean
  kind: PermitKind
  authority: string | null
  permit_number: string | null
  issue_date: string | null
  expiry_date: string | null
  vessel_name: string | null
  imo_no: string | null
  official_no: string | null
  flag: string | null
  port_name: string | null
  arrival_date: string | null
  coming_from: string | null
  crew_count: number | null
  allowed_stay_days: number | null
  holder_name: string | null
  summary: string | null
}

const KINDS: PermitKind[] = [
  'vessel_entry', 'vessel_exit', 'cruising_mothership', 'cruising_tenders', 'sanitation',
  'navigation_license', 'tdra', 'dma', 'gate_pass', 'abu_dhabi', 'other_permit', 'not_a_permit',
]

const str = (d: string) => ({ type: ['string', 'null'], description: d })
const RECORD_PERMIT: Anthropic.Beta.BetaTool = {
  name: 'record_permit',
  description: 'Record what this document is and, if it is a permit, what it says. Call exactly once.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['is_permit', 'kind', 'authority', 'permit_number', 'issue_date', 'expiry_date', 'vessel_name', 'imo_no',
      'official_no', 'flag', 'port_name', 'arrival_date', 'coming_from', 'crew_count', 'allowed_stay_days', 'holder_name', 'summary'],
    properties: {
      is_permit: { type: 'boolean', description: 'true only for a permit, licence, pass or clearance issued by a government, port or maritime authority.' },
      kind: { type: 'string', enum: KINDS, description: 'Which kind of document this is.' },
      authority: str('The issuing body as printed, e.g. "General Directorate for Identity and Foreigners Affairs - Dubai" or "Dubai Maritime Authority".'),
      permit_number: str('The permit / licence / pass number exactly as printed.'),
      issue_date: str('Issue date as YYYY-MM-DD.'),
      expiry_date: str('Expiry / valid-until date as YYYY-MM-DD. If the permit says the stay was extended to a later date, use that later date.'),
      vessel_name: str('Vessel / yacht name as printed (English).'),
      imo_no: str('IMO number, digits only.'),
      official_no: str('Official / registration number.'),
      flag: str('Flag state, e.g. "Cayman Islands".'),
      port_name: str('The UAE port the permit is for, e.g. "Port Rashid", "Dubai Harbour".'),
      arrival_date: str('Arrival date as YYYY-MM-DD.'),
      coming_from: str('Country or port the vessel arrived from.'),
      crew_count: { type: ['integer', 'null'], description: 'Number of crew listed.' },
      allowed_stay_days: { type: ['integer', 'null'], description: 'Allowed period of stay in days.' },
      holder_name: str('For a personal pass (gate pass, visitor permit): the person it is issued to.'),
      summary: str('One short sentence a colleague would understand, e.g. "GDRFA vessel entry permit for KARMA at Port Rashid, extended to 23 Apr 2027".'),
    },
  },
}

const PROMPT = `This PDF was attached to an email received by a yacht agency in Dubai (JLS Yachts). Decide whether it is a permit, and if so read it, then call record_permit.

Permits include: GDRFA / ICP vessel entry or exit permits ("Vessel Entry Permit"), cruising permits (mothership or tenders), sanitation certificates, navigation licences, TDRA radio licences, DMA (Dubai Maritime Authority) permits, port gate passes, and Abu Dhabi port/maritime permits. They may be in English, Arabic or both.

NOT permits (kind = not_a_permit, is_permit = false): invoices, quotations, receipts, crew lists on their own, passports, visas, insurance certificates, letters, contracts, brochures.

Dates on UAE documents are written day/month/year — 28/10/2025 is 28 October 2025. Write them as YYYY-MM-DD.
Use null for anything not on the document. Never guess a number or a date.`

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const clean = (v: unknown, n = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

/** Read one PDF. Throws with a plain message when it can't. */
export async function readPermitPdf(bytes: Uint8Array): Promise<PermitReading> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Permit reading is not set up (no ANTHROPIC_API_KEY)')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 2 })
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    tools: [RECORD_PERMIT],
    tool_choice: { type: 'auto' },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: toBase64(bytes) } },
        { type: 'text', text: PROMPT },
      ],
    }],
  })
  if (response.stop_reason === 'refusal') throw new Error('The document could not be read')
  const call = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === 'record_permit')
  if (!call) throw new Error('The document could not be read')
  const r = call.input as PermitReading
  const kind = KINDS.includes(r.kind) ? r.kind : 'other_permit'
  const int = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null)
  return {
    is_permit: r.is_permit === true && kind !== 'not_a_permit',
    kind,
    authority: clean(r.authority),
    permit_number: clean(r.permit_number, 80),
    issue_date: isoDate(r.issue_date),
    expiry_date: isoDate(r.expiry_date),
    vessel_name: clean(r.vessel_name, 120),
    imo_no: clean(r.imo_no, 40),
    official_no: clean(r.official_no, 40),
    flag: clean(r.flag, 80),
    port_name: clean(r.port_name, 120),
    arrival_date: isoDate(r.arrival_date),
    coming_from: clean(r.coming_from, 120),
    crew_count: int(r.crew_count),
    allowed_stay_days: int(r.allowed_stay_days),
    holder_name: clean(r.holder_name, 120),
    summary: clean(r.summary, 300),
  }
}

/** Polaris permit type (+ phase) for what was read. `other_permit` is left for the reviewer. */
export function permitTypeFor(kind: PermitKind): { permit_type: string | null; dma_phase: string | null } {
  switch (kind) {
    case 'vessel_entry': return { permit_type: 'exit_entry', dma_phase: 'Entry' }
    case 'vessel_exit': return { permit_type: 'exit_entry', dma_phase: 'Exit' }
    case 'cruising_mothership': case 'cruising_tenders': case 'sanitation': case 'navigation_license':
    case 'tdra': case 'dma': case 'gate_pass': case 'abu_dhabi':
      return { permit_type: kind, dma_phase: null }
    default: return { permit_type: null, dma_phase: null }
  }
}

// ── Matching the vessel ──────────────────────────────────────────────────────

export type VesselCandidate = { yacht_id: string; vessel_name: string; score: number; reason: string }

/** Digits only; placeholders typed for "unknown" ("00000") count as nothing. */
const digits = (s: string | null | undefined) => {
  const d = (s ?? '').replace(/\D/g, '')
  return /^0*$/.test(d) ? '' : d
}
/** "M/Y KARMA", "MY Karma" and "KARMA" are the same vessel. */
const vesselKey = (s: string | null | undefined) =>
  nameKey(String(s ?? '')).replace(/^(m ?y|s ?y|m ?v|mv|my|sy)\s+/, '').trim()

/** Names a vessel row may be printed under: as stored, without bracketed notes, and any "(ex …)" name. */
function namesOf(vesselName: string): string[] {
  const out = [vesselKey(vesselName), vesselKey(vesselName.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '))]
  for (const m of vesselName.matchAll(/[([]\s*ex\b[\s.:-]*([^)\]]+)[)\]]/gi)) out.push(vesselKey(m[1]))
  return [...new Set(out.filter(Boolean))]
}

/**
 * Rank every vessel against what was read. IMO and official numbers are
 * near-certain; a name alone is good but can be shared, so a name tie is never
 * auto-suggested.
 */
export async function matchVessel(r: Pick<PermitReading, 'vessel_name' | 'imo_no' | 'official_no' | 'flag'>): Promise<{
  suggested: string | null; score: number | null; reason: string | null; candidates: VesselCandidate[]
}> {
  const { data } = await db().from('yachts').select('id, vessel_name, imo_no, official_no, flag, archive').not('vessel_name', 'is', null)
  const imo = digits(r.imo_no), off = digits(r.official_no)
  const want = vesselKey(r.vessel_name)
  const flag = nameKey(String(r.flag ?? ''))

  const scored: VesselCandidate[] = []
  for (const y of (data ?? []) as any[]) {
    let score = 0, reason = ''
    const yImo = digits(y.imo_no), yOff = digits(y.official_no)
    // Permits often print the same number as both IMO and Official No., so compare across both.
    if (imo.length >= 5 && yImo === imo) { score = 100; reason = 'IMO number matches' }
    else if ((off.length >= 4 && yOff === off) || (imo.length >= 5 && yOff === imo)) { score = 95; reason = 'Official number matches' }
    else if (off.length >= 5 && yImo === off) { score = 95; reason = 'IMO number matches' }
    if (want) {
      const names = namesOf(String(y.vessel_name))
      if (names.includes(want)) {
        if (score >= 95) reason += ' and the name'
        else { score = 80; reason = 'Same vessel name' }
      } else if (score < 55) {
        const words = want.split(' ').filter(w => w.length > 1)
        if (words.length && names.some(n => words.every(w => n.split(' ').includes(w)))) { score = 55; reason = 'Similar vessel name' }
      }
    }
    if (!score) continue
    if (flag && nameKey(String(y.flag ?? '')) === flag) score += 3
    if (y.archive) { score -= 15; reason += ' (archived vessel)' }
    scored.push({ yacht_id: y.id, vessel_name: y.vessel_name, score, reason })
  }
  scored.sort((a, b) => b.score - a.score)
  const candidates = scored.slice(0, 5)
  const top = candidates[0]
  if (!top || top.score < 75) return { suggested: null, score: top?.score ?? null, reason: top ? 'No confident match' : 'No vessel with this name or number', candidates }
  if (candidates[1] && candidates[1].score === top.score) {
    return { suggested: null, score: top.score, reason: `${candidates.filter(c => c.score === top.score).length} vessels match equally — choose one`, candidates }
  }
  return { suggested: top.yacht_id, score: top.score, reason: top.reason, candidates }
}

/**
 * The permit this one would update rather than duplicate: the same permit
 * number, or — since entry permits in Polaris were mostly typed without a
 * number — the same vessel, type and phase issued on the same day (an extension
 * keeps the original issue date and moves the expiry).
 */
export async function findExistingPermit(args: {
  yachtId: string | null; permitType: string | null; dmaPhase: string | null; permitNumber: string | null; issueDate: string | null
}): Promise<string | null> {
  if (args.permitNumber) {
    let q = db().from('permits').select('id').eq('permit_number', args.permitNumber)
    if (args.permitType) q = q.eq('permit_type', args.permitType)
    const { data } = await q.order('created_at', { ascending: true }).limit(1)
    if (data?.[0]) return data[0].id
  }
  if (args.yachtId && args.permitType && args.issueDate) {
    const d = new Date(`${args.issueDate}T00:00:00Z`)
    const lo = new Date(d.getTime() - 864e5).toISOString().slice(0, 10)
    const hi = new Date(d.getTime() + 864e5).toISOString().slice(0, 10)
    let q = db().from('permits').select('id').eq('yacht_id', args.yachtId).eq('permit_type', args.permitType)
      .gte('issue_date', lo).lte('issue_date', hi)
    if (args.dmaPhase) q = q.eq('dma_phase', args.dmaPhase)
    const { data } = await q.order('created_at', { ascending: true }).limit(1)
    if (data?.[0]) return data[0].id
  }
  return null
}

// ── Turning a PDF into an inbox row ──────────────────────────────────────────

async function sha256(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const safeFileName = (n: string) => (n || 'permit.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 120)

type Origin = {
  source: 'email' | 'upload'
  mailbox?: string | null
  graph_message_id?: string | null
  internet_message_id?: string | null
  attachment_key?: string | null
  received_at?: string | null
  from_address?: string | null
  from_name?: string | null
  subject?: string | null
  file_name: string
}

/** Fields an inbox row carries from a reading + vessel match. */
async function readingFields(reading: PermitReading) {
  const { permit_type, dma_phase } = permitTypeFor(reading.kind)
  const match = await matchVessel(reading)
  const existing = await findExistingPermit({
    yachtId: match.suggested, permitType: permit_type, dmaPhase: dma_phase,
    permitNumber: reading.permit_number, issueDate: reading.issue_date,
  })
  return {
    reading,
    permit_type, dma_phase,
    permit_number: reading.permit_number,
    issue_date: reading.issue_date,
    expiry_date: reading.expiry_date,
    // Entry/exit permits record the port in issuing_authority (as the Exit & Entry dialog does).
    issuing_authority: permit_type === 'exit_entry' ? (reading.port_name ?? reading.authority) : (reading.authority ?? reading.port_name),
    vessel_name: reading.vessel_name,
    imo_no: reading.imo_no,
    official_no: reading.official_no,
    suggested_yacht_id: match.suggested,
    match_score: match.score,
    match_reason: match.reason,
    candidates: match.candidates,
    existing_permit_id: existing,
  }
}

/**
 * Read one PDF and record it. Returns the inbox row's id and outcome. A file
 * already seen (same hash) is recorded as a duplicate without reading it again.
 */
export async function ingestPdf(bytes: Uint8Array, origin: Origin, opts: { forcePermit?: boolean } = {}): Promise<{ id: string | null; status: string }> {
  const file_sha256 = await sha256(bytes)
  const base = { ...origin, file_size: bytes.length, file_sha256 }

  const { data: twin } = await db().from('permit_inbox').select('id')
    .eq('file_sha256', file_sha256).neq('status', 'duplicate').order('created_at', { ascending: true }).limit(1)
  if (twin?.[0] && !opts.forcePermit) {
    const { data } = await db().from('permit_inbox').insert({ ...base, status: 'duplicate', duplicate_of: twin[0].id }).select('id').single()
    return { id: data?.id ?? null, status: 'duplicate' }
  }

  if (bytes.length > MAX_PDF_BYTES) {
    const { data } = await db().from('permit_inbox').insert({ ...base, status: 'not_permit', error: 'Too large to be a permit — not read' }).select('id').single()
    return { id: data?.id ?? null, status: 'not_permit' }
  }

  let reading: PermitReading | null = null, readError: string | null = null
  try { reading = await readPermitPdf(bytes) } catch (e) { readError = e instanceof Error ? e.message : String(e) }

  if (reading && !reading.is_permit && !opts.forcePermit) {
    // Not stored: just enough to find it again if this was the wrong call.
    const { data } = await db().from('permit_inbox').insert({
      ...base, subject: null, status: 'not_permit',
      reading: { kind: reading.kind, summary: reading.summary },
    }).select('id').single()
    return { id: data?.id ?? null, status: 'not_permit' }
  }

  // A permit (or unreadable — kept so a person can look): store the PDF.
  const path = `permits/inbox/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safeFileName(origin.file_name)}`
  const { error: upErr } = await supabaseAdmin.storage.from('permit-documents').upload(path, bytes, { contentType: 'application/pdf' })
  if (upErr) throw new Error(`Could not store the PDF: ${upErr.message}`)

  const fields = reading ? await readingFields(reading) : {}
  const { data, error } = await db().from('permit_inbox').insert({
    ...base, ...fields,
    document_url: storageRef('permit-documents', path),
    status: reading ? 'pending' : 'error',
    error: readError,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id, status: reading ? 'pending' : 'error' }
}

/**
 * Read an inbox row's PDF again — after an error, or when a person says a PDF
 * marked "not a permit" is one. Uses the stored copy if there is one, otherwise
 * fetches the attachment from the mailbox again.
 */
export async function rereadInboxItem(id: string): Promise<void> {
  const { data: row } = await db().from('permit_inbox').select('*').eq('id', id).maybeSingle()
  if (!row) throw new Error('Not found')
  if (row.status === 'filed') throw new Error('Already filed')

  let bytes: Uint8Array | null = null
  const ref = row.document_url ? parseStorageRef(row.document_url) : null
  if (ref) {
    const { data: blob } = await supabaseAdmin.storage.from(ref.bucket).download(ref.path)
    if (blob) bytes = new Uint8Array(await blob.arrayBuffer())
  }
  if (!bytes && row.mailbox && row.graph_message_id && row.attachment_key) {
    bytes = await fetchAttachmentByKey(row.mailbox, row.graph_message_id, row.attachment_key)
  }
  if (!bytes) throw new Error('The PDF is no longer in the mailbox (it may have been moved or deleted) — download it from Outlook and use "Upload a permit"')

  let reading: PermitReading | null = null, readError: string | null = null
  try { reading = await readPermitPdf(bytes) } catch (e) { readError = e instanceof Error ? e.message : String(e) }

  let document_url = row.document_url
  if (!document_url) {
    const path = `permits/inbox/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safeFileName(row.file_name)}`
    const { error: upErr } = await supabaseAdmin.storage.from('permit-documents').upload(path, bytes, { contentType: 'application/pdf' })
    if (upErr) throw new Error(`Could not store the PDF: ${upErr.message}`)
    document_url = storageRef('permit-documents', path)
  }
  // A person asked for this to be treated as a permit, so it goes to review
  // even if Claude still disagrees — they can fill the details in.
  const fields = reading ? await readingFields(reading) : {}
  await db().from('permit_inbox').update({
    ...fields, document_url,
    status: reading ? 'pending' : 'error',
    error: readError, updated_at: new Date().toISOString(),
  }).eq('id', id)
}

// ── Watching the mailboxes ───────────────────────────────────────────────────

type GraphMessage = {
  id: string
  internetMessageId?: string
  subject?: string
  receivedDateTime?: string
  isDraft?: boolean
  from?: { emailAddress?: { address?: string; name?: string } }
}
type GraphAttachment = { id: string; name?: string; contentType?: string; size?: number; isInline?: boolean; '@odata.type'?: string }

const isPdf = (a: GraphAttachment) =>
  a['@odata.type'] === '#microsoft.graph.fileAttachment'
  && (/pdf/i.test(a.contentType ?? '') || /\.pdf$/i.test(a.name ?? ''))
const attachmentKey = (a: GraphAttachment) => `${a.name ?? ''}|${a.size ?? 0}`

async function graphJson(token: string, url: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300)
    if (res.status === 403 || /AccessDenied|ErrorAccessDenied/i.test(body)) {
      throw new Error(`Polaris is not allowed to read this mailbox (Graph ${res.status}). The Polaris mail app needs Mail.Read for it — if an Exchange ApplicationAccessPolicy limits the app to certain mailboxes, add this one to that group.`)
    }
    throw new Error(`Graph ${res.status}: ${body}`)
  }
  return res.json()
}

async function listPdfAttachments(token: string, mailbox: string, messageId: string): Promise<GraphAttachment[]> {
  const body = await graphJson(token,
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`)
  return ((body.value ?? []) as GraphAttachment[]).filter(isPdf)
}

async function downloadAttachment(token: string, mailbox: string, messageId: string, attachmentId: string): Promise<Uint8Array> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`,
    { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Attachment download → ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

async function fetchAttachmentByKey(mailbox: string, messageId: string, key: string): Promise<Uint8Array | null> {
  try {
    const token = await getMailGraphTokenForRead()
    const att = (await listPdfAttachments(token, mailbox, messageId)).find(a => attachmentKey(a) === key)
    return att ? await downloadAttachment(token, mailbox, messageId, att.id) : null
  } catch { return null }
}

export type PollResult = { mailbox: string; messages: number; read: number; permits: number; skipped: number; error?: string }

async function pollMailbox(token: string, mb: { mailbox: string; last_ok_at: string | null }): Promise<PollResult> {
  const mailbox = mb.mailbox
  const out: PollResult = { mailbox, messages: 0, read: 0, permits: 0, skipped: 0 }
  const days = mb.last_ok_at ? LOOKBACK_DAYS : FIRST_RUN_DAYS
  const since = new Date(Date.now() - days * 864e5).toISOString()

  // Every folder (not just Inbox): Faisal files mail into folders by hand.
  let url: string | null =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages` +
    `?$top=50&$orderby=receivedDateTime desc` +
    `&$select=id,internetMessageId,subject,from,receivedDateTime,isDraft` +
    `&$filter=${encodeURIComponent(`receivedDateTime ge ${since} and hasAttachments eq true`)}`
  const messages: GraphMessage[] = []
  for (let page = 0; url && page < 4; page++) {
    const body = await graphJson(token, url)
    messages.push(...((body.value ?? []) as GraphMessage[]))
    url = body['@odata.nextLink'] ?? null
  }
  out.messages = messages.length
  if (!messages.length) return out

  const mids = messages.map(m => m.internetMessageId ?? m.id)
  const seen = new Set<string>()
  for (let i = 0; i < mids.length; i += 100) {
    const { data } = await db().from('permit_inbox_seen').select('internet_message_id')
      .eq('mailbox', mailbox).in('internet_message_id', mids.slice(i, i + 100))
    for (const r of (data ?? []) as any[]) seen.add(r.internet_message_id)
  }

  // Oldest first, so a backlog is worked through in order.
  for (const msg of messages.reverse()) {
    const mid = msg.internetMessageId ?? msg.id
    if (seen.has(mid)) continue
    if (out.read >= MAX_READS_PER_TICK) break
    const from = msg.from?.emailAddress?.address ?? ''
    // Drafts, and mail Faisal sent himself (Sent Items), are not incoming permits.
    if (msg.isDraft || from.toLowerCase() === mailbox.toLowerCase()) {
      await db().from('permit_inbox_seen').upsert({ mailbox, internet_message_id: mid })
      out.skipped++
      continue
    }

    const pdfs = await listPdfAttachments(token, mailbox, msg.id)
    const { data: done } = await db().from('permit_inbox').select('attachment_key')
      .eq('mailbox', mailbox).eq('internet_message_id', mid)
    const doneKeys = new Set(((done ?? []) as any[]).map(r => r.attachment_key))

    let finished = true
    for (const a of pdfs) {
      const key = attachmentKey(a)
      if (doneKeys.has(key)) continue
      if (out.read >= MAX_READS_PER_TICK) { finished = false; break }
      out.read++
      const bytes = await downloadAttachment(token, mailbox, msg.id, a.id)
      const res = await ingestPdf(bytes, {
        source: 'email', mailbox,
        graph_message_id: msg.id, internet_message_id: mid, attachment_key: key,
        received_at: msg.receivedDateTime ?? null,
        from_address: from || null, from_name: msg.from?.emailAddress?.name ?? null,
        subject: msg.subject ?? null, file_name: a.name ?? 'attachment.pdf',
      })
      if (res.status === 'pending') out.permits++
    }
    if (finished) await db().from('permit_inbox_seen').upsert({ mailbox, internet_message_id: mid })
  }
  return out
}

/** Every 5 minutes from the Worker cron, and from "Check now" in the inbox. */
export async function pollPermitInbox(): Promise<PollResult[] | null> {
  const { data: boxes } = await db().from('permit_inbox_mailboxes').select('mailbox, last_ok_at').eq('enabled', true)
  if (!boxes?.length) return null
  let token: string
  try { token = await getMailGraphTokenForRead() } catch { return null } // mail credentials not configured

  const results: PollResult[] = []
  for (const mb of boxes as { mailbox: string; last_ok_at: string | null }[]) {
    const now = new Date().toISOString()
    try {
      const r = await pollMailbox(token, mb)
      results.push(r)
      await db().from('permit_inbox_mailboxes').update({ last_polled_at: now, last_ok_at: now, last_error: null }).eq('mailbox', mb.mailbox)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      results.push({ mailbox: mb.mailbox, messages: 0, read: 0, permits: 0, skipped: 0, error })
      await db().from('permit_inbox_mailboxes').update({ last_polled_at: now, last_error: error.slice(0, 500) }).eq('mailbox', mb.mailbox)
    }
  }
  // Forget "seen" markers long past the look-back window.
  await db().from('permit_inbox_seen').delete().lt('seen_at', new Date(Date.now() - 60 * 864e5).toISOString())
  return results
}

// ── Confirming ───────────────────────────────────────────────────────────────

/**
 * Where a permit is kept inside the vessel's SharePoint folder.
 *
 * Entry permits: the Agency team keeps one "ENTRY PERMIT {year}" folder per
 * yacht per year (Matt asks every yacht to have one), so an entry permit goes
 * in the folder for the year it was received — matched loosely ("Entry
 * Permits 2026", "2026 ENTRY PERMIT") and created with the house name if absent.
 * Other types: an existing subfolder named for the type, else "Permits".
 */
const FOLDER_HINTS: Record<string, string[][]> = {
  exit_entry: [['entry', 'permit'], ['entry']],
  cruising_mothership: [['cruising', 'permit'], ['cruising']],
  cruising_tenders: [['cruising', 'permit'], ['cruising'], ['tender']],
  sanitation: [['sanitation'], ['ssc']],
  navigation_license: [['navigation', 'licen'], ['navigation']],
  tdra: [['tdra'], ['radio']],
  dma: [['dma'], ['maritime', 'authority']],
  gate_pass: [['gate', 'pass'], ['gate']],
  abu_dhabi: [['abu', 'dhabi']],
}

export function suggestSubfolder(subfolders: string[], permitType: string | null, dmaPhase: string | null, year: number): string {
  const keys = subfolders.map(s => ({ s, k: nameKey(s) }))
  const has = (k: string, words: string[]) => words.every(w => k.split(' ').some(part => part.startsWith(w)))

  if (permitType === 'exit_entry' && dmaPhase !== 'Exit') {
    const y = String(year)
    const hit = keys.find(({ k }) => has(k, ['entry']) && k.split(' ').includes(y))
    return hit?.s ?? `ENTRY PERMIT ${y}`
  }
  for (const words of FOLDER_HINTS[permitType ?? ''] ?? []) {
    const hit = keys.find(({ k }) => has(k, words))
    if (hit) return hit.s
  }
  return keys.find(({ k }) => has(k, ['permit']))?.s ?? 'Permits'
}

const PERMIT_FILE_LABEL: Record<string, string> = {
  exit_entry: 'Entry-Exit Permit', cruising_mothership: 'Cruising Permit', cruising_tenders: 'Cruising Permit (Tenders)',
  sanitation: 'Sanitation Certificate', navigation_license: 'Navigation Licence', tdra: 'TDRA Licence',
  dma: 'DMA Permit', gate_pass: 'Gate Pass', abu_dhabi: 'Abu Dhabi Permit',
}

/** "Entry Permit 201121001421079 - valid to 2027-04-23.pdf" — the emailed names ("3.pdf") say nothing. */
export function permitFileName(p: { permit_type: string; dma_phase: string | null; permit_number: string | null; expiry_date: string | null; issue_date: string | null }): string {
  const label = p.permit_type === 'exit_entry' && p.dma_phase ? `${p.dma_phase} Permit` : (PERMIT_FILE_LABEL[p.permit_type] ?? 'Permit')
  const parts = [label, p.permit_number].filter(Boolean).join(' ')
  const when = p.expiry_date ? ` - valid to ${p.expiry_date}` : p.issue_date ? ` - issued ${p.issue_date}` : ''
  return `${parts}${when}.pdf`
}

export type ConfirmInput = {
  id: string
  yachtId: string
  permitType: string
  dmaPhase: string | null
  permitNumber: string | null
  issueDate: string | null
  expiryDate: string | null
  issuingAuthority: string | null
  /** Update this permit instead of adding a new one. */
  existingPermitId: string | null
  /** Subfolder of the vessel's SharePoint folder; null = the vessel folder itself. */
  subfolder: string | null
  fileToSharePoint: boolean
}

type SpOutcome = { ok: true; webUrl: string | null } | { ok: false; error: string }
export type ConfirmResult = { permitId: string; updated: boolean; sharepoint: SpOutcome | null }

async function copyToVesselFolder(documentUrl: string, vesselName: string, subfolder: string | null, fileName: string): Promise<SpOutcome> {
  try {
    const ref = parseStorageRef(documentUrl)
    if (!ref) throw new Error('PDF not found in Polaris storage')
    const { data: blob, error } = await supabaseAdmin.storage.from(ref.bucket).download(ref.path)
    if (error || !blob) throw new Error(`Could not read the PDF: ${error?.message ?? 'not found'}`)
    const { fileBytesIntoVesselFolder } = await import('@/lib/yacht-doc-sharepoint.server')
    const up = await fileBytesIntoVesselFolder(vesselName, subfolder, fileName, 'application/pdf', new Uint8Array(await blob.arrayBuffer()))
    return { ok: true, webUrl: up.webUrl }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Turn an inbox item into a permit: update the matching one or add a new one,
 * then copy the PDF into the vessel's SharePoint folder. The permit is saved
 * first and a SharePoint failure is reported, not thrown — the permit is the
 * record, the folder copy secondary (same rule as visa filing).
 */
export async function confirmInboxPermit(input: ConfirmInput, userId: string): Promise<ConfirmResult> {
  const { data: row } = await db().from('permit_inbox').select('*').eq('id', input.id).maybeSingle()
  if (!row) throw new Error('This inbox item no longer exists')
  if (row.status === 'filed') throw new Error('This permit has already been filed')
  if (!row.document_url) throw new Error('There is no PDF stored for this item — read it again first')
  const { data: yacht } = await db().from('yachts').select('id, vessel_name').eq('id', input.yachtId).maybeSingle()
  if (!yacht) throw new Error('Choose the vessel this permit belongs to')

  const today = new Date().toISOString().slice(0, 10)
  const phased = ['exit_entry', 'dma', 'abu_dhabi'].includes(input.permitType)
  const fields: Record<string, unknown> = {
    permit_type: input.permitType,
    ...(phased && input.dmaPhase ? { dma_phase: input.dmaPhase } : {}),
    ...(input.permitNumber ? { permit_number: input.permitNumber } : {}),
    ...(input.issueDate ? { issue_date: input.issueDate } : {}),
    ...(input.expiryDate ? { expiry_date: input.expiryDate } : {}),
    ...(input.issuingAuthority ? { issuing_authority: input.issuingAuthority } : {}),
    document_url: row.document_url,
    status: input.expiryDate && input.expiryDate < today ? 'expired' : 'active',
  }

  let permitId: string, updated = false
  if (input.existingPermitId) {
    const { data: existing } = await db().from('permits').select('id').eq('id', input.existingPermitId).maybeSingle()
    if (!existing) throw new Error('The permit chosen to update no longer exists')
    const { error } = await db().from('permits').update({ ...fields, yacht_id: input.yachtId }).eq('id', existing.id)
    if (error) throw new Error(error.message)
    permitId = existing.id
    updated = true
  } else {
    const notes = row.source === 'email'
      ? `From the Permit Inbox — emailed to ${row.mailbox}${row.from_address ? ` by ${row.from_address}` : ''}${row.received_at ? ` on ${String(row.received_at).slice(0, 10)}` : ''}.`
      : 'From the Permit Inbox — uploaded.'
    const { data, error } = await db().from('permits').insert({
      ...fields, yacht_id: input.yachtId, created_by: userId, notes,
    }).select('id').single()
    if (error) throw new Error(error.message)
    permitId = data.id
  }

  const fileName = permitFileName({
    permit_type: input.permitType, dma_phase: phased ? input.dmaPhase : null,
    permit_number: input.permitNumber, expiry_date: input.expiryDate, issue_date: input.issueDate,
  })
  const sharepoint = input.fileToSharePoint
    ? await copyToVesselFolder(row.document_url, yacht.vessel_name, input.subfolder, fileName)
    : null

  const now = new Date().toISOString()
  await db().from('permit_inbox').update({
    status: 'filed', yacht_id: input.yachtId, permit_id: permitId,
    permit_type: input.permitType, dma_phase: phased ? input.dmaPhase : null,
    permit_number: input.permitNumber, issue_date: input.issueDate, expiry_date: input.expiryDate,
    issuing_authority: input.issuingAuthority,
    reviewed_by: userId, reviewed_at: now, updated_at: now,
    sharepoint_filed_at: sharepoint?.ok ? now : null,
    sharepoint_web_url: sharepoint?.ok ? sharepoint.webUrl : null,
    sharepoint_error: sharepoint && !sharepoint.ok ? sharepoint.error.slice(0, 500) : null,
  }).eq('id', input.id)

  return { permitId, updated, sharepoint }
}

/** Retry only the SharePoint copy of an already-filed item. */
export async function refileToSharePoint(id: string, subfolder: string | null): Promise<SpOutcome> {
  const { data: row } = await db().from('permit_inbox').select('*').eq('id', id).maybeSingle()
  if (!row || row.status !== 'filed' || !row.yacht_id || !row.document_url) return { ok: false, error: 'Only a filed permit can be copied to SharePoint' }
  const { data: yacht } = await db().from('yachts').select('vessel_name').eq('id', row.yacht_id).maybeSingle()
  const res = await copyToVesselFolder(row.document_url, yacht?.vessel_name ?? 'Unnamed Vessel', subfolder, permitFileName(row))
  const now = new Date().toISOString()
  await db().from('permit_inbox').update(res.ok
    ? { sharepoint_filed_at: now, sharepoint_web_url: res.webUrl, sharepoint_error: null, updated_at: now }
    : { sharepoint_error: res.error.slice(0, 500), updated_at: now }).eq('id', id)
  return res
}
