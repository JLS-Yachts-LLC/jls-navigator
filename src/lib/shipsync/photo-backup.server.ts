/**
 * Copy Polaris-captured package photos back into SharePoint.
 *
 * Drivers photograph packages in Polaris and the file goes straight to Supabase
 * storage — fast, and it works with no signal. SharePoint then gets a copy, filed
 * exactly where the Power App puts its own:
 *
 *   Documents / Package - Images / <vessel> / <delivery note> / <stage>
 *
 * So SharePoint keeps working as a second copy of every photo, and anyone still
 * living in the Power App or the document library sees Polaris' pictures too.
 *
 * Supabase stays the source of truth. This is a backup: a failure here is logged
 * and retried on the next run, and never blocks a delivery. Each photo is copied
 * once — the storage path it was copied from is remembered on the package, so a
 * photo replaced later is copied again but an unchanged one is left alone.
 */
import { getSpConfig, getGraphToken, resolveSpSite } from '@/lib/sharepoint-sync.server'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { logAutomationRun } from '@/lib/automations.server'

const db = () => supabaseAdmin as any

/** Column → the stage folder the Power App would have filed it under. */
const STAGE_FOR: Record<string, string> = {
  item_photo_url: 'Received in Office',
  delivery_photo_url: 'Delivery Image',
  signature_url: 'Signature Image',
}

const LIBRARY = 'Package - Images'
/** Photos copied per run — keeps a backlog off the Worker's request ceiling. */
const BATCH = 25

/** Only ours: a SharePoint-hosted photo is already where we'd be putting it. */
const isPolarisHosted = (u: unknown) =>
  typeof u === 'string' && /supabase\.co\/storage\//.test(u)

/** Folder-safe: SharePoint rejects these characters in a name. */
const safeSegment = (s: string) =>
  s.replace(/[\\/:*?"<>|#%]/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown'

type Pkg = {
  id: string
  barcode: string | null
  boat_name: string | null
  delivery_note_no: string | null
  item_photo_url: string | null
  delivery_photo_url: string | null
  signature_url: string | null
  extra: Record<string, any> | null
}

export interface PhotoBackupResult {
  ok: boolean
  copied: number
  failed: number
  skipped: number
  detail: string
}

/**
 * `PUT /drive/root:/<path>:/content` creates the folders on the way, so the
 * vessel and note folders don't need making first.
 */
async function putFile(
  graphToken: string,
  siteId: string,
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<{ ok: true; webUrl?: string } | { ok: false; error: string }> {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encoded}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${graphToken}`, 'Content-Type': contentType },
      body: bytes,
    },
  )
  if (!res.ok) {
    return { ok: false, error: `Graph ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}` }
  }
  const body = await res.json().catch(() => null) as Record<string, any> | null
  return { ok: true, webUrl: body?.webUrl }
}

export async function backupShipSyncPhotos(opts: { limit?: number } = {}): Promise<PhotoBackupResult> {
  const limit = opts.limit ?? BATCH

  // Candidates: any package holding at least one Polaris-hosted photo. Which of
  // them still need copying is decided per photo below, against what was copied
  // last time.
  const { data } = await db()
    .from('shipsync_packages')
    .select('id, barcode, boat_name, delivery_note_no, item_photo_url, delivery_photo_url, signature_url, extra')
    .or('item_photo_url.ilike.%supabase.co/storage/%,delivery_photo_url.ilike.%supabase.co/storage/%,signature_url.ilike.%supabase.co/storage/%')
    .order('updated_at', { ascending: false })
    .limit(500)

  const packages = (data ?? []) as Pkg[]
  let copied = 0, failed = 0, skipped = 0
  const notes: string[] = []

  const pending: Array<{ pkg: Pkg; field: string; url: string }> = []
  for (const pkg of packages) {
    const done = (pkg.extra?.sp_photo_backup ?? {}) as Record<string, string>
    for (const field of Object.keys(STAGE_FOR)) {
      const url = (pkg as any)[field] as string | null
      if (!isPolarisHosted(url)) continue
      if (done[field] === url) { skipped++; continue } // this exact file is already there
      pending.push({ pkg, field, url: url as string })
    }
  }
  if (!pending.length) {
    return { ok: true, copied: 0, failed: 0, skipped, detail: `Nothing to copy (${skipped} already backed up)` }
  }

  const cfg = await getSpConfig()
  const graphToken = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  // The photo library lives with the Power App, not on the main site.
  const sitePath = process.env.SHIPSYNC_SP_SITE_PATH ?? '/sites/JLS-DeliveriesApp'
  const siteId = await resolveSpSite(graphToken, cfg.tenantUrl, sitePath)

  // Group so one package's writes update its record once.
  const byPackage = new Map<string, Array<{ field: string; url: string; pkg: Pkg }>>()
  for (const p of pending.slice(0, limit)) {
    const list = byPackage.get(p.pkg.id) ?? []
    list.push({ field: p.field, url: p.url, pkg: p.pkg })
    byPackage.set(p.pkg.id, list)
  }

  for (const [pkgId, items] of byPackage) {
    const pkg = items[0].pkg
    // Mirror the Power App's own naming: vessel, then the delivery note, then the
    // stage. Without a note number the barcode keeps the photo findable.
    const vessel = safeSegment(pkg.boat_name ?? 'Unknown Vessel')
    const note = safeSegment(pkg.delivery_note_no ?? pkg.barcode ?? pkgId.slice(0, 8))
    const done = { ...((pkg.extra?.sp_photo_backup ?? {}) as Record<string, string>) }
    let changed = false

    for (const { field, url } of items) {
      try {
        const res = await fetch(url)
        if (!res.ok) { failed++; if (notes.length < 3) notes.push(`${field}: HTTP ${res.status} reading the photo`); continue }
        const bytes = await res.arrayBuffer()
        const contentType = res.headers.get('content-type') ?? 'image/jpeg'
        const ext = contentType.includes('png') ? 'png' : 'jpg'
        const fileName = `Polaris-${field.replace(/_url$/, '')}-${pkgId.slice(0, 8)}.${ext}`
        const path = `${LIBRARY}/${vessel}/${note}/${STAGE_FOR[field]}/${fileName}`

        const put = await putFile(graphToken, siteId, path, bytes, contentType)
        if (!put.ok) { failed++; if (notes.length < 3) notes.push(`${field}: ${put.error}`); continue }
        done[field] = url
        changed = true
        copied++
      } catch (e) {
        failed++
        if (notes.length < 3) notes.push(`${field}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (changed) {
      await db().from('shipsync_packages')
        .update({ extra: { ...(pkg.extra ?? {}), sp_photo_backup: done } })
        .eq('id', pkgId)
    }
  }

  const remaining = Math.max(0, pending.length - limit)
  const detail = `Copied ${copied} photo(s) to SharePoint, ${failed} failed, ${skipped} already there`
    + (remaining ? `, ${remaining} queued for the next run` : '')
    + (notes.length ? ` — ${notes.join(' | ')}` : '')

  await logAutomationRun({
    key: 'shipsync-photo-backup',
    name: 'ShipSync photo backup → SharePoint',
    source: 'worker',
    trigger_type: opts.limit ? 'manual' : 'schedule',
    category: 'ShipSync',
    status: failed && !copied ? 'error' : 'success',
    detail: detail.slice(0, 1900),
  }).catch(() => { /* the result is returned regardless */ })

  return { ok: true, copied, failed, skipped, detail }
}
