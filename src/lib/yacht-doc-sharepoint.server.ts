/**
 * Yacht Documents card ⇄ SharePoint.
 *
 * A vessel's paperwork lives in its own SharePoint folder,
 *   Shared Documents / Yacht / {vessel}
 * which is the PARENT of the "Crew Documents" folder the crew card uses. Crew
 * paperwork is therefore excluded here — it has its own home on the crew profile,
 * and mixing the two would show every crew member's passport under the vessel.
 *
 * Mirrors crew-doc-sharepoint.server.ts: read-only listing for the badges, a
 * subfolder creator, and a per-file push whose bytes are read server-side.
 */
import { storageRef } from '@/lib/signed-url'
import { createServerFn } from '@tanstack/react-start'
import { getSpConfig, getGraphToken, resolveSpSite } from '@/lib/sharepoint-sync.server'
import { sanitizeSegment, ensureFoldersAndGetUrl, uploadBytesIntoFolders } from '@/lib/visa-sharepoint.server'
import { sniffFileType, withExtension } from '@/lib/file-sniff'

const DEFAULT_SITE_URL = '/sites/PortOperationsandAgency'

/** Subfolders that belong to other modules and must not appear as yacht files. */
const EXCLUDED_FOLDERS = new Set(['crew documents'])

async function spContext(): Promise<{ token: string; siteId: string }> {
  const cfg = await getSpConfig()
  const siteUrl = (cfg as unknown as Record<string, any>).visaSiteUrl ?? cfg.siteUrl ?? DEFAULT_SITE_URL
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, siteUrl)
  return { token, siteId }
}

/** Case- and accent-insensitive key, so "JOIA The Crown Jewel" matches variants. */
const nameKey = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Every child of a folder — follows Graph's paging, since "Yacht" holds more than one page of vessels. */
async function listChildren(siteId: string, token: string, path: string): Promise<Record<string, any>[]> {
  const select = 'id,name,size,webUrl,folder,file,lastModifiedDateTime'
  let url: string | null =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(path)}:/children?%24top=200&%24select=${select}`
  const out: Record<string, any>[] = []
  for (let page = 0; url && page < 25; page++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) break
    const body = (await res.json()) as Record<string, any>
    out.push(...((body.value ?? []) as Record<string, any>[]))
    url = (body['@odata.nextLink'] as string | undefined) ?? null
  }
  return out
}

async function getItemByPath(siteId: string, token: string, path: string): Promise<Record<string, any> | null> {
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(path)}`,
    { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  return (await res.json()) as Record<string, any>
}

/**
 * The vessel's real folder name. Folders were typed by hand over years, so match
 * on a normalised key and prefer the busiest candidate — otherwise a near-duplicate
 * ("Yacth"/"Yacht") can win at random and files land in an empty twin.
 */
async function resolveVesselFolder(siteId: string, token: string, vesselName: string, opts: { exactOnly?: boolean; parent?: VesselParent } = {}): Promise<string | null> {
  const names = vesselNameCandidates(vesselName)
  if (!names.length) return null
  const folders = (await listChildren(siteId, token, opts.parent ?? 'Yacht')).filter(c => !!c.folder)
  const pick = (list: Record<string, any>[]) =>
    [...list].sort((a, b) => Number(b.folder?.childCount ?? 0) - Number(a.folder?.childCount ?? 0))[0]
  // Exact matches first, in order of preference (full name, current name, former name)…
  for (const want of names) {
    const exact = folders.filter(c => nameKey(String(c.name)) === want)
    if (exact.length) return String(pick(exact).name)
  }
  if (opts.exactOnly) return null
  // …then a folder containing every word of one of them.
  for (const want of names) {
    const words = want.split(' ').filter(w => w.length > 1)
    const loose = words.length
      ? folders.filter(c => { const k = nameKey(String(c.name)); return words.every(w => k.includes(w)) })
      : []
    if (loose.length) return String(pick(loose).name)
  }
  return null
}

/**
 * Names a vessel's folder may be filed under, most preferred first. Polaris names
 * carry notes SharePoint folders don't — "DEEP BREATH (ex Hermitage)", "Platinum
 * (66.90m)" — so also try the name with the brackets removed, and lastly the
 * former name, in case the folder was never renamed.
 */
function vesselNameCandidates(vesselName: string): string[] {
  const out = [nameKey(vesselName), nameKey(vesselName.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '))]
  for (const m of vesselName.matchAll(/[([]\s*ex\b[\s.:-]*([^)\]]+)[)\]]/gi)) out.push(nameKey(m[1]))
  return [...new Set(out.filter(Boolean))]
}

export type SpYachtItem = {
  id: string
  name: string
  folder: string | null
  isFolder: boolean
  webUrl: string | null
  size: number | null
  lastModified: string | null
}

/**
 * READ-ONLY listing of the vessel's SharePoint folder (top level + one level down),
 * "Crew Documents" excluded. A plain function so server code (the guest API) can
 * call it directly; the card calls it through listYachtSharePointFolder below.
 */
export async function listVesselSharePointItems(vesselName: string): Promise<{ exists: boolean; webUrl: string | null; items: SpYachtItem[]; error?: string }> {
    try {
      const { token, siteId } = await spContext()
      const folder = await resolveVesselFolder(siteId, token, vesselName)
      if (!folder) return { exists: false, webUrl: null, items: [] }
      const base = `Yacht/${folder}`
      const root = await getItemByPath(siteId, token, base)
      if (!root) return { exists: false, webUrl: null, items: [] }

      const items: SpYachtItem[] = []
      for (const it of await listChildren(siteId, token, base)) {
        const isFolder = !!it.folder
        if (isFolder && EXCLUDED_FOLDERS.has(nameKey(String(it.name)))) continue
        items.push({
          id: String(it.id), name: String(it.name), folder: null, isFolder,
          webUrl: it.webUrl ?? null, size: it.size ?? null, lastModified: it.lastModifiedDateTime ?? null,
        })
        if (!isFolder) continue
        for (const child of await listChildren(siteId, token, `${base}/${it.name}`)) {
          items.push({
            id: String(child.id), name: String(child.name), folder: String(it.name), isFolder: !!child.folder,
            webUrl: child.webUrl ?? null, size: child.size ?? null, lastModified: child.lastModifiedDateTime ?? null,
          })
        }
      }
      return { exists: true, webUrl: root.webUrl ?? null, items }
    } catch (e: any) {
      // SharePoint being unreachable must never break the Documents card.
      return { exists: false, webUrl: null, items: [], error: e?.message ?? String(e) }
    }
}

export const listYachtSharePointFolder = createServerFn({ method: 'POST' })
  .inputValidator((d: { vesselName: string }) => d)
  .handler(({ data }) => listVesselSharePointItems(data.vesselName))

/**
 * A short-lived, pre-authenticated download link for one SharePoint file (Graph's
 * @microsoft.graph.downloadUrl — needs no token, expires within the hour). Callers
 * MUST have checked the item belongs to a folder the requester may see.
 */
export async function sharePointDownloadUrl(itemId: string): Promise<string | null> {
  const { token, siteId } = await spContext()
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${encodeURIComponent(itemId)}?%24select=id,name,%40microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return null
  const body = (await res.json()) as Record<string, any>
  return (body['@microsoft.graph.downloadUrl'] as string | undefined) ?? null
}

/** Top-level folders vessels are filed under: yachts (client and JLS) and small boats. */
type VesselParent = 'Yacht' | 'Small Boat'

/**
 * The vessel's own folder, {parent}/{vessel} — reusing one already filed under
 * that name, else creating it — and its link. Called when a vessel or small boat
 * is added. `exactOnly` stops a new vessel ("Grace") being linked to another
 * client's folder ("Amazing Grace") on a loose word match; the yacht repair below
 * matches loosely, the same way the Documents card picks the folder it files into.
 */
export async function ensureVesselSharePointFolder(vesselName: string, opts: { exactOnly?: boolean; parent?: VesselParent } = {}): Promise<string | null> {
  const { token, siteId } = await spContext()
  const folder = await resolveVesselFolder(siteId, token, vesselName, opts) ?? sanitizeSegment(vesselName, 'Unnamed Vessel')
  return ensureFoldersAndGetUrl(siteId, token, [opts.parent ?? 'Yacht', folder])
}

/**
 * Hourly repair, in small batches to stay inside the Worker's subrequest budget:
 *  - vessels whose folder link is missing (added in Polaris) or went to the doubled
 *    "Shared Documents/Shared Documents/Yacht" tree the old folder creator used.
 *    The update marks the row dirty, so the next push carries the corrected link
 *    to the SharePoint Yachts list too;
 *  - live small boats with no folder link (SharePoint's Small Boat Reg list doesn't
 *    sync that column, so the link only lives in Polaris). Exact name match only —
 *    a loose match would file "ELA" into "BELLA".
 * Matches nothing once everything is linked.
 */
export async function repairVesselFolderLinks(): Promise<{ checked: number; fixed: number; failed: number }> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const { data: yachts } = await (supabaseAdmin as any)
    .from('yachts')
    .select('id, vessel_name')
    .not('vessel_name', 'is', null)
    .or('link_to_folder.ilike.*Shared%20Documents/Shared%20Documents*,and(link_to_folder.is.null,created_by.not.is.null)')
    .limit(10)
  const { data: boats } = await (supabaseAdmin as any)
    .from('small_boats')
    .select('id, boat_name')
    .is('link_to_folder', null)
    .not('archive', 'is', true)
    .not('boat_name', 'is', null)
    .limit(15)
  const jobs = [
    ...((yachts ?? []) as { id: string; vessel_name: string }[])
      .map(r => ({ table: 'yachts', id: r.id, name: r.vessel_name, opts: {} })),
    ...((boats ?? []) as { id: string; boat_name: string }[])
      .map(r => ({ table: 'small_boats', id: r.id, name: r.boat_name, opts: { exactOnly: true, parent: 'Small Boat' as const } })),
  ]
  let fixed = 0, failed = 0
  for (const j of jobs) {
    try {
      const url = await ensureVesselSharePointFolder(j.name, j.opts)
      if (!url) { failed++; continue }
      await (supabaseAdmin as any).from(j.table).update({ link_to_folder: url }).eq('id', j.id)
      fixed++
    } catch (e) {
      failed++
      console.error(`[vessel-folder-repair] ${j.table} ${j.name}:`, e instanceof Error ? e.message : String(e))
    }
  }
  return { checked: jobs.length, fixed, failed }
}

/** A newly registered small boat gets its Small Boat/{name} folder, unless a link was pasted in. */
export const createSmallBoatSharePointFolder = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean; webUrl: string | null }> => {
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
      const { data: boat } = await (supabaseAdmin as any)
        .from('small_boats').select('boat_name, link_to_folder').eq('id', data.id).maybeSingle()
      if (!boat?.boat_name || boat.link_to_folder) return { ok: true, webUrl: boat?.link_to_folder ?? null }
      const webUrl = await ensureVesselSharePointFolder(boat.boat_name, { exactOnly: true, parent: 'Small Boat' })
      if (webUrl) await (supabaseAdmin as any).from('small_boats').update({ link_to_folder: webUrl }).eq('id', data.id)
      return { ok: !!webUrl, webUrl }
    } catch (e) {
      console.error('[small-boat-folder]', e instanceof Error ? e.message : String(e))
      return { ok: false, webUrl: null }
    }
  })

/**
 * The vessel's folder and the subfolders directly inside it ("Crew Documents"
 * left out), so a person filing a document can pick where it goes. `folder` is
 * null when the vessel has no folder yet — filing would create Yacht/{name}.
 */
