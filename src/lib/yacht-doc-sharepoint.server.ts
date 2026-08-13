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
import { createServerFn } from '@tanstack/react-start'
import { getSpConfig, getGraphToken, resolveSpSite } from '@/lib/sharepoint-sync.server'
import { sanitizeSegment, ensureFoldersAndGetUrl, uploadBytesIntoFolders } from '@/lib/visa-sharepoint.server'

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

async function listChildren(siteId: string, token: string, path: string): Promise<Record<string, any>[]> {
  const select = 'id,name,size,webUrl,folder,file,lastModifiedDateTime'
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(path)}:/children?%24top=200&%24select=${select}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return []
  const body = (await res.json()) as Record<string, any>
  return (body.value ?? []) as Record<string, any>[]
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
async function resolveVesselFolder(siteId: string, token: string, vesselName: string): Promise<string | null> {
  const want = nameKey(vesselName)
  if (!want) return null
  const folders = (await listChildren(siteId, token, 'Yacht')).filter(c => !!c.folder)
  const exact = folders.filter(c => nameKey(String(c.name)) === want)
  const pick = (list: Record<string, any>[]) =>
    [...list].sort((a, b) => Number(b.folder?.childCount ?? 0) - Number(a.folder?.childCount ?? 0))[0]
  if (exact.length) return String(pick(exact).name)
  const words = want.split(' ').filter(w => w.length > 1)
  const loose = words.length
    ? folders.filter(c => { const k = nameKey(String(c.name)); return words.every(w => k.includes(w)) })
    : []
  return loose.length ? String(pick(loose).name) : null
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

/** READ-ONLY listing of the vessel's SharePoint folder (top level + one level down). */
export const listYachtSharePointFolder = createServerFn({ method: 'POST' })
  .inputValidator((d: { vesselName: string }) => d)
  .handler(async ({ data }): Promise<{ exists: boolean; webUrl: string | null; items: SpYachtItem[]; error?: string }> => {
    try {
      const { token, siteId } = await spContext()
      const folder = await resolveVesselFolder(siteId, token, data.vesselName)
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
  })

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
  heic: 'image/heic', webp: 'image/webp', gif: 'image/gif', txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
const contentTypeFor = (name: string) =>
  CONTENT_TYPES[(name.split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream'

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
      const up = await uploadBytesIntoFolders(siteId, token, segments, safeName, contentTypeFor(safeName), bytes)

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
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { token, siteId } = await spContext()
      const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${data.itemId}/content`,
        { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return { ok: false, error: `SharePoint download failed (${res.status})` }
      const bytes = new Uint8Array(await res.arrayBuffer())

      const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
      const safeName = data.fileName.replace(/[^\w.\- ]+/g, '_')
      const path = `yachts/${data.yachtId}/${Date.now()}-${safeName}`
      const { error: upErr } = await supabaseAdmin.storage.from('permit-documents')
        .upload(path, bytes, { upsert: true, contentType: contentTypeFor(safeName) })
      if (upErr) return { ok: false, error: `Storage upload failed: ${upErr.message}` }
      const fileUrl = supabaseAdmin.storage.from('permit-documents').getPublicUrl(path).data.publicUrl

      const { data: row, error } = await (supabaseAdmin as any).from('yacht_documents').insert([{
        yacht_id: data.yachtId, title: data.fileName, file_name: data.fileName,
        file_url: fileUrl, doc_type: 'sharepoint',
      }]).select('id').single()
      if (error) return { ok: false, error: error.message }

      // Record the mirror so the badge shows "in both" immediately.
      await (supabaseAdmin as any).from('yacht_document_sharepoint_links').upsert({
        yacht_id: data.yachtId, doc_key: `doc:${row.id}`,
        sp_item_id: data.itemId, sp_name: data.fileName,
        uploaded_at: new Date().toISOString(),
      }, { onConflict: 'yacht_id,doc_key' })

      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })
