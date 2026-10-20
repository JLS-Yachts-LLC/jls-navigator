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
import { getGraphToken, getSharePointToken, getSpConfig, getSpSyncs, permitItemMismatch, readPermitListForJob, resolveSpSite } from './sharepoint-sync.server'
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

/** Read-only: try one item's attachment download several ways and report what SharePoint says. */
export async function gatePassDocumentProbe(itemId: number) {
  const job = await readPermitListForJob(LIST)
  const host = new URL(job.siteAbsoluteUrl).hostname
  const token = await getSharePointToken(job.creds.tenantId, job.creds.clientId, job.creds.clientSecret, host)
  let claims: Record<string, unknown> = {}
  try { claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch { /* opaque */ }
  const site = job.siteAbsoluteUrl.replace(/\/$/, '')
  const q = (v: string) => encodeURIComponent(v.replace(/'/g, "''"))
  const list = await fetch(`${site}/_api/web/lists/getbytitle('${q(LIST)}')/items(${itemId})/AttachmentFiles`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;odata=nometadata' } })
  const files = list.ok ? ((await list.json()) as any).value ?? [] : []
  const f = files[0]
  const out: any[] = [{ way: 'list', status: list.status, diag: list.headers.get('x-ms-diagnostics'), files: files.map((x: any) => x.FileName) }]
  if (f) {
    const ways: Record<string, string> = {
      byItem: `${site}/_api/web/lists/getbytitle('${q(LIST)}')/items(${itemId})/AttachmentFiles('${q(f.FileName)}')/$value`,
      byPath: `${site}/_api/web/GetFileByServerRelativePath(decodedurl='${q(f.ServerRelativeUrl)}')/$value`,
    }
    for (const [way, url] of Object.entries(ways)) {
      for (const redirect of ['follow', 'manual'] as const) {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect })
        const b = new Uint8Array(await r.arrayBuffer())
        out.push({ way, redirect, url: url.replace(site, ''), status: r.status, location: r.headers.get('location'), diag: r.headers.get('x-ms-diagnostics'), bytes: b.byteLength, head: new TextDecoder().decode(b.slice(0, 40)) })
      }
    }
  }
  return { appidacr: claims.appidacr, roles: claims.roles, out }
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

  // A few at a time: one by one, each file's download + upload + update made the
  // import take over an hour.
  const one = async (p: GatePassDocPlanRow) => {
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
  for (let i = 0; i < batch.length; i += 6) await Promise.all(batch.slice(i, i + 6).map(one))
  return { imported, failed, attempted: batch.length, remaining: ready.length - batch.length + failed.length }
}

// ─── Reviewed attachments ──────────────────────────────────────────────────────
// After the import, the held-back passes were checked by a person: some are the
// right pass under a nickname, a photo of the pass, or an item whose COLUMNS the
// old push overwrote while its attachment stayed the original pass. These attach
// exactly the file named, from the row's own SharePoint item — nothing is guessed.

const MAGIC: Array<[string, (b: Uint8Array) => boolean]> = [
  ['pdf', (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46],
  ['jpg', (b) => b[0] === 0xff && b[1] === 0xd8],
  ['png', (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
]
const kindOf = (bytes: ArrayBuffer) => MAGIC.find(([, test]) => test(new Uint8Array(bytes.slice(0, 4))))?.[0]
const typeOf = (kind: string) => (kind === 'pdf' ? 'application/pdf' : kind === 'png' ? 'image/png' : 'image/jpeg')
const safeName = (v: string, n = 80) => v.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-n)

async function gatePassSite() {
  const cfg = await getSpConfig()
  const sync = (await getSpSyncs()).find((s) => s.syncTarget === 'permits' && s.listName === LIST)
  const sitePath = sync?.sitePath ?? cfg.siteUrl
  const site = `${new URL(cfg.tenantUrl).origin}${sitePath}`.replace(/\/$/, '')
  const spToken = await getSharePointToken(cfg.tenantId, cfg.clientId, cfg.clientSecret, new URL(site).hostname)
  return { cfg, site, sitePath, spToken }
}

/** One attachment of one Gate Pass item, checked to really be a PDF or image. */
async function downloadItemAttachment(site: string, spToken: string, itemId: string, file: string) {
  const q = (v: string) => encodeURIComponent(v.replace(/'/g, "''"))
  const res = await fetch(`${site}/_api/web/lists/getbytitle('${q(LIST)}')/items(${Number(itemId)})/AttachmentFiles('${q(file)}')/$value`,
    { headers: { Authorization: `Bearer ${spToken}` } })
  if (!res.ok) throw new Error(`download HTTP ${res.status}`)
  const bytes = await res.arrayBuffer()
  const kind = kindOf(bytes)
  if (!kind) throw new Error('not a PDF or image')
  return { bytes, contentType: typeOf(kind) }
}

/** Set a gate pass's document, only while it still has none; a sync write, so not queued for a push. */
async function setDocument(id: string, path: string): Promise<boolean> {
  const { data: upd, error } = await (supabaseAdmin as any).from('permits')
    .update({ document_url: storageRef(BUCKET, path), sharepoint_synced_at: new Date().toISOString() })
    .eq('id', id).or('document_url.is.null,document_url.eq.').select('id')
  if (error) throw new Error(`update: ${error.message}`)
  return !!upd?.length
}

/** Attach the named attachment of each row's own SharePoint item. Only rows that still have no document. */
export async function gatePassDocumentsAttach(list: Array<{ id: string; file: string }>) {
  const { site, spToken } = await gatePassSite()
  const { data: rows } = await (supabaseAdmin as any).from('permits')
    .select('id, permit_type, sharepoint_item_id, sharepoint_list_name, document_url').in('id', list.map((l) => l.id))
  const byId = new Map(((rows ?? []) as any[]).map((r) => [String(r.id), r]))
  const results: Array<{ id: string; file: string; ok: boolean; reason?: string }> = []
  for (const { id, file } of list) {
    const r = byId.get(id)
    try {
      if (!r) throw new Error('no such permit')
      if (r.permit_type !== PERMIT_TYPE || r.sharepoint_list_name !== LIST || !r.sharepoint_item_id) throw new Error('not a linked gate pass')
      if (String(r.document_url ?? '').trim()) throw new Error('already has a document')
      const { bytes, contentType } = await downloadItemAttachment(site, spToken, String(r.sharepoint_item_id), file)
      const path = `permits/sharepoint-gate-pass/${r.sharepoint_item_id}-${safeName(file)}`
      const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { upsert: true, contentType })
      if (upErr) throw new Error(`upload: ${upErr.message}`)
      const ok = await setDocument(id, path)
      results.push({ id, file, ok, reason: ok ? undefined : 'row changed meanwhile' })
    } catch (e) {
      results.push({ id, file, ok: false, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  return { attached: results.filter((o) => o.ok).length, results }
}

/**
 * The words printed in a PDF, roughly: every content stream is inflated and the
 * strings shown by its text operators (Tj / TJ / ' / ") are collected. Enough to
 * read the holder's name off a pass; no layout, and nothing from scanned images.
 */
async function pdfText(bytes: ArrayBuffer): Promise<string> {
  const raw = new Uint8Array(bytes)
  const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s }
  const src = latin1(raw)
  const inflate = async (b: Uint8Array) =>
    new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())
  const unescape = (s: string) => s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c: string) =>
    /^[0-7]+$/.test(c) ? String.fromCharCode(parseInt(c, 8)) : ({ n: '\n', r: '', t: ' ', b: '', f: '' } as Record<string, string>)[c] ?? c)
  const hex = (h: string) => {
    const b = (h.replace(/\s+/g, '').match(/../g) ?? []).map((x) => parseInt(x, 16))
    // Two-byte strings are often UTF-16 or glyph ids; keep only what reads as text.
    const one = String.fromCharCode(...b)
    if (b.length % 2 === 0 && b.filter((_, i) => i % 2 === 0).every((x) => x === 0)) return String.fromCharCode(...b.filter((_, i) => i % 2 === 1))
    return /^[\x20-\x7e]*$/.test(one) ? one : ''
  }
  const parts: string[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length
    const end = src.indexOf('endstream', start)
    if (end < 0) break
    const dict = src.slice(Math.max(0, m.index - 400), m.index)
    const head = dict.slice(dict.lastIndexOf('<<'))
    let content = ''
    try {
      let data = raw.subarray(start, end)
      while (data.length && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)) data = data.subarray(0, data.length - 1)
      content = /FlateDecode/.test(head) ? latin1(await inflate(data)) : /Filter/.test(head) ? '' : latin1(data)
    } catch { content = '' }
    re.lastIndex = end
    for (const block of content.match(/BT[\s\S]*?ET/g) ?? []) {
      const line: string[] = []
      for (const t of block.match(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>/g) ?? []) {
        line.push(t.startsWith('(') ? unescape(t.slice(1, -1)) : hex(t.slice(1, -1)))
      }
      const s = line.join('').replace(/\s+/g, ' ').trim()
      if (s) parts.push(s)
    }
  }
  return parts.join(' | ').slice(0, 2500)
}

/**
 * Copy attachments into a private review folder and hand back 15-minute links,
 * so a person can open the pass and read the name on it. Attaches nothing.
 */
export async function gatePassDocumentsReview(list: Array<{ itemId: string; file: string }>) {
  const { site, spToken } = await gatePassSite()
  const results: Array<{ itemId: string; file: string; url?: string; text?: string; reason?: string }> = []
  for (const { itemId, file } of list.slice(0, 20)) {
    try {
      const { bytes, contentType } = await downloadItemAttachment(site, spToken, itemId, file)
      const text = contentType === 'application/pdf' ? await pdfText(bytes).catch((e) => `(could not read text: ${e instanceof Error ? e.message : e})`) : undefined
      const path = `_review/gate-pass/${Number(itemId)}-${safeName(file)}`
      const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { upsert: true, contentType })
      if (error) throw new Error(`upload: ${error.message}`)
      const { data, error: sErr } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 900)
      if (sErr || !data?.signedUrl) throw new Error(`sign: ${sErr?.message ?? 'no link'}`)
      results.push({ itemId, file, url: data.signedUrl, text })
    } catch (e) {
      results.push({ itemId, file, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  return { results }
}

// ─── Documents library search ──────────────────────────────────────────────────
// Gate passes with nothing on their list item (or no list item at all) may still
// have been saved in the site's Documents library ("ISSUED GATE PASS" etc.). Each
// is searched by its pass number and by the holder's name; candidates are only
// reported — a person picks, then gatePassDocumentsAttachFromLibrary attaches.

export async function gatePassLibrarySearch(offset = 0, limit = 70) {
  const { cfg, sitePath } = await gatePassSite()
  const graphToken = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(graphToken, cfg.tenantUrl, sitePath)
  const h = { headers: { Authorization: `Bearer ${graphToken}` } }
  const drive = await (await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive?$select=id,name`, h)).json() as any

  const { data } = await fetchAllRows(() => (supabaseAdmin as any).from('permits')
    .select('id, holder_name, permit_number, issue_date, sharepoint_item_id, sharepoint_list_name, document_url')
    .eq('permit_type', PERMIT_TYPE).order('id'))
  // Real gate passes only: items 1645+ of the Gate Pass list are DMA/cruising permits filed there by mistake.
  const rows = ((data ?? []) as any[]).filter((r) => !String(r.document_url ?? '').trim()
    && !(r.sharepoint_list_name === LIST && Number(r.sharepoint_item_id) >= 1645))
  const page = rows.slice(offset, offset + limit)

  const search = async (q: string) => {
    const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${drive.id}/root/search(q='${encodeURIComponent(q.replace(/'/g, "''"))}')?$top=25&$select=id,name,size,file,webUrl,lastModifiedDateTime`, h)
    const body = await res.json().catch(() => ({})) as any
    return ((body.value ?? []) as any[]).filter((f) => f.file)
  }
  const results: any[] = []
  for (const r of page) {
    const num = String(r.permit_number ?? '').replace(/\D/g, '')
    const words = nameWords(r.holder_name)
    const hits = new Map<string, any>()
    if (num.length >= 10) for (const f of await search(num)) hits.set(f.id, { ...f, by: 'pass number' })
    if (words.length) {
      for (const f of await search(words.slice(0, 2).join(' '))) {
        // A name hit counts only when the file name carries one of the holder's names.
        if (!hits.has(f.id) && nameWords(f.name).some((w) => words.includes(w))) hits.set(f.id, { ...f, by: 'name' })
      }
    }
    results.push({
      id: String(r.id), holder: r.holder_name, permitNumber: r.permit_number, issueDate: r.issue_date, itemId: r.sharepoint_item_id,
      hits: [...hits.values()].slice(0, 8).map((f) => ({ driveItemId: f.id, name: f.name, by: f.by, size: f.size, modified: f.lastModifiedDateTime, webUrl: f.webUrl })),
    })
  }
  return { driveId: drive.id, total: rows.length, offset, nextOffset: offset + page.length < rows.length ? offset + page.length : null, results }
}

/** Attach chosen Documents-library files (by drive item) to gate passes that still have no document. */
export async function gatePassDocumentsAttachFromLibrary(driveId: string, list: Array<{ id: string; driveItemId: string }>) {
  const { cfg } = await gatePassSite()
  const graphToken = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const h = { headers: { Authorization: `Bearer ${graphToken}` } }
  const results: Array<{ id: string; ok: boolean; file?: string; reason?: string }> = []
  for (const { id, driveItemId } of list) {
    try {
      const { data: r } = await (supabaseAdmin as any).from('permits').select('id, permit_type, document_url').eq('id', id).maybeSingle()
      if (!r || r.permit_type !== PERMIT_TYPE) throw new Error('not a gate pass')
      if (String(r.document_url ?? '').trim()) throw new Error('already has a document')
      const meta = await (await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${driveItemId}?$select=name`, h)).json() as any
      const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${driveItemId}/content`, h)
      if (!res.ok) throw new Error(`download HTTP ${res.status}`)
      const bytes = await res.arrayBuffer()
      const kind = kindOf(bytes)
      if (!kind) throw new Error('not a PDF or image')
      const name = String(meta?.name ?? `${driveItemId}.${kind}`)
      const path = `permits/sharepoint-gate-pass/library-${safeName(name, 90)}`
      const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { upsert: true, contentType: typeOf(kind) })
      if (upErr) throw new Error(`upload: ${upErr.message}`)
      const ok = await setDocument(id, path)
      results.push({ id, ok, file: name, reason: ok ? undefined : 'row changed meanwhile' })
    } catch (e) {
      results.push({ id, ok: false, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  return { attached: results.filter((o) => o.ok).length, results }
}