export async function vesselFolderOutline(vesselName: string): Promise<{ folder: string | null; webUrl: string | null; subfolders: string[] }> {
  const { token, siteId } = await spContext()
  const folder = await resolveVesselFolder(siteId, token, vesselName)
  if (!folder) return { folder: null, webUrl: null, subfolders: [] }
  const root = await getItemByPath(siteId, token, `Yacht/${folder}`)
  const subfolders = (await listChildren(siteId, token, `Yacht/${folder}`))
    .filter(c => !!c.folder && !EXCLUDED_FOLDERS.has(nameKey(String(c.name))))
    .map(c => String(c.name))
    .sort((a, b) => a.localeCompare(b))
  return { folder, webUrl: root?.webUrl ?? null, subfolders }
}

/** Upload bytes into Yacht/{vessel}[/{subfolder}], resolving the vessel's real folder first. */
export async function fileBytesIntoVesselFolder(
  vesselName: string, subfolder: string | null, fileName: string, contentType: string, bytes: Uint8Array,
): Promise<{ webUrl: string | null; name: string | null }> {
  const { token, siteId } = await spContext()
  const folder = await resolveVesselFolder(siteId, token, vesselName) ?? sanitizeSegment(vesselName, 'Unnamed Vessel')
  const segments = ['Yacht', folder]
  if (subfolder) segments.push(sanitizeSegment(subfolder, 'Permits'))
  const up = await uploadBytesIntoFolders(siteId, token, segments, fileName, contentType, bytes)
  return { webUrl: up.webUrl, name: up.name }
}

/** Create a subfolder in the vessel's folder so a Polaris folder has a twin. */
export const createYachtSharePointFolder = createServerFn({ method: 'POST' })
  .inputValidator((d: { vesselName: string; folderName: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean; webUrl: string | null; error?: string }> => {
    try {
      const { token, siteId } = await spContext()
      const folder = await resolveVesselFolder(siteId, token, data.vesselName) ?? sanitizeSegment(data.vesselName, 'Unnamed Vessel')
      const segments = ['Yacht', folder, sanitizeSegment(data.folderName, 'New folder')]
      return { ok: true, webUrl: await ensureFoldersAndGetUrl(siteId, token, segments) }
    } catch (e: any) {
      return { ok: false, webUrl: null, error: e?.message ?? String(e) }
    }
  })

function parseStoredRef(stored: string): { bucket: string; path: string } | null {
  if (!stored) return null
  const m = stored.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/)
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) }
  if (/^https?:\/\//i.test(stored)) return null
  const bare = stored.replace(/^\/+/, '')
  const slash = bare.indexOf('/')
  return slash > 0 ? { bucket: bare.slice(0, slash), path: bare.slice(slash + 1) } : null
}

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', heif: 'image/heif', webp: 'image/webp', gif: 'image/gif',
  bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  txt: 'text/plain', csv: 'text/csv', rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  msg: 'application/vnd.ms-outlook', eml: 'message/rfc822',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
/**
 * Pulling a document IN from SharePoint writes it to the permit-documents bucket,
 * whose type allow-list does NOT include application/octet-stream — so that as a
 * fallback would fail the upload for any extension missing from the map above.
 * Return null instead and let the caller decide; a SharePoint library holds
 * whatever people put in it, so an unknown extension is a real possibility.
 */
const contentTypeFor = (name: string): string | null =>
  CONTENT_TYPES[(name.split('.').pop() ?? '').toLowerCase()] ?? null

