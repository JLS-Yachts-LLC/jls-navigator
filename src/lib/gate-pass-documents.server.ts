/**
 * One-off: bring each gate pass's document across from SharePoint.
 *
 * Staff (Finance, the gate pass desk) open a gate pass in Polaris and find no
 * document: 1,454 of the gate passes linked to the SharePoint "Gate Pass" list
 * have none, because the permits sync only ever copied the list's COLUMNS. The
 * pass itself was attached to the list item, and stayed there.
 *
 * Graph v1 cannot list a list item's attachments, so they are read through
 * SharePoint's own REST API (the same route the ShipSync photo import uses).
 *
 * Safety, because the permit lists were corrupted until 3 Sept 2026 (the old push
 * wrote one permit into item <id> of all seven lists): a document is taken ONLY
 * from an item the sync itself would trust —
 *   • not on the dry run's "left alone" list (item now holds another permit),
 *   • not a copy of the same item id of another permit list,
 *   • holder and pass number still agree with the Polaris row,
 *   • exactly one obvious file (a PDF named for the pass, or the only PDF/image).
 * Rows that already have a document are never touched. Writes stamp
 * sharepoint_synced_at, so the dirty trigger does not queue 1,400 rows for a push.
 *
 * Does NOT switch the permits sync on, and writes nothing to SharePoint.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { fetchAllRows } from './fetch-all'
import { getSharePointToken, permitItemMismatch, readPermitListForJob } from './sharepoint-sync.server'
import { storageRef } from './signed-url'

const LIST = 'Gate Pass'
const PERMIT_TYPE = 'gate_pass'
const BUCKET = 'permit-documents'
const USABLE = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp'])
const CONTENT_TYPE: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}

interface SpFile { name: string; rel: string }

type Outcome =
  | 'ready' | 'attachment_unreadable' | 'no_attachment' | 'sp_item_missing' | 'conflict' | 'copy' | 'mismatch' | 'ambiguous' | 'no_usable_file'
  | 'receipt_only' | 'name_mismatch' | 'image_only'

export interface GatePassDocPlanRow {
  id: string
  itemId: string
  holder: string | null
  permitNumber: string | null
  issueDate: string | null
  outcome: Outcome
  why?: string
  files: string[]
  pick?: SpFile
}

const ext = (name: string) => (name.split('.').pop() ?? '').toLowerCase()
const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Every item's attachments, read in bulk: id → files. */
async function readAttachments(siteAbsoluteUrl: string, creds: { tenantId: string; clientId: string; clientSecret: string }) {
  const host = new URL(siteAbsoluteUrl).hostname
  const spToken = await getSharePointToken(creds.tenantId, creds.clientId, creds.clientSecret, host)
  const site = siteAbsoluteUrl.replace(/\/$/, '')
  const out = new Map<string, SpFile[]>()
  let next: string | null =
    `${site}/_api/web/lists/getbytitle('${encodeURIComponent(LIST)}')/items?$select=Id,Attachments,AttachmentFiles&$expand=AttachmentFiles&$top=1000`
  while (next) {
    const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${spToken}`, Accept: 'application/json;odata=nometadata' } })
    if (!res.ok) throw new Error(`SharePoint attachments: HTTP ${res.status} ${res.headers.get('x-ms-diagnostics') ?? ''} ${(await res.text()).slice(0, 200)}`)
    const body = await res.json() as Record<string, any>
    for (const it of (body.value ?? []) as Array<Record<string, any>>) {
      const files = ((it.AttachmentFiles ?? []) as Array<Record<string, any>>)
        .map((f) => ({ name: String(f.FileName ?? ''), rel: String(f.ServerRelativeUrl ?? '') }))
        .filter((f) => f.name && f.rel)
      out.set(String(it.Id), files)
    }
    next = body['odata.nextLink'] ?? null
  }
  return { spToken, attachments: out }
}

/** A payment receipt is often attached beside the pass ("printPaymentReceipt-…pdf"); it is not the pass. */
const RECEIPT = /receipt|payment|invoice/i

/** Words in a file name that are not a person's name. */
const NOT_NAME = new Set([
  'pass', 'gate', 'gatepass', 'one', 'two', 'day', 'days', 'week', 'weeks', 'month', 'monthly', 'weekly', 'daily',
  'capt', 'captain', 'chef', 'mr', 'mrs', 'ms', 'copy', 'final', 'new', 'scan', 'scanned', 'pdf', 'jpg', 'jpeg', 'png',
  'jan', 'feb', 'mar', 'march', 'apr', 'april', 'may', 'jun', 'june', 'jul', 'july', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'january', 'february', 'august', 'september', 'october', 'november', 'december', 'and', 'the', 'for', 'crew', 'yacht',
])
const nameWords = (v: unknown) =>
  String(v ?? '').toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[^a-z]+/).filter((w) => w.length >= 3 && !NOT_NAME.has(w))

/**
 * Does the file name name somebody else? Pass files are named for the holder
 * ("pass-ANDREA D'AMATO (07-13 MAY 2024).pdf"), so a file naming another person
 * means the Polaris row and the item's attachment are different passes — the row
 * was overwritten before Sept. A file with no name in it is not a mismatch.
 * Close spellings count ("GUOLD" / "Gould"): same first four letters.
 */
function fileNamesSomeoneElse(fileName: string, holder: unknown): string | null {
  const f = nameWords(fileName)
  const h = nameWords(holder)
  if (!f.length || !h.length) return null
  const close = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4))
  return f.some((a) => h.some((b) => close(a, b))) ? null : `file "${fileName}" names someone other than ${String(holder)}`
}

/** The one obvious file for this pass, or why there isn't one. */
function pickFile(all: SpFile[], permitNumber: unknown): { pick?: SpFile; outcome?: Outcome; why?: string } {
  const usableAll = all.filter((f) => USABLE.has(ext(f.name)))
  if (!usableAll.length) return { outcome: 'no_usable_file', why: all.map((f) => f.name).join(', ') }
  const files = usableAll.filter((f) => !RECEIPT.test(f.name))
  if (!files.length) return { outcome: 'receipt_only', why: usableAll.map((f) => f.name).join(', ') }
  const usable = files
  const pdfs = usable.filter((f) => ext(f.name) === 'pdf')
  const num = norm(permitNumber)
  if (num.length >= 4) {
    const named = pdfs.filter((f) => norm(f.name).includes(num))
    if (named.length === 1) return { pick: named[0] }
  }
  if (pdfs.length === 1) return { pick: pdfs[0] }
  // Images attached to the list are as often a rejection notice or an approval
  // email screenshot as the pass itself — left for staff, not imported.
  if (!pdfs.length) return { outcome: 'image_only', why: usable.map((f) => f.name).join(', ') }
  return { outcome: 'ambiguous', why: `${pdfs.length || usable.length} files, none named for the pass` }
}

async function buildPlan() {
  const job = await readPermitListForJob(LIST)
  // SharePoint REST refuses an app-only token made from a client secret (it wants a
  // certificate), so this can fail while Graph works. The dry run then still reports
  // what Graph can see — each item's own "has attachments" flag — and the import refuses.
  let spToken = ''
  let attachments = new Map<string, SpFile[]>()
  let attachmentsError: string | null = null
  try { ({ spToken, attachments } = await readAttachments(job.siteAbsoluteUrl, job.creds)) }
  catch (e) { attachmentsError = e instanceof Error ? e.message : String(e) }
  const flagged = (i: any) => i?.fields?.Attachments === true
  const itemById = new Map(job.items.map((i) => [String(i.id), i]))

  const { data: rows } = await fetchAllRows(() => (supabaseAdmin as any).from('permits')
    .select('id, holder_name, permit_number, issue_date, document_url, sharepoint_item_id, sharepoint_list_name')
    .eq('permit_type', PERMIT_TYPE).order('id'))
  const all = (rows ?? []) as Record<string, any>[]
  const hasDoc = (r: Record<string, any>) => !!String(r.document_url ?? '').trim()

  const plan: GatePassDocPlanRow[] = []
  for (const r of all) {
    if (hasDoc(r) || !r.sharepoint_item_id || r.sharepoint_list_name !== LIST) continue
    const itemId = String(r.sharepoint_item_id)
    const base = {
      id: String(r.id), itemId, holder: r.holder_name ?? null, permitNumber: r.permit_number ?? null,
      issueDate: r.issue_date ? String(r.issue_date).slice(0, 10) : null,
    }
    const files = attachments.get(itemId) ?? []
    const names = files.map((f) => f.name)
    const item = itemById.get(itemId)
    const conflict = job.conflictIds.get(String(r.id))
    const copy = job.copyItems.get(itemId)
    const mismatch = item ? permitItemMismatch(r, item.fields ?? {}, job.fieldMapping) : null
    if (!item) { plan.push({ ...base, outcome: 'sp_item_missing', files: names }); continue }
    if (conflict) { plan.push({ ...base, outcome: 'conflict', why: conflict, files: names }); continue }
    if (copy) { plan.push({ ...base, outcome: 'copy', why: `copy of ${copy}`, files: names }); continue }
    if (mismatch) { plan.push({ ...base, outcome: 'mismatch', why: mismatch, files: names }); continue }
    if (attachmentsError) { plan.push({ ...base, outcome: flagged(item) ? 'attachment_unreadable' : 'no_attachment', files: [] }); continue }
    if (!files.length) { plan.push({ ...base, outcome: 'no_attachment', files: [] }); continue }
    const p = pickFile(files, r.permit_number)
    const someoneElse = p.pick ? fileNamesSomeoneElse(p.pick.name, r.holder_name) : null
    if (someoneElse) { plan.push({ ...base, outcome: 'name_mismatch', why: someoneElse, files: names, pick: p.pick }); continue }
    plan.push({ ...base, outcome: p.pick ? 'ready' : p.outcome!, why: p.why, files: names, pick: p.pick })
  }

  const withAttachments = job.items.filter((i) => (attachments.get(String(i.id)) ?? []).length).length
  const extCount: Record<string, number> = {}
  for (const files of attachments.values()) for (const f of files) extCount[ext(f.name)] = (extCount[ext(f.name)] ?? 0) + 1

  return {
    job, spToken, plan, attachmentsError,
    summary: {
      sharepoint: {
        items: job.items.length,
        attachmentsError,
        itemsFlaggedWithAttachments: job.items.filter(flagged).length,
        itemsWithAttachments: withAttachments,
        attachmentFiles: [...attachments.values()].reduce((n, f) => n + f.length, 0),
        byExtension: extCount,
        itemsFlaggedCopy: job.copyItems.size,
      },
      polaris: {
        gatePasses: all.length,
        alreadyHaveDocument: all.filter(hasDoc).length,
        notLinkedToSharePoint: all.filter((r) => !hasDoc(r) && !(r.sharepoint_item_id && r.sharepoint_list_name === LIST)).length,
        candidates: plan.length,
      },
      outcomes: plan.reduce<Record<string, number>>((a, p) => { a[p.outcome] = (a[p.outcome] ?? 0) + 1; return a }, {}),
    },
  }
}

/** Where else gate pass files might live: the site's document libraries, searched by name. */
async function surveyLibraries(siteId: string, graphToken: string) {
  const h = { headers: { Authorization: `Bearer ${graphToken}` } }
  const drives = ((await (await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drives?$select=id,name,webUrl`, h)).json()) as any).value ?? []
  const out: Array<{ library: string; webUrl: string; hits: Record<string, number>; more: boolean; samples: string[] }> = []
  for (const d of drives as any[]) {
    const hits: Record<string, number> = {}
    const samples: string[] = []
    let more = false
    for (const q of ['gate pass', 'gatepass']) {
      const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${d.id}/root/search(q='${encodeURIComponent(q)}')?$top=200&$select=name,webUrl,parentReference,file,folder`, h)
      const body = await res.json().catch(() => ({})) as Record<string, any>
      const v = (body.value ?? []) as any[]
      hits[q] = v.length
      if (body['@odata.nextLink']) more = true
      for (const f of v) if (samples.length < 12) samples.push(`${f.folder ? '[folder] ' : ''}${f.parentReference?.path?.split('root:')[1] ?? ''}/${f.name}`)
    }
    out.push({ library: String(d.name), webUrl: String(d.webUrl), hits, more, samples })
  }
  return out
}

/** What is inside a few library folders: files by type, and each subfolder's size — read-only. */
async function surveyFolders(siteId: string, graphToken: string, paths: string[]) {
  const h = { headers: { Authorization: `Bearer ${graphToken}` } }
  const list = async (path: string) => {
    let all: any[] = []
    let next: string | null = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${path.split('/').map(encodeURIComponent).join('/')}:/children?$top=999&$select=name,folder,file,size,lastModifiedDateTime`
    while (next && all.length < 5000) {
      const body = await (await fetch(next, h)).json() as Record<string, any>
      if (!body.value) return { error: JSON.stringify(body.error ?? body).slice(0, 200), items: all }
      all = all.concat(body.value); next = body['@odata.nextLink'] ?? null
    }
    return { items: all }
  }
  const out: any[] = []
  for (const path of paths) {
    const { items, error } = await list(path) as { items: any[]; error?: string }
    const files = items.filter((i) => i.file)
    const folders = items.filter((i) => i.folder)
    const byExt: Record<string, number> = {}
    for (const f of files) byExt[ext(f.name)] = (byExt[ext(f.name)] ?? 0) + 1
    const inside: any[] = []
    for (const f of folders.slice(0, 4)) {
      const sub = await list(`${path}/${f.name}`) as { items: any[] }
      inside.push({ folder: f.name, children: f.folder?.childCount, samples: sub.items.slice(0, 8).map((i) => `${i.folder ? '[folder] ' : ''}${i.name}`) })
    }
    out.push({
      path, error, files: files.length, byExt, folders: folders.length,
      folderNames: folders.slice(0, 40).map((f) => `${f.name} (${f.folder?.childCount ?? '?'})`),
      fileSamples: files.slice(0, 15).map((f) => f.name), inside,
    })
  }
  return out
}

const sample = (plan: GatePassDocPlanRow[], outcome: Outcome, n = 15) =>
  plan.filter((p) => p.outcome === outcome).slice(0, n).map(({ pick, ...p }) => ({ ...p, pick: pick?.name }))

/** Read-only: where the documents are, and what an import would do. */
export async function gatePassDocumentsDryRun(opts: { libraries?: boolean; folders?: string[] } = {}) {
  const { job, plan, summary } = await buildPlan()
  return {
    summary,
    libraries: opts.libraries ? await surveyLibraries(job.siteId, job.graphToken) : undefined,
    folders: opts.folders?.length ? await surveyFolders(job.siteId, job.graphToken, opts.folders) : undefined,
    samples: {
      ready: sample(plan, 'ready', 20),
      conflict: sample(plan, 'conflict', 40),
      copy: sample(plan, 'copy', 40),
      mismatch: sample(plan, 'mismatch', 40),
      ambiguous: sample(plan, 'ambiguous', 30),
      no_usable_file: sample(plan, 'no_usable_file'),
      receipt_only: sample(plan, 'receipt_only', 30),
      image_only: sample(plan, 'image_only', 20),
      name_mismatch: sample(plan, 'name_mismatch', 60),
      sp_item_missing: sample(plan, 'sp_item_missing'),
      no_attachment: sample(plan, 'no_attachment', 10),
      attachment_unreadable: sample(plan, 'attachment_unreadable', 10),
    },
  }
}

/**
 * Import up to `limit` ready documents. Re-plans each call (so it never acts on a
 * stale read) and is safe to repeat: rows that got a document are no longer
 * candidates. Call until `remaining` is 0.
 */
export async function gatePassDocumentsImport(limit = 150) {
  const { job, spToken, plan, attachmentsError } = await buildPlan()
  if (attachmentsError) throw new Error(`Cannot read the list's attachments, so nothing was imported: ${attachmentsError}`)
  const ready = plan.filter((p) => p.outcome === 'ready')
  const batch = ready.slice(0, Math.max(1, Math.min(limit, 250)))
  const site = job.siteAbsoluteUrl.replace(/\/$/, '')
  const q = (v: string) => encodeURIComponent(v.replace(/'/g, "''"))
  let imported = 0
  const failed: Array<{ id: string; itemId: string; file: string; reason: string }> = []

  for (const p of batch) {
    const f = p.pick!
    try {
      // Through the item itself: SharePoint refuses an app-only token on the file's
      // plain address (401) but serves it through the REST API.
      const res = await fetch(`${site}/_api/web/lists/getbytitle('${q(LIST)}')/items(${Number(p.itemId)})/AttachmentFiles('${q(f.name)}')/$value`,
        { headers: { Authorization: `Bearer ${spToken}` } })
      if (!res.ok) throw new Error(`download HTTP ${res.status}`)
      const ct = res.headers.get('content-type') ?? ''
      if (ct.includes('text/html')) throw new Error('SharePoint returned a web page, not the file')
      const bytes = await res.arrayBuffer()
      if (!bytes.byteLength) throw new Error('empty file')
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('not a PDF')
      const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80)
      const path = `permits/sharepoint-gate-pass/${p.itemId}-${safe}`
      const { error: upErr } = await supabaseAdmin.storage.from(BUCKET)
        .upload(path, bytes, { upsert: true, contentType: CONTENT_TYPE[ext(f.name)] ?? 'application/octet-stream' })
      if (upErr) throw new Error(`upload: ${upErr.message}`)
      // Only a row that still has no document; stamping sharepoint_synced_at marks
      // this as a sync write, so mark_sharepoint_dirty leaves sharepoint_dirty_at alone.
      const { data: upd, error } = await (supabaseAdmin as any).from('permits')
        .update({ document_url: storageRef(BUCKET, path), sharepoint_synced_at: new Date().toISOString() })
        .eq('id', p.id).or('document_url.is.null,document_url.eq.')
        .select('id')
      if (error) throw new Error(`update: ${error.message}`)
      if (upd?.length) imported++
    } catch (e) {
      failed.push({ id: p.id, itemId: p.itemId, file: f.name, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  return { imported, failed, attempted: batch.length, remaining: ready.length - batch.length + failed.length }
}