/** Push one stored Polaris file into the vessel's SharePoint folder. */
export const pushYachtDocToSharePoint = createServerFn({ method: 'POST' })
  .inputValidator((d: {
    yachtId: string; docKey: string; vesselName: string;
    stored: string; fileName: string; subfolder?: string | null
  }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean; webUrl: string | null; name?: string | null; error?: string }> => {
    try {
      const ref = parseStoredRef(data.stored)
      if (!ref) return { ok: false, webUrl: null, error: 'This file is not held in Polaris storage, so there is nothing to upload.' }

      const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(ref.bucket).download(ref.path)
      if (dlErr || !blob) return { ok: false, webUrl: null, error: `Could not read the file from Polaris storage: ${dlErr?.message ?? 'not found'}` }
      const bytes = new Uint8Array(await blob.arrayBuffer())

      const { token, siteId } = await spContext()
      const folder = await resolveVesselFolder(siteId, token, data.vesselName) ?? sanitizeSegment(data.vesselName, 'Unnamed Vessel')
      const segments = ['Yacht', folder]
      if (data.subfolder) segments.push(sanitizeSegment(data.subfolder, 'Folder'))

      const safeName = sanitizeSegment(data.fileName, 'document')
      // Outbound to SharePoint, which accepts anything — octet-stream is a fine
      // fallback here, unlike the inbound path below.
      const up = await uploadBytesIntoFolders(siteId, token, segments, safeName, contentTypeFor(safeName) ?? 'application/octet-stream', bytes)

      await (supabaseAdmin as any).from('yacht_document_sharepoint_links').upsert({
        yacht_id: data.yachtId, doc_key: data.docKey,
        sp_item_id: up.id, sp_name: up.name, web_url: up.webUrl,
        uploaded_at: new Date().toISOString(),
      }, { onConflict: 'yacht_id,doc_key' })

      return { ok: true, webUrl: up.webUrl, name: up.name }
    } catch (e: any) {
      return { ok: false, webUrl: null, error: e?.message ?? String(e) }
    }
  })

/**
 * Pull a SharePoint file INTO Polaris — the other half of "exists in both".
 * Downloads the item's bytes via Graph, stores them in the yacht's storage prefix
 * and creates the yacht_documents row, so a file that only existed in SharePoint
 * becomes a Polaris document too.
 */
export const pullYachtDocFromSharePoint = createServerFn({ method: 'POST' })
  .inputValidator((d: { yachtId: string; itemId: string; fileName: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; id?: string }> => {
    try {
      const { token, siteId } = await spContext()
      const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${data.itemId}/content`,
        { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return { ok: false, error: `SharePoint download failed (${res.status})` }
      const bytes = new Uint8Array(await res.arrayBuffer())

      const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
      let fileName = data.fileName
      let safeName = fileName.replace(/[^\w.\- ]+/g, '_')
      let contentType = contentTypeFor(safeName)
      if (!contentType) {
        // The name says nothing useful (an email attachment saved as
        // "….octet-stream", say) — read the type from the file itself, and give
        // it the extension it should have had.
        const sniffed = sniffFileType(bytes)
        if (sniffed) {
          contentType = sniffed.type
          fileName = withExtension(fileName, sniffed.ext)
          safeName = withExtension(safeName, sniffed.ext)
        }
      }
      if (!contentType) {
        const ext = safeName.split('.').pop() ?? ''
        return { ok: false, error: `“${data.fileName}” is a .${ext} file, which Polaris does not store. Convert it to a PDF in SharePoint and pull it in again.` }
      }
      const path = `yachts/${data.yachtId}/${Date.now()}-${safeName}`
      const { error: upErr } = await supabaseAdmin.storage.from('permit-documents')
        .upload(path, bytes, { upsert: true, contentType })
      if (upErr) return { ok: false, error: `Storage upload failed: ${upErr.message}` }
      const fileUrl = storageRef('permit-documents', path)

      const { data: row, error } = await (supabaseAdmin as any).from('yacht_documents').insert([{
        yacht_id: data.yachtId, title: fileName, file_name: fileName,
        file_url: fileUrl, doc_type: 'sharepoint',
      }]).select('id').single()
      if (error) return { ok: false, error: error.message }

      // Record the mirror so the badge shows "in both" immediately.
      await (supabaseAdmin as any).from('yacht_document_sharepoint_links').upsert({
        yacht_id: data.yachtId, doc_key: `doc:${row.id}`,
        sp_item_id: data.itemId, sp_name: data.fileName,
        uploaded_at: new Date().toISOString(),
      }, { onConflict: 'yacht_id,doc_key' })

      // The new document's id — "Release to portal" on a SharePoint-only file
      // imports it and then releases this row.
      return { ok: true, id: String(row.id) }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })
