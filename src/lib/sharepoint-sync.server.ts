import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { fetchAllRows } from './fetch-all'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpConfig {
  tenantId: string
  clientId: string
  clientSecret: string
  tenantUrl: string
  siteUrl: string
  listName: string
  // spColumnInternalName → yachts DB column name
  fieldMapping: Record<string, string>
  syncTarget: string
}

export interface SpSyncConfig {
  id: string
  name: string
  listName: string
  syncTarget: 'yachts' | 'permits' | 'small_boats' | 'visa_applications' | 'crew_members' | 'shipsync_packages' | 'shipsync_drivers'
  fieldMapping: Record<string, string>
  enabled: boolean
  /** Optional SharePoint site path override (e.g. "/sites/JLS-DeliveriesApp").
   *  When null the sync uses the main configured site. Lets lists that live on a
   *  different site (ShipSync) be synced through the same engine. */
  sitePath: string | null
  deltaToken: string | null
  lastSyncedAt: string | null
  lastSyncSynced: number | null
  lastSyncErrors: number | null
}

// ─── Config helpers ────────────────────────────────────────────────────────────

export async function getSpConfig(): Promise<SpConfig> {
  const { data: row } = await (supabaseAdmin as any)
    .from('integration_settings')
    .select('config')
    .eq('integration_name', 'sharepoint')
    .maybeSingle()
  const cfg = row?.config ?? {}
  const { tenant_id, client_id, client_secret, tenant_url, site_url, list_name, field_mapping, sync_target } = cfg
  if (!tenant_id || !client_id || !client_secret || !tenant_url || !site_url) {
    throw new Error('SharePoint integration not fully configured in Settings (Tenant ID, Client ID, Secret, URLs).')
  }
  const mapping: Record<string, string> =
    typeof field_mapping === 'object' && field_mapping !== null ? field_mapping : {}
  return {
    tenantId: tenant_id,
    clientId: client_id,
    clientSecret: client_secret,
    tenantUrl: tenant_url,
    siteUrl: site_url,
    listName: list_name ?? 'Yachts',
    fieldMapping: mapping,
    syncTarget: sync_target ?? 'yachts',
  }
}

export async function saveSpConfigPatch(patch: Record<string, unknown>): Promise<void> {
  const { data: row } = await (supabaseAdmin as any)
    .from('integration_settings')
    .select('config')
    .eq('integration_name', 'sharepoint')
    .maybeSingle()
  const existing = row?.config ?? {}
  await (supabaseAdmin as any)
    .from('integration_settings')
    .upsert(
      { integration_name: 'sharepoint', enabled: true, config: { ...existing, ...patch } },
      { onConflict: 'integration_name' }
    )
}

// ─── Multi-sync CRUD ─────────────────────────────────────────────────────────

export async function getSpSyncs(): Promise<SpSyncConfig[]> {
  const { data } = await (supabaseAdmin as any)
    .from('sharepoint_sync_configs')
    .select('*')
    .order('created_at')
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    listName: r.list_name,
    syncTarget: r.sync_target as SpSyncConfig['syncTarget'],
    fieldMapping: (r.field_mapping ?? {}) as Record<string, string>,
    enabled: r.enabled,
    sitePath: r.site_path ?? null,
    deltaToken: r.delta_token ?? null,
    lastSyncedAt: r.last_synced_at ?? null,
    lastSyncSynced: r.last_sync_synced ?? null,
    lastSyncErrors: r.last_sync_errors ?? null,
  }))
}

export async function saveSpSync(
  // No `id` when creating — including it in the Pick would make it required.
  sync: Pick<SpSyncConfig, 'name' | 'listName' | 'syncTarget' | 'fieldMapping' | 'enabled'> & { id?: string },
): Promise<SpSyncConfig> {
  const payload = {
    name: sync.name,
    list_name: sync.listName,
    sync_target: sync.syncTarget,
    field_mapping: sync.fieldMapping,
    enabled: sync.enabled,
    updated_at: new Date().toISOString(),
  }
  let row: any
  if (sync.id) {
    const { data, error } = await (supabaseAdmin as any)
      .from('sharepoint_sync_configs').update(payload).eq('id', sync.id).select().single()
    if (error) throw new Error(error.message)
    row = data
  } else {
    const { data, error } = await (supabaseAdmin as any)
      .from('sharepoint_sync_configs').insert(payload).select().single()
    if (error) throw new Error(error.message)
    row = data
  }
  return {
    id: row.id, name: row.name, listName: row.list_name,
    syncTarget: row.sync_target, fieldMapping: row.field_mapping ?? {},
    enabled: row.enabled, sitePath: row.site_path ?? null, deltaToken: row.delta_token ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    lastSyncSynced: row.last_sync_synced ?? null,
    lastSyncErrors: row.last_sync_errors ?? null,
  }
}

export async function deleteSpSync(id: string): Promise<void> {
  const { error } = await (supabaseAdmin as any)
    .from('sharepoint_sync_configs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Sync the single least-recently-synced enabled list. Called every cron tick so
 * the lists rotate through one-per-invocation — each runs in its own Cloudflare
 * invocation, staying under the per-invocation subrequest limit (running all
 * lists at once exceeds it). Self-fetch fan-out isn't an option: Cloudflare
 * blocks a Worker from fetching its own zone.
 */
/**
 * Force a full re-pull on the next sync of every enabled list by clearing its
 * delta token. Used by the daily refresh cron so mapping/data changes (and any
 * SharePoint edits delta might have missed) are guaranteed to land each day.
 * The actual re-pull is carried out by the rotating syncStalestList() ticks,
 * which keeps each invocation within Cloudflare's subrequest budget.
 */
export async function resetDeltaTokens(): Promise<number> {
  // sharepoint_sync_configs is not in the generated types (created out of band),
  // so it goes through the same admin cast the rest of this module uses.
  const { data, error } = await (supabaseAdmin as any)
    .from('sharepoint_sync_configs')
    .update({ delta_token: null })
    .eq('enabled', true)
    .select('id')
  if (error) { console.error('[sp] resetDeltaTokens error:', error.message); return 0 }
  return data?.length ?? 0
}

export async function syncStalestList(): Promise<{ name: string; synced: number; errors: number } | null> {
  const syncs = (await getSpSyncs()).filter(s => s.enabled)
  if (!syncs.length) return null
  syncs.sort((a, b) =>
    (a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0) -
    (b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0))
  const target = syncs[0]
  const r = await syncById(target.id)
  return { name: target.name, synced: r.synced, errors: r.errors }
}

/**
 * Pull SharePoint changes IN on the fast (5-minute) tick.
 *
 * Movement data — a vessel's location, berth, ETA/ETD — has to be current, but
 * syncing every list in one Worker invocation is what the 15-minute rotation was
 * written to avoid (Cloudflare caps subrequests per invocation, and a Worker
 * can't self-fetch to fan out). So each tick does bounded work:
 *
 *   • every PRIORITY list, every tick        → Yachts is never more than 5 min stale
 *   • plus the N least-recently-synced others → the rest cycle in ~15-20 min
 *
 * Tunable without a code change:
 *   SP_SYNC_PRIORITY_LISTS   comma-separated list names (default "Yachts")
 *   SP_SYNC_LISTS_PER_TICK   how many others per tick   (default 3)
 * Setting SP_SYNC_LISTS_PER_TICK high enough to cover every list restores
 * all-at-once behaviour — only do that if the subrequest budget allows it.
 */
export async function syncPrioritisedLists(): Promise<Array<{ name: string; synced: number; errors: number }>> {
  const syncs = (await getSpSyncs().catch(() => [] as SpSyncConfig[])).filter(s => s.enabled)
  if (!syncs.length) return []

  const priorityNames = (process.env.SP_SYNC_PRIORITY_LISTS ?? 'Yachts')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const perTick = Math.max(0, Number(process.env.SP_SYNC_LISTS_PER_TICK ?? 3) || 0)
  const isPriority = (s: SpSyncConfig) =>
    priorityNames.includes(String(s.name ?? '').trim().toLowerCase()) ||
    priorityNames.includes(String(s.listName ?? '').trim().toLowerCase())

  const stale = (a: SpSyncConfig, b: SpSyncConfig) =>
    (a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0) -
    (b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0)

  const priority = syncs.filter(isPriority)
  const others = syncs.filter(s => !isPriority(s)).sort(stale).slice(0, perTick)

  const out: Array<{ name: string; synced: number; errors: number }> = []
  for (const s of [...priority, ...others]) {
    try {
      const r = await syncById(s.id)
      out.push({ name: s.name, synced: r.synced, errors: r.errors })
    } catch (e) {
      out.push({ name: s.name, synced: 0, errors: 1 })
      console.error(`[sp-fast] ${s.name} failed:`, e instanceof Error ? e.message : String(e))
    }
  }
  return out
}

export async function syncById(id: string): Promise<{ synced: number; errors: number; samples?: string[] }> {
  const syncs = await getSpSyncs()
  const sync = syncs.find(s => s.id === id)
  if (!sync) throw new Error(`Sync config not found: ${id}`)
  const cfg = await getSpConfig()
  const result = await _syncWithConfig(cfg, sync)
  return result
}

/**
 * Sync only the list the SharePoint webhook subscription is registered for.
 *
 * The subscription is created against a single list (getSpConfig().listName — see
 * registerSharePointWebhook), so a change notification can only ever concern that
 * list. Previously the webhook called syncFromSharePoint(), which loops EVERY
 * enabled list in one Worker invocation — the exact thing the cron avoids because
 * it exceeds Cloudflare's per-invocation subrequest limit, so the "instant" sync
 * silently died partway. Syncing just the notified list keeps the work bounded.
 *
 * Falls back to the stalest list if nothing matches, so a notification is never wasted.
 */
export async function syncWebhookList(): Promise<{ name: string; synced: number; errors: number } | null> {
  const cfg = await getSpConfig()
  const want = String(cfg.listName ?? '').trim().toLowerCase()
  const enabled = (await getSpSyncs().catch(() => [] as SpSyncConfig[])).filter(s => s.enabled)
  const matches = want
    ? enabled.filter(s => String(s.listName ?? '').trim().toLowerCase() === want)
    : []

  if (!matches.length) return syncStalestList()

  let synced = 0, errors = 0
  for (const s of matches) {
    try {
      const r = await syncById(s.id)
      synced += r.synced; errors += r.errors
    } catch (e) {
      errors++
      console.error(`[sp-webhook] ${s.name} failed:`, e instanceof Error ? e.message : String(e))
    }
  }
  return { name: matches.map(m => m.name).join(', '), synced, errors }
}

/** Rows still needing a vessel image (same predicate downloadPendingImages uses). */
async function pendingImageCount(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('yachts')
    .select('id', { count: 'exact', head: true })
    .or('vessel_image.is.null,vessel_image.like.{*')
  return count ?? 0
}

/**
 * Image backfill that walks the WHOLE pending set via a persisted cursor.
 *
 * The cron used to call downloadPendingImages(10, (UTCminutes % 4) * 10), which
 * only ever produced offsets 0/10/20/30 — so with a backlog longer than 40 rows
 * (ordered by vessel_name) every vessel past the first 40 was never processed
 * automatically, and newly uploaded photos for those vessels never arrived.
 * The cursor advances each run and wraps at the end of the set, so the backlog
 * is fully covered while still paging past rows that always fail.
 */
export async function downloadPendingImagesRotating(
  limit = 10,
): Promise<{ downloaded: number; processed: number; offset: number; nextOffset: number; pending: number }> {
  const pending = await pendingImageCount()
  if (pending === 0) return { downloaded: 0, processed: 0, offset: 0, nextOffset: 0, pending: 0 }

  const cfgRow = await (supabaseAdmin as any)
    .from('integration_settings').select('config').eq('integration_name', 'sharepoint').maybeSingle()
  const stored = Number(cfgRow?.data?.config?.image_cursor ?? 0)
  const offset = Number.isFinite(stored) && stored >= 0 && stored < pending ? Math.floor(stored) : 0

  const r = await downloadPendingImages(limit, offset)

  // Advance past the batch we just attempted; wrap when we run off the end.
  const nextOffset = offset + limit >= pending ? 0 : offset + limit
  await saveSpConfigPatch({ image_cursor: nextOffset }).catch(() => {})

  return { downloaded: r.downloaded, processed: r.processed, offset, nextOffset, pending }
}

// ─── Graph API helpers ─────────────────────────────────────────────────────────

export async function getGraphToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  return _getToken(tenantId, clientId, clientSecret, 'https://graph.microsoft.com/.default')
}

// SharePoint file downloads require a SharePoint-scoped token, not the Graph token.
export async function getSharePointToken(tenantId: string, clientId: string, clientSecret: string, spHostname: string): Promise<string> {
  return _getToken(tenantId, clientId, clientSecret, `https://${spHostname}/.default`)
}

async function _getToken(tenantId: string, clientId: string, clientSecret: string, scope: string): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope,
        grant_type: 'client_credentials',
      }).toString(),
    }
  )
  const data = await res.json() as Record<string, string>
  if (!data.access_token) {
    throw new Error(data.error_description ?? data.error ?? 'Microsoft token request failed')
  }
  return data.access_token
}

export async function resolveSpSite(token: string, tenantUrl: string, siteUrl: string): Promise<string> {
  const hostname = new URL(tenantUrl).hostname
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${hostname}:${siteUrl}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json() as Record<string, any>
  if (!data.id) {
    throw new Error(`SharePoint site not found: ${data.error?.message ?? 'Check Tenant URL and Site URL'}`)
  }
  return data.id as string
}

export async function getSpListId(token: string, siteId: string, listName: string): Promise<string> {
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listName}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json() as Record<string, any>
  if (!data.id) {
    throw new Error(`List "${listName}" not found: ${data.error?.message ?? ''}`)
  }
  return data.id as string
}

// ─── Diagnostic: peek raw item fields of a list (read-only) ────────────────────
// Returns the raw `fields` object of the first `top` items so the exact Graph
// field keys/values can be inspected when building a field mapping.
export async function peekSpList(listName: string, sitePath?: string, top = 5): Promise<{ items: Array<Record<string, any>> }> {
  const cfg = await getSpConfig()
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, sitePath || cfg.siteUrl)
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(listName)}/items?$expand=fields&$top=${Math.min(Math.max(top, 1), 50)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const data = await res.json() as Record<string, any>
  return { items: ((data.value ?? []) as any[]).map((it) => it.fields ?? {}) }
}

// ─── Discovery: enumerate lists + their columns (for auto-creating syncs) ──────

export async function discoverSharePoint(sitePathOverride?: string): Promise<{
  lists: Array<{ name: string; displayName: string; itemCount?: number; columns: Array<{ name: string; displayName: string }> }>
}> {
  const cfg = await getSpConfig()
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  // Optional site override (e.g. /sites/JLS-DeliveriesApp) so columns of lists on
  // another site can be discovered for cross-site sync field mappings.
  const siteId = await resolveSpSite(token, cfg.tenantUrl, sitePathOverride || cfg.siteUrl)

  const listsRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists?$select=name,displayName,list&$top=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const listsData = await listsRes.json() as Record<string, any>
  const rawLists = (listsData.value ?? []) as Record<string, any>[]
  // Skip hidden/system lists (document libraries, app lists etc.)
  const userLists = rawLists.filter(l => l.list?.hidden !== true && l.list?.template === 'genericList')

  const out: Array<{ name: string; displayName: string; columns: Array<{ name: string; displayName: string }> }> = []
  for (const l of userLists) {
    const colRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${encodeURIComponent(l.name)}/columns?$select=name,displayName,readOnly,hidden`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const colData = await colRes.json() as Record<string, any>
    const cols = ((colData.value ?? []) as Record<string, any>[])
      .filter(c => c.hidden !== true && c.readOnly !== true && !String(c.name).startsWith('_') && !String(c.name).startsWith('@'))
      .map(c => ({ name: String(c.name), displayName: String(c.displayName ?? c.name) }))
    out.push({ name: String(l.name), displayName: String(l.displayName ?? l.name), columns: cols })
  }
  return { lists: out }
}

// ─── Outbound: App → SharePoint ────────────────────────────────────────────────

export async function pushYachtToSharePoint(yachtId: string): Promise<void> {
  const cfg = await getSpConfig()
  if (Object.keys(cfg.fieldMapping).length === 0) return

  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  const { data: yacht } = await supabaseAdmin
    .from('yachts')
    .select('*')
    .eq('id', yachtId)
    .maybeSingle()
  if (!yacht) return

  // Build SP fields object from mapping (spColumn → dbField)
  const spFields: Record<string, any> = {}
  for (const [spField, dbField] of Object.entries(cfg.fieldMapping)) {
    if (!dbField) continue
    if (dbField === 'vessel_image') continue // SP image columns can't be set via field value
    const val = (yacht as Record<string, any>)[dbField]
    if (val !== null && val !== undefined && val !== '') {
      spFields[spField] = val
    }
  }

  const spItemId = (yacht as Record<string, any>).sharepoint_item_id as string | null

  if (spItemId) {
    // Update existing SP item
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items/${spItemId}/fields`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(spFields),
      }
    )
    if (!res.ok) {
      const err = await res.json() as Record<string, any>
      throw new Error(`SP update failed: ${err.error?.message ?? res.statusText}`)
    }
    await supabaseAdmin
      .from('yachts')
      .update({ sharepoint_synced_at: new Date().toISOString() } as never)
      .eq('id', yachtId)
  } else {
    // Try to find existing SP item by imo_no or vessel_name before creating
    const y = yacht as Record<string, any>
    let existingSpId: string | null = null

    const imoSpField = Object.entries(cfg.fieldMapping).find(([, db]) => db === 'imo_no')?.[0]
    const nameSpField = Object.entries(cfg.fieldMapping).find(([, db]) => db === 'vessel_name')?.[0]

    if (imoSpField && y.imo_no) {
      const r = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items?$filter=${encodeURIComponent(`fields/${imoSpField} eq '${y.imo_no}'`)}&$expand=fields`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const d = await r.json() as Record<string, any>
      existingSpId = d.value?.[0]?.id ?? null
    }

    if (!existingSpId && nameSpField && y.vessel_name) {
      const r = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items?$filter=${encodeURIComponent(`fields/${nameSpField} eq '${y.vessel_name}'`)}&$expand=fields`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const d = await r.json() as Record<string, any>
      existingSpId = d.value?.[0]?.id ?? null
    }

    if (existingSpId) {
      await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items/${existingSpId}/fields`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(spFields),
        }
      )
      await supabaseAdmin
        .from('yachts')
        .update({ sharepoint_item_id: existingSpId, sharepoint_synced_at: new Date().toISOString() } as never)
        .eq('id', yachtId)
    } else {
      // Create new SP item
      const createRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: spFields }),
        }
      )
      const created = await createRes.json() as Record<string, any>
      if (created.id) {
        await supabaseAdmin
          .from('yachts')
          .update({ sharepoint_item_id: created.id, sharepoint_synced_at: new Date().toISOString() } as never)
          .eq('id', yachtId)
      }
    }
  }
}

// ─── Image download helper ─────────────────────────────────────────────────────

/** Graph sharing token for a full file URL: "u!" + base64url(url), no padding. */
function encodeShareUrl(u: string): string {
  const b64 = btoa(unescape(encodeURIComponent(u)))
  return 'u!' + b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Download a SharePoint file by URL through the Graph /shares endpoint and store
 * it in vessel-images. Works with the app's existing Graph Sites.Read.All — no
 * SharePoint-scoped (Files.Read.All) permission needed, unlike a direct file GET.
 */
async function fetchViaGraphShares(fullUrl: string, graphToken: string, spItemId: string, tag: string): Promise<{ url: string | null; reason?: string }> {
  const res = await fetch(`https://graph.microsoft.com/v1.0/shares/${encodeShareUrl(fullUrl)}/driveItem/content`, {
    headers: { Authorization: `Bearer ${graphToken}` },
  })
  if (!res.ok) return { url: null, reason: `Graph shares HTTP ${res.status} (${tag})` }
  const ab = await res.arrayBuffer()
  const ct = res.headers.get('content-type') ?? 'image/jpeg'
  if (ct.includes('text/html')) return { url: null, reason: `Graph shares returned HTML (${tag})` }
  const ext = ct.split('/')[1]?.split(';')[0]?.replace(/[^a-z0-9]/gi, '') ?? 'jpg'
  const path = `sharepoint/${spItemId}-${tag}.${ext}`
  const { error } = await supabaseAdmin.storage.from('vessel-images').upload(path, ab, { upsert: true, contentType: ct })
  if (error) return { url: null, reason: `Supabase upload failed: ${error.message}` }
  return { url: supabaseAdmin.storage.from('vessel-images').getPublicUrl(path).data.publicUrl }
}

async function fetchSpImageToSupabase(
  raw: unknown,
  graphToken: string,
  tenantUrl: string,
  spItemId: string,
  tenantId?: string,
  clientId?: string,
  clientSecret?: string,
): Promise<{ url: string | null; reason?: string }> {
  // SP image/thumbnail columns return an object (or sometimes a JSON string)
  let img: Record<string, any> | null = null
  if (typeof raw === 'string') {
    // Could be a JSON-encoded object or a plain URL
    try { img = JSON.parse(raw) } catch {
      // plain URL — upload it to Supabase
      return uploadUrlToSupabase(raw, graphToken, spItemId, 'plain-url')
    }
  } else if (raw && typeof raw === 'object') {
    img = raw as Record<string, any>
  }
  if (!img) return { url: null, reason: 'Image field value was empty or unrecognisable.' }

  // ── Hyperlink/Picture column: { Url, Description } ──────────────────────────
  if (typeof img.Url === 'string') {
    return uploadUrlToSupabase(img.Url, graphToken, spItemId, 'hyperlink')
  }

  const serverUrl: string = img.serverUrl ?? tenantUrl.replace(/\/$/, '')

  // ── Acquire the best download token we can ───────────────────────────────────
  let downloadToken = graphToken
  if (tenantId && clientId && clientSecret) {
    try {
      const hostname = new URL(serverUrl).hostname
      downloadToken = await getSharePointToken(tenantId, clientId, clientSecret, hostname)
    } catch {
      // keep Graph token as fallback
    }
  }

  // ── 1. Try serverRelativeUrl (classic Picture column) ───────────────────────
  const serverRelativeUrl: string | undefined = img.serverRelativeUrl
  if (serverRelativeUrl) {
    const fullUrl = `${serverUrl}${serverRelativeUrl}`
    // 1a. Graph /shares — uses the app's existing Graph permission (preferred).
    const viaGraph = await fetchViaGraphShares(fullUrl, graphToken, spItemId, img.fileName ?? 'sp-image')
    if (viaGraph.url) return viaGraph
    // 1b. Direct file GET (needs a SharePoint-scoped Files.Read.All token).
    const result = await uploadUrlToSupabase(fullUrl, downloadToken, spItemId, img.fileName ?? 'sp-image')
    if (result.url) return result
    // fall through to thumbnail alternatives below
  }

  // ── 2. Try thumbnailUrl (modern Image column, SharePoint 2019+) ──────────────
  // thumbnailUrl may be relative (/_layouts/…) or absolute
  const rawThumb: string | undefined = img.thumbnailUrl
  if (rawThumb) {
    const thumbFull = rawThumb.startsWith('http') ? rawThumb : `${serverUrl}${rawThumb}`
    const result = await uploadUrlToSupabase(thumbFull, downloadToken, spItemId, 'thumbnail')
    if (result.url) return result
    // try with Graph token if SP token didn't work
    if (downloadToken !== graphToken) {
      const r2 = await uploadUrlToSupabase(thumbFull, graphToken, spItemId, 'thumbnail-graph')
      if (r2.url) return r2
    }
  }

  // ── 3. Neither worked ────────────────────────────────────────────────────────
  const tried: string[] = []
  if (serverRelativeUrl) tried.push(`server-relative URL (HTTP error)`)
  if (rawThumb) tried.push(`thumbnail URL (HTTP error)`)
  return {
    url: null,
    reason: tried.length
      ? `SharePoint image found but download failed: ${tried.join('; ')}. Ensure the Azure app has Files.Read.All or Sites.Read.All permission.`
      : 'Image field has no downloadable URL (serverRelativeUrl or thumbnailUrl).',
  }
}

/** Fetch a URL with the given bearer token and upload the bytes to Supabase vessel-images. */
async function uploadUrlToSupabase(
  url: string,
  token: string,
  spItemId: string,
  tag: string,
): Promise<{ url: string | null; reason?: string }> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      return { url: null, reason: `HTTP ${res.status} fetching image (${tag})` }
    }
    const ab = await res.arrayBuffer()
    const ct = res.headers.get('content-type') ?? 'image/jpeg'
    // Reject HTML/error pages returned with 200 status
    if (ct.includes('text/html')) {
      return { url: null, reason: `Server returned HTML instead of image (${tag}) — likely auth redirect` }
    }
    const ext = ct.split('/')[1]?.split(';')[0]?.replace(/[^a-z0-9]/gi, '') ?? 'jpg'
    const path = `sharepoint/${spItemId}-${tag}.${ext}`
    const { error } = await supabaseAdmin.storage
      .from('vessel-images')
      .upload(path, ab, { upsert: true, contentType: ct })
    if (error) return { url: null, reason: `Supabase upload failed: ${error.message}` }
    return { url: supabaseAdmin.storage.from('vessel-images').getPublicUrl(path).data.publicUrl }
  } catch (e) {
    return { url: null, reason: `Network error: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// ─── Inbound: SharePoint → App (delta sync) ────────────────────────────────────

// ─── Outbound: App → SharePoint (generic, all targets) ─────────────────────────

const TARGET_TABLE: Record<string, string> = {
  yachts: 'yachts', permits: 'permits', small_boats: 'small_boats',
  crew_members: 'crew_members', visa_applications: 'visa_applications',
  crew_signon_events: 'crew_signon_events',
};
// Natural keys used to find an existing SP item when a record has no sharepoint_item_id yet.
const TARGET_KEY_FIELDS: Record<string, string[]> = {
  yachts: ['imo_no', 'vessel_name'],
  permits: ['permit_number', 'holder_name'],
  small_boats: ['boat_name'],
  crew_members: ['passport_number'],
  visa_applications: ['jls_reference'],
  // Sign-on/off events have no natural key — always create a new SharePoint row.
  crew_signon_events: [],
};

/**
 * Targets whose outbound push to SharePoint is suppressed. EMPTY BY DEFAULT —
 * the sync is fully two-way; this is a dormant emergency lever, not a policy.
 *
 * Why it exists: writing a SharePoint list item can trigger automation that lives
 * on SharePoint, outside Polaris and beyond the mail guard's reach. On 2026-08-15
 * a Power Automate flow on the permits list emailed client vessels about a minute
 * after ordinary permit data entry pushed items across. That flow has since been
 * turned off at source, so nothing is suppressed here.
 *
 * If a SharePoint-side automation ever misbehaves again, set
 * SHAREPOINT_PUSH_DISABLED_TARGETS (comma-separated, e.g. "permits") to stop
 * Polaris writing to that list without touching the sync engine. Inbound sync is
 * never affected, and edits stay queued in sharepoint_dirty_at so the backlog
 * drains once the target is removed again.
 */
function pushDisabledTargets(): Set<string> {
  const raw = (process.env.SHAREPOINT_PUSH_DISABLED_TARGETS ?? '').trim();
  if (!raw || raw.toLowerCase() === 'none') return new Set();
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/** True when this target's records must not be written back to SharePoint. */
export function sharePointPushBlocked(target: string): boolean {
  return pushDisabledTargets().has(String(target).trim().toLowerCase());
}

/** Push one app record to every enabled SharePoint sync for its target. */
export async function pushRecordToSharePoint(target: string, id: string): Promise<void> {
  const table = TARGET_TABLE[target];
  if (!table) return;
  if (sharePointPushBlocked(target)) {
    console.warn(`[sp-push] outbound push for "${target}" is disabled — skipped ${table}/${id}`);
    return;
  }
  const syncs = (await getSpSyncs().catch(() => [])).filter(s => s.enabled && s.syncTarget === target);
  if (!syncs.length) return;

  const cfg = await getSpConfig();
  const { data: rec } = await (supabaseAdmin as any).from(table).select('*').eq('id', id).maybeSingle();
  if (!rec) return;

  // Resolve name-based links for reverse mapping.
  let yachtName: string | null = rec.vessel_name ?? null;
  if (rec.yacht_id) {
    const { data: y } = await (supabaseAdmin as any).from('yachts').select('vessel_name').eq('id', rec.yacht_id).maybeSingle();
    if (y?.vessel_name) yachtName = y.vessel_name;
  }
  let crewName: string | null = null;
  if (rec.crew_member_id) {
    const { data: c } = await (supabaseAdmin as any).from('crew_members').select('first_name, last_name').eq('id', rec.crew_member_id).maybeSingle();
    if (c) crewName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || null;
  }
  const valueFor = (dbField: string): any =>
    dbField === 'vessel_name' ? yachtName : dbField === 'crew_member_name' ? crewName : rec[dbField];

  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl);

  for (const sync of syncs) {
    const list = sync.listName;
    const spFields: Record<string, any> = {};
    for (const [spCol, dbField] of Object.entries(sync.fieldMapping)) {
      if (!dbField || dbField === 'vessel_image') continue;
      const v = valueFor(dbField);
      if (v !== null && v !== undefined && v !== '') spFields[spCol] = v;
    }
    if (!Object.keys(spFields).length) continue;

    let spId: string | null = rec.sharepoint_item_id ?? null;
    if (!spId) {
      for (const kf of (TARGET_KEY_FIELDS[target] ?? [])) {
        const spCol = Object.entries(sync.fieldMapping).find(([, db]) => db === kf)?.[0];
        const kv = valueFor(kf);
        if (!spCol || !kv) continue;
        const r = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${list}/items?$filter=${encodeURIComponent(`fields/${spCol} eq '${String(kv).replace(/'/g, "''")}'`)}&$select=id`,
          { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as any;
        spId = d.value?.[0]?.id ?? null;
        if (spId) break;
      }
    }

    if (spId) {
      const pr = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${list}/items/${spId}/fields`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(spFields) });
      // Throw rather than fall through: the caller keeps sharepoint_dirty_at set so
      // the edit is retried. Silently clearing it would lose the change for good.
      if (!pr.ok) throw new Error(`PATCH ${list}/${spId} → ${pr.status} ${(await pr.text()).slice(0, 200)}`);
    } else {
      const cr = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${list}/items`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: spFields }) });
      if (!cr.ok) throw new Error(`POST ${list} → ${cr.status} ${(await cr.text()).slice(0, 200)}`);
      spId = ((await cr.json()) as any).id ?? null;
    }
    if (spId) {
      // Clearing the dirty flag here — and only after a successful write — is what
      // lets the inbound pull start overwriting this row again. Only the four
      // tables in DIRTY_TABLES carry the column.
      const stamp: Record<string, unknown> = { sharepoint_item_id: spId, sharepoint_synced_at: new Date().toISOString() };
      if (DIRTY_TABLES.has(table)) stamp.sharepoint_dirty_at = null;
      await (supabaseAdmin as any).from(table).update(stamp).eq('id', id);
    }
  }
}

/**
 * Tables carrying sharepoint_dirty_at — set by mark_sharepoint_dirty() on any
 * write that does not stamp sharepoint_synced_at, i.e. an edit made in Polaris.
 * (See migration 20260812130000_sharepoint_two_way_sync.)
 */
const DIRTY_TABLES = new Set(['yachts', 'permits', 'crew_members', 'small_boats'])

/** Ids of rows with an in-app edit not yet pushed to SharePoint. */
async function dirtyIds(table: string): Promise<Set<string>> {
  if (!DIRTY_TABLES.has(table)) return new Set()
  const { data, error } = await (supabaseAdmin as any).from(table)
    .select('id, sharepoint_dirty_at').not('sharepoint_dirty_at', 'is', null).limit(2000)
  // A missing column (migration not applied) must not stop the pull — the old
  // behaviour is simply restored until it is.
  if (error) return new Set()
  const rows = (data ?? []) as any[]
  // A row held back for a day is a push that keeps failing: it is now frozen
  // against SharePoint changes too, which is worth saying out loud.
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  const stuck = rows.filter(r => new Date(r.sharepoint_dirty_at).getTime() < dayAgo).length
  if (stuck) console.warn(`[sp-pull] ${table}: ${stuck} row(s) unpushed for over 24h — check [sp-push] errors`)
  return new Set(rows.map(r => String(r.id)))
}

/**
 * Send in-app edits OUT to SharePoint, driven by the dirty flag.
 *
 * Runs immediately before the inbound pull for the same list, which is what makes
 * two-way sync work: the hourly push alone always lost the race against a pull
 * every 15 minutes, so edits were overwritten before they ever left.
 *
 * `max` bounds the Graph calls per tick — Cloudflare caps subrequests per
 * invocation, and a large backlog simply drains over successive ticks.
 */
export async function pushDirtyRecords(target: string, max = 20): Promise<{ pushed: number; failed: number; remaining: number }> {
  const table = TARGET_TABLE[target]
  if (!table || !DIRTY_TABLES.has(table)) return { pushed: 0, failed: 0, remaining: 0 }
  // Suppressed target: return before touching the queue. sharepoint_dirty_at stays
  // set on every edited row, so nothing is lost — the backlog drains by itself once
  // the push is re-enabled.
  if (sharePointPushBlocked(target)) return { pushed: 0, failed: 0, remaining: 0 }
  const db = supabaseAdmin as any
  const { data, error } = await db.from(table)
    .select('id, sharepoint_dirty_at')
    .not('sharepoint_dirty_at', 'is', null)
    .order('sharepoint_dirty_at', { ascending: true })
    .limit(max + 1)
  if (error) return { pushed: 0, failed: 0, remaining: 0 }
  const rows = ((data ?? []) as any[]).slice(0, max)
  const remaining = Math.max(0, ((data ?? []) as any[]).length - rows.length)

  let pushed = 0, failed = 0
  for (const r of rows) {
    try {
      await pushRecordToSharePoint(target, r.id)
      pushed++
    } catch (e) {
      // Leave the flag set so the row is retried, and never let one bad record
      // block the rest of the queue — or the pull that follows.
      failed++
      console.error(`[sp-push] ${table}/${r.id} failed:`, e instanceof Error ? e.message : String(e))
    }
  }
  if (pushed || failed) console.log(`[sp-push] ${table}: pushed=${pushed} failed=${failed} remaining=${remaining}`)
  return { pushed, failed, remaining }
}

/**
 * Hourly backstop for the outbound push, and the "Push now" button.
 *
 * Tables with a dirty flag go through pushDirtyRecords — the same queue the
 * pre-pull push drains, so nothing is sent twice and rows created in Polaris are
 * included. Everything else keeps the older timestamp heuristic, which is safe but
 * only ever PATCHes rows already linked to a SharePoint item.
 */
export async function pushChangedRecords(): Promise<{ pushed: number }> {
  const syncs = (await getSpSyncs().catch(() => [])).filter(s => s.enabled);
  const targets = Array.from(new Set(syncs.map(s => s.syncTarget)));
  let pushed = 0;
  for (const target of targets) {
    const table = TARGET_TABLE[target];
    if (!table) continue;
    if (DIRTY_TABLES.has(table)) {
      // A generous cap here: this is the sweep that clears any backlog the
      // per-list ticks did not get through.
      const r = await pushDirtyRecords(target, 100).catch(() => ({ pushed: 0 }));
      pushed += r.pushed;
      continue;
    }
    const { data } = await (supabaseAdmin as any).from(table)
      .select('id, updated_at, sharepoint_synced_at')
      .not('sharepoint_item_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(500);
    for (const r of (data ?? []) as any[]) {
      if (!r.updated_at) continue;
      // Only push if edited in-app after the last SharePoint sync (with 5s slack to ignore the sync's own write).
      if (r.sharepoint_synced_at && new Date(r.updated_at).getTime() <= new Date(r.sharepoint_synced_at).getTime() + 5000) continue;
      try { await pushRecordToSharePoint(target, r.id); pushed++; } catch { /* per-record best-effort */ }
    }
  }
  return { pushed };
}

export async function syncFromSharePoint(): Promise<{ synced: number; errors: number; samples?: string[] }> {
  // ── Multi-sync path (new table) ──────────────────────────────────────────────
  const syncs = await getSpSyncs().catch(() => [] as SpSyncConfig[])
  const enabled = syncs.filter(s => s.enabled)

  if (enabled.length > 0) {
    const cfg = await getSpConfig()
    let totalSynced = 0, totalErrors = 0
    for (const sync of enabled) {
      const r = await _syncWithConfig(cfg, sync)
      totalSynced += r.synced
      totalErrors += r.errors
    }
    return { synced: totalSynced, errors: totalErrors }
  }

  // ── Legacy single-sync fallback ──────────────────────────────────────────────
  const cfg = await getSpConfig()
  if (Object.keys(cfg.fieldMapping).length === 0) return { synced: 0, errors: 0 }
  if (cfg.syncTarget === 'permits') return _syncPermits(cfg)
  if (cfg.syncTarget === 'visa_applications') return _syncVisas(cfg)
  if (cfg.syncTarget === 'crew_members') return _syncCrew(cfg)
  if (cfg.syncTarget === 'small_boats') return { synced: 0, errors: 0 }
  return _syncYachts(cfg)
}

/** Dispatch a single SpSyncConfig row using the given credentials. */
async function _syncWithConfig(cfg: SpConfig, sync: SpSyncConfig): Promise<{ synced: number; errors: number; samples?: string[] }> {
  const merged: SpConfig = {
    ...cfg,
    // Per-sync site override: lists on another SharePoint site (ShipSync) resolve
    // their own site, everything else uses the main configured site.
    siteUrl: sync.sitePath ?? cfg.siteUrl,
    listName: sync.listName,
    fieldMapping: sync.fieldMapping,
    syncTarget: sync.syncTarget,
  }
  // Push first, then pull. In-app edits have to leave before SharePoint's copy is
  // read back, or the pull overwrites them — the whole reason two-way sync never
  // worked when the push only ran hourly.
  await pushDirtyRecords(sync.syncTarget).catch((e) =>
    console.error('[sp-push] pre-pull push failed:', e instanceof Error ? e.message : String(e)))

  let result: { synced: number; errors: number; samples?: string[] }
  if (sync.syncTarget === 'permits') {
    result = await _syncPermits(merged)
  } else if (sync.syncTarget === 'small_boats') {
    result = await _syncSmallBoats(merged)
  } else if (sync.syncTarget === 'visa_applications') {
    result = await _syncVisas(merged)
  } else if (sync.syncTarget === 'crew_members') {
    result = await _syncCrew(merged)
  } else if (sync.syncTarget === 'shipsync_packages') {
    result = await _syncShipSyncPackages(merged)
  } else if (sync.syncTarget === 'shipsync_drivers') {
    result = await _syncShipSyncDrivers(merged)
  } else {
    result = await _syncYachts(merged, sync.id, sync.deltaToken)
  }
  // Persist last sync stats back to the table
  await (supabaseAdmin as any)
    .from('sharepoint_sync_configs')
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_synced: result.synced,
      last_sync_errors: result.errors,
      last_sync_error_sample: result.samples ?? [],
    })
    .eq('id', sync.id)
  return result
}

// SharePoint numeric columns often hold text like "8.60M" or "N/A"; coerce to a
// number (first numeric token) or null so they don't break numeric DB columns.
const YACHT_NUMERIC_FIELDS = new Set([
  'gross_tonnage', 'net_tonnage', 'length_overall_m', 'breadth_m', 'draught_m',
  'air_draft_m', 'built_year', 'max_crew', 'max_guests',
])
function coerceNumeric(v: any): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

// Bulk-write collected records in chunks. Per-row writes (one Supabase call each)
// blow Cloudflare's per-invocation subrequest limit on any large list — this
// reduces hundreds of subrequests to a handful. updateById: rows with a known id
// (upsert on the PK); insertByKey: new rows (de-duped by SharePoint item id).
async function bulkPersist(
  table: string,
  updateById: Map<string, Record<string, any>>,
  insertByKey: Map<string, Record<string, any>>,
): Promise<{ synced: number; errors: number; samples: string[] }> {
  const samples: string[] = []
  let synced = 0, errors = 0
  // Yield to unpushed in-app edits. A dirty row is one a member of staff changed
  // in Polaris that has not reached SharePoint yet; overwriting it here is exactly
  // the silent revert the dirty flag exists to stop. It is pushed out on the next
  // tick (pushDirtyRecords runs first), and pulled normally once clean again.
  const skip = await dirtyIds(table)
  if (skip.size) {
    let held = 0
    for (const id of [...updateById.keys()]) if (skip.has(String(id))) { updateById.delete(id); held++ }
    if (held) console.log(`[sp-pull] ${table}: held back ${held} row(s) with unpushed in-app edits`)
  }
  const addSample = (m: string) => { if (m && samples.length < 8 && !samples.includes(m)) samples.push(m) }
  const chunks = (arr: Record<string, any>[], n: number) => {
    const out: Record<string, any>[][] = []
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
    return out
  }
  for (const c of chunks([...insertByKey.values()], 100)) {
    const { error } = await (supabaseAdmin as any).from(table).insert(c)
    if (error) { errors += c.length; addSample(`insert: ${error.message}`) } else synced += c.length
  }
  for (const c of chunks([...updateById.values()], 100)) {
    const { error } = await (supabaseAdmin as any).from(table).upsert(c, { onConflict: 'id' })
    if (error) { errors += c.length; addSample(`update: ${error.message}`) } else synced += c.length
  }
  return { synced, errors, samples }
}

/**
 * Make removals in SharePoint land in Polaris.
 *
 * The inbound sync only ever upserted what it saw, so an item deleted in
 * SharePoint stayed in the app forever — the yacht registry drifted to 181 rows
 * against SharePoint's 136. After a FULL pull (these lists are pulled whole every
 * run) anything linked but unseen has gone, so it is archived rather than deleted:
 * its permits, visas and history survive and it reappears automatically if the
 * item comes back.
 *
 * Two safety rules:
 *  • A pull that returned suspiciously few rows is ignored, so a truncated or
 *    failed Graph response can never archive the whole fleet.
 *  • Only records archived BY this reconciler (sharepoint_missing_since set) are
 *    ever un-archived, so a manual archive is never undone.
 */
async function reconcileRemovals(
  table: 'yachts' | 'small_boats',
  seenSpIds: Set<string>,
  label: string,
): Promise<{ archived: number; restored: number }> {
  const db = supabaseAdmin as any
  const { data: linked } = await fetchAllRows(() => db.from(table)
    .select('id, sharepoint_item_id, archive, sharepoint_missing_since')
    .not('sharepoint_item_id', 'is', null)
    .order('id'))
  const rows = (linked ?? []) as Array<Record<string, any>>
  if (!rows.length) return { archived: 0, restored: 0 }

  // Sanity gate: a full list should return at least half of what we already hold.
  if (seenSpIds.size < Math.floor(rows.length / 2)) {
    console.warn(`[${label}] removal check SKIPPED — only ${seenSpIds.size} item(s) returned against ${rows.length} on file (looks like a partial pull)`)
    return { archived: 0, restored: 0 }
  }

  const gone = rows.filter(r => !r.archive && !seenSpIds.has(String(r.sharepoint_item_id)))
  const back = rows.filter(r => r.archive && r.sharepoint_missing_since && seenSpIds.has(String(r.sharepoint_item_id)))
  const stamp = new Date().toISOString()

  // sharepoint_synced_at is included on purpose: it keeps mark_sharepoint_dirty()
  // quiet, so these housekeeping writes are never mistaken for staff edits and
  // pushed back out to SharePoint.
  for (const r of gone) {
    await db.from(table).update({ archive: true, sharepoint_missing_since: stamp, sharepoint_synced_at: stamp }).eq('id', r.id)
  }
  for (const r of back) {
    await db.from(table).update({ archive: false, sharepoint_missing_since: null, sharepoint_synced_at: stamp }).eq('id', r.id)
  }
  if (gone.length || back.length) {
    console.log(`[${label}] removals: archived=${gone.length} restored=${back.length}`)
  }
  return { archived: gone.length, restored: back.length }
}

async function _syncYachts(
  cfg: SpConfig,
  syncId?: string,
  preloadedDeltaToken?: string | null,
): Promise<{ synced: number; errors: number; samples?: string[] }> {
  void syncId; void preloadedDeltaToken; // delta sync retired — always full-pull (see below)
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  // Full pull every run (like the other lists). Delta sync was skipping rows that
  // errored on a previous run — they never came back unless edited in SharePoint.
  let allChanged: any[] = []
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items?$expand=fields&$top=200`

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    const page = await res.json() as Record<string, any>
    if (!page.value) break
    allChanged = allChanged.concat(page.value as any[])
    nextUrl = page['@odata.nextLink'] ?? null
  }

  // Load ALL existing yachts once — avoids N per-item DB round trips
  const { data: existingYachts } = await fetchAllRows(() => supabaseAdmin
    .from('yachts')
    .select('id, vessel_name, imo_no, sharepoint_item_id')
    .order('id'))
  const bySpId = new Map<string, string>()
  const byImo = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const y of (existingYachts ?? []) as Record<string, any>[]) {
    if (y.sharepoint_item_id) bySpId.set(String(y.sharepoint_item_id), String(y.id))
    if (y.imo_no) byImo.set(String(y.imo_no).toLowerCase(), String(y.id))
    if (y.vessel_name) byName.set(String(y.vessel_name).toLowerCase(), String(y.id))
  }

  const updateById = new Map<string, Record<string, any>>()
  const insertByKey = new Map<string, Record<string, any>>()
  // Rows dropped because the mapped vessel-name column was empty. Counted (not
  // silently swallowed) so "0 errors" can't hide vessels that never landed.
  let skippedNoName = 0
  for (const item of allChanged) {
    if (item['@removed']) continue
    const fields = item.fields ?? {}
    const record: Record<string, any> = {}
    for (const [spField, dbField] of Object.entries(cfg.fieldMapping)) {
      if (!dbField || !(spField in fields)) continue
      const raw = fields[spField]
      if (dbField === 'vessel_image') {
        // Skip image download here — downloadPendingImages() handles this
        // asynchronously to avoid hitting CF Workers subrequest limits.
        // Only set null if there's no image already stored (don't overwrite manual uploads).
        if (raw && typeof raw === 'object' && !record.vessel_image) {
          // Leave vessel_image out of record — existing value preserved, null yachts get picked up by cron
        }
        continue
      } else if (YACHT_NUMERIC_FIELDS.has(dbField)) {
        record[dbField] = coerceNumeric(raw)
      } else {
        record[dbField] = raw !== '' ? raw : null
      }
    }
    if (!record.vessel_name) { skippedNoName++; continue }

    record.sharepoint_item_id = item.id
    record.sharepoint_synced_at = new Date().toISOString()

    // Match against pre-loaded existing yachts (sp id → imo → name).
    const existingId =
      bySpId.get(String(item.id)) ??
      (record.imo_no ? byImo.get(String(record.imo_no).toLowerCase()) : undefined) ??
      byName.get(String(record.vessel_name).toLowerCase())

    if (existingId) {
      updateById.set(existingId, { ...record, id: existingId })
    } else {
      insertByKey.set(String(item.id), { ...record, status: record.status ?? 'Active' })
    }
  }

  const persisted = await bulkPersist('yachts', updateById, insertByKey)
  if (skippedNoName > 0) {
    const msg = `${skippedNoName} SharePoint row(s) skipped — mapped vessel-name column empty`
    console.warn(`[sp-yachts] ${msg}`)
    persisted.samples = [msg, ...(persisted.samples ?? [])].slice(0, 8)
  }

  // Yachts deleted in SharePoint get archived here (and un-archived if restored).
  const seen = new Set(allChanged.filter(i => !i['@removed']).map(i => String(i.id)))
  const removals = await reconcileRemovals('yachts', seen, 'sp-yachts').catch((e) => {
    console.error('[sp-yachts] removal check failed:', e instanceof Error ? e.message : e)
    return { archived: 0, restored: 0 }
  })
  if (removals.archived || removals.restored) {
    const msg = `${removals.archived} archived (gone from SharePoint), ${removals.restored} restored`
    persisted.samples = [msg, ...(persisted.samples ?? [])].slice(0, 8)
  }

  console.log(`[sp-yachts] items=${allChanged.length} update=${updateById.size} insert=${insertByKey.size} skipped=${skippedNoName} archived=${removals.archived} restored=${removals.restored}`)
  return persisted
}

async function _syncPermits(cfg: SpConfig): Promise<{ synced: number; errors: number; samples?: string[] }> {
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  const permitType = _permitTypeFromListName(cfg.listName)

  // Fetch ALL items (no delta for permits yet)
  let allItems: any[] = []
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items?$expand=fields&$top=200`
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    const page = await res.json() as Record<string, any>
    if (!page.value) break
    allItems = allItems.concat(page.value as any[])
    nextUrl = page['@odata.nextLink'] ?? null
  }

  // Load existing permits for matching (sp item id first, then permit no / holder)
  const { data: existingPermits } = await fetchAllRows(() => (supabaseAdmin as any)
    .from('permits')
    .select('id, permit_number, holder_name, sharepoint_item_id')
    .order('id'))
  const bySpId = new Map<string, string>()
  const byPermitNo = new Map<string, string>()
  const byHolderName = new Map<string, string>()
  for (const p of (existingPermits ?? []) as Record<string, any>[]) {
    if (p.sharepoint_item_id) bySpId.set(String(p.sharepoint_item_id), String(p.id))
    if (p.permit_number) byPermitNo.set(String(p.permit_number).toLowerCase(), String(p.id))
    if (p.holder_name) byHolderName.set(String(p.holder_name).toLowerCase(), String(p.id))
  }

  // Preload yachts for vessel_name → yacht_id resolution
  const { data: yachts } = await fetchAllRows(() => supabaseAdmin.from('yachts').select('id, vessel_name').order('id'))
  const yachtByName = new Map<string, string>()
  for (const y of (yachts ?? []) as Record<string, any>[]) {
    if (y.vessel_name) yachtByName.set(String(y.vessel_name).toLowerCase(), String(y.id))
  }

  const updateById = new Map<string, Record<string, any>>()
  const insertByKey = new Map<string, Record<string, any>>()

  for (const item of allItems) {
    if (item['@removed']) continue
    const fields = item.fields ?? {}
    const record: Record<string, any> = {
      sharepoint_synced_at: new Date().toISOString(),
    }
    if (permitType) record.permit_type = permitType

    for (const [spField, dbField] of Object.entries(cfg.fieldMapping)) {
      if (!dbField || !(spField in fields)) continue
      const raw = fields[spField]
      // vessel_name → resolve to yacht_id
      if (dbField === 'vessel_name') {
        const key = String(raw ?? '').toLowerCase().trim()
        if (key) {
          const yachtId = yachtByName.get(key)
          if (yachtId) record.yacht_id = yachtId
        }
        continue
      }
      record[dbField] = raw !== '' && raw !== null && raw !== undefined ? raw : null
    }

    if (!record.holder_name && !record.permit_number) continue
    record.sharepoint_item_id = item.id

    const existingId =
      bySpId.get(String(item.id)) ??
      (record.permit_number
        ? byPermitNo.get(String(record.permit_number).toLowerCase())
        : undefined) ??
      (record.holder_name
        ? byHolderName.get(String(record.holder_name).toLowerCase())
        : undefined)

    if (existingId) updateById.set(existingId, { ...record, id: existingId })
    else insertByKey.set(String(item.id), { ...record })
  }

  return bulkPersist('permits', updateById, insertByKey)
}

// Small boats sync: same pattern as permits but targets small_boats table
async function _syncSmallBoats(cfg: SpConfig): Promise<{ synced: number; errors: number; samples?: string[] }> {
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  let allItems: any[] = []
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items?$expand=fields&$top=200`
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    const page = await res.json() as Record<string, any>
    if (!page.value) break
    allItems = allItems.concat(page.value as any[])
    nextUrl = page['@odata.nextLink'] ?? null
  }

  // Load existing small_boats for matching (table keys on boat_name; there is no reg_no column)
  const { data: existing } = await fetchAllRows(() => (supabaseAdmin as any)
    .from('small_boats')
    .select('id, boat_name')
    .order('id'))
  const byName = new Map<string, string>()
  for (const b of (existing ?? []) as Record<string, any>[]) {
    if (b.boat_name) byName.set(String(b.boat_name).toLowerCase(), String(b.id))
  }

  const updateById = new Map<string, Record<string, any>>()
  const insertByKey = new Map<string, Record<string, any>>()

  for (const item of allItems) {
    if (item['@removed']) continue
    const fields = item.fields ?? {}
    const record: Record<string, any> = { sharepoint_synced_at: new Date().toISOString() }

    for (const [spField, dbField] of Object.entries(cfg.fieldMapping)) {
      if (!dbField || !(spField in fields)) continue
      const raw = fields[spField]
      record[dbField] = raw !== '' && raw !== null && raw !== undefined ? raw : null
    }

    if (!record.boat_name) continue
    record.sharepoint_item_id = item.id

    const existingId = byName.get(String(record.boat_name).toLowerCase())
    if (existingId) updateById.set(existingId, { ...record, id: existingId })
    else insertByKey.set(String(item.id), { ...record })
  }

  const persisted = await bulkPersist('small_boats', updateById, insertByKey)

  // Boats deleted in SharePoint get archived, same rule as the yacht registry.
  const seen = new Set(allItems.filter(i => !i['@removed']).map(i => String(i.id)))
  await reconcileRemovals('small_boats', seen, 'sp-small-boats').catch((e) => {
    console.error('[sp-small-boats] removal check failed:', e instanceof Error ? e.message : e)
    return { archived: 0, restored: 0 }
  })

  return persisted
}

// ShipSync Packages sync: SharePoint "Packages" list (on the JLS-DeliveriesApp
// site) → shipsync_packages. SharePoint is the source of truth while this is
// enabled. Matches existing rows by the stored SharePoint item id (extra.sp_item_id)
// then by barcode; the legacy "Status" choice text is reverse-mapped to our enum.
const SP_STATUS_REV: Record<string, string> = {
  'In Office': 'in_office', 'In Storage': 'in_storage', 'Assigned': 'assigned',
  'Out for Delivery': 'out_for_delivery', 'Delivered': 'delivered',
  'Client to Collect': 'to_collect', 'Client Collected': 'collected', 'Client Refused': 'refused',
}
// `date`-typed package columns: truncate any SharePoint datetime to YYYY-MM-DD
// (timestamptz columns like delivered_at/received_at keep the full value).
const PKG_DATE_FIELDS = new Set(['planned_delivery_date'])
async function _syncShipSyncPackages(cfg: SpConfig): Promise<{ synced: number; errors: number; samples?: string[] }> {
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  let allItems: any[] = []
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items?$expand=fields&$top=200`
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    const page = await res.json() as Record<string, any>
    if (!page.value) break
    allItems = allItems.concat(page.value as any[])
    nextUrl = page['@odata.nextLink'] ?? null
  }

  const { data: existing } = await fetchAllRows(() => (supabaseAdmin as any)
    .from('shipsync_packages').select('id, barcode, extra').order('id'))
  const byBarcode = new Map<string, string>()
  const bySpId = new Map<string, string>()
  const extraById = new Map<string, Record<string, any>>()
  for (const p of (existing ?? []) as Record<string, any>[]) {
    if (p.barcode) byBarcode.set(String(p.barcode).toLowerCase().trim(), String(p.id))
    const sp = p.extra?.sp_item_id
    if (sp) bySpId.set(String(sp), String(p.id))
    extraById.set(String(p.id), (p.extra ?? {}) as Record<string, any>)
  }

  const updateById = new Map<string, Record<string, any>>()
  const insertByKey = new Map<string, Record<string, any>>()

  for (const item of allItems) {
    if (item['@removed']) continue
    const fields = item.fields ?? {}
    const record: Record<string, any> = { sp_synced_at: new Date().toISOString() }

    for (const [spField, dbField] of Object.entries(cfg.fieldMapping)) {
      if (!dbField || !(spField in fields)) continue
      const raw = fields[spField]
      if (dbField === 'status') { record.status = SP_STATUS_REV[String(raw)] ?? 'in_office'; continue }
      if (dbField === 'num_packages') { record.num_packages = coerceNumeric(raw) ?? 1; continue }
      let val: any = raw !== '' && raw !== null && raw !== undefined ? raw : null
      if (val != null && PKG_DATE_FIELDS.has(dbField)) val = String(val).slice(0, 10)
      record[dbField] = val
    }

    // NOT NULL columns must be set on EVERY row: PostgREST bulk-inserts the batch
    // as a single statement using the UNION of keys, so a row missing a mapped
    // value gets an explicit NULL (bypassing the column default) and would fail.
    if (record.num_packages == null) record.num_packages = 1
    if (record.status == null) record.status = 'in_office'

    const existingId =
      bySpId.get(String(item.id)) ??
      (record.barcode ? byBarcode.get(String(record.barcode).toLowerCase().trim()) : undefined)

    if (existingId) {
      // Preserve any other keys already in extra (note links, photos, etc.).
      record.extra = { ...(extraById.get(existingId) ?? {}), sp_item_id: item.id }
      updateById.set(existingId, { ...record, id: existingId })
    } else {
      record.extra = { sp_item_id: item.id, imported_at: new Date().toISOString() }
      insertByKey.set(String(item.id), { ...record })
    }
  }

  return bulkPersist('shipsync_packages', updateById, insertByKey)
}

// ShipSync Drivers sync: SharePoint "Drivers" list → shipsync_drivers. The drivers
// table has no SharePoint-link column, so rows are matched by email then name
// (drivers are few and stable). Field-mapping keys are the SP column internal
// names; an unmatched mapping simply leaves that field blank (never an error).
async function _syncShipSyncDrivers(cfg: SpConfig): Promise<{ synced: number; errors: number; samples?: string[] }> {
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  let allItems: any[] = []
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items?$expand=fields&$top=200`
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    const page = await res.json() as Record<string, any>
    if (!page.value) break
    allItems = allItems.concat(page.value as any[])
    nextUrl = page['@odata.nextLink'] ?? null
  }

  const { data: existing } = await fetchAllRows(() => (supabaseAdmin as any)
    .from('shipsync_drivers').select('id, name, email').order('id'))
  const byEmail = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const d of (existing ?? []) as Record<string, any>[]) {
    if (d.email) byEmail.set(String(d.email).toLowerCase().trim(), String(d.id))
    if (d.name) byName.set(String(d.name).toLowerCase().trim(), String(d.id))
  }

  const updateById = new Map<string, Record<string, any>>()
  const insertByKey = new Map<string, Record<string, any>>()

  for (const item of allItems) {
    if (item['@removed']) continue
    const fields = item.fields ?? {}
    const record: Record<string, any> = {}
    for (const [spField, dbField] of Object.entries(cfg.fieldMapping)) {
      if (!dbField || !(spField in fields)) continue
      const raw = fields[spField]
      record[dbField] = raw !== '' && raw !== null && raw !== undefined ? raw : null
    }
    if (!record.name) continue // name is required (NOT NULL) for inserts

    const existingId =
      (record.email ? byEmail.get(String(record.email).toLowerCase().trim()) : undefined) ??
      byName.get(String(record.name).toLowerCase().trim())

    if (existingId) updateById.set(existingId, { ...record, id: existingId })
    else insertByKey.set(String(item.id), { ...record, active: record.active ?? true })
  }

  return bulkPersist('shipsync_drivers', updateById, insertByKey)
}

// Visa applications sync: SharePoint Visa list → visa_applications.
// Resolves crew name → crew_member_id and vessel name → yacht_id; matches
// existing rows by SharePoint item id, then jls_reference. Date-typed targets
// are truncated to YYYY-MM-DD.
async function _syncVisas(cfg: SpConfig): Promise<{ synced: number; errors: number; samples?: string[] }> {
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  let allItems: any[] = []
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items?$expand=fields&$top=200`
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    const page = await res.json() as Record<string, any>
    if (!page.value) break
    allItems = allItems.concat(page.value as any[])
    nextUrl = page['@odata.nextLink'] ?? null
  }

  // Lookups for resolving foreign keys by name.
  const { data: crew } = await fetchAllRows(() => (supabaseAdmin as any).from('crew_members').select('id, full_name').order('id'))
  const crewByName = new Map<string, string>()
  for (const c of (crew ?? []) as Record<string, any>[]) {
    if (c.full_name) crewByName.set(String(c.full_name).toLowerCase().trim(), String(c.id))
  }
  const { data: yachts } = await fetchAllRows(() => supabaseAdmin.from('yachts').select('id, vessel_name').order('id'))
  const yachtByName = new Map<string, string>()
  for (const y of (yachts ?? []) as Record<string, any>[]) {
    if (y.vessel_name) yachtByName.set(String(y.vessel_name).toLowerCase().trim(), String(y.id))
  }

  // Existing visa rows for matching.
  const { data: existing } = await fetchAllRows(() => (supabaseAdmin as any)
    .from('visa_applications').select('id, jls_reference, sharepoint_item_id').order('id'))
  const bySpId = new Map<string, string>()
  const byRef = new Map<string, string>()
  for (const v of (existing ?? []) as Record<string, any>[]) {
    if (v.sharepoint_item_id) bySpId.set(String(v.sharepoint_item_id), String(v.id))
    if (v.jls_reference) byRef.set(String(v.jls_reference).toLowerCase(), String(v.id))
  }

  const DATE_FIELDS = new Set(['planned_arrival', 'planned_departure'])
  const updateById = new Map<string, Record<string, any>>()
  const insertByKey = new Map<string, Record<string, any>>()

  for (const item of allItems) {
    if (item['@removed']) continue
    const fields = item.fields ?? {}
    const record: Record<string, any> = {
      sharepoint_item_id: item.id,
      sharepoint_synced_at: new Date().toISOString(),
    }

    for (const [spField, dbField] of Object.entries(cfg.fieldMapping)) {
      if (!dbField || !(spField in fields)) continue
      const raw = fields[spField]
      if (dbField === 'crew_member_name') {
        const id = crewByName.get(String(raw ?? '').toLowerCase().trim())
        if (id) record.crew_member_id = id
        continue
      }
      if (dbField === 'vessel_name') {
        const id = yachtByName.get(String(raw ?? '').toLowerCase().trim())
        if (id) record.yacht_id = id
        continue
      }
      let val: any = raw === '' || raw === undefined ? null : raw
      if (val != null && DATE_FIELDS.has(dbField)) val = String(val).slice(0, 10)
      record[dbField] = val
    }

    const existingId =
      bySpId.get(String(item.id)) ??
      (record.jls_reference ? byRef.get(String(record.jls_reference).toLowerCase()) : undefined)

    if (existingId) updateById.set(existingId, { ...record, id: existingId })
    else insertByKey.set(String(item.id), { ...record, status: record.status || 'submitted' })
  }

  return bulkPersist('visa_applications', updateById, insertByKey)
}

// Crew sync: a SharePoint crew/visa list (people with passports) → crew_members.
// Resolves vessel name → yacht_id; matches existing crew by SP item id, then
// passport number, then first+last name. Date-typed targets truncated to date.
async function _syncCrew(cfg: SpConfig): Promise<{ synced: number; errors: number; samples?: string[] }> {
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  let allItems: any[] = []
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items?$expand=fields&$top=200`
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    const page = await res.json() as Record<string, any>
    if (!page.value) break
    allItems = allItems.concat(page.value as any[])
    nextUrl = page['@odata.nextLink'] ?? null
  }

  const { data: yachts } = await fetchAllRows(() => supabaseAdmin.from('yachts').select('id, vessel_name').order('id'))
  const yachtByName = new Map<string, string>()
  for (const y of (yachts ?? []) as Record<string, any>[]) {
    if (y.vessel_name) yachtByName.set(String(y.vessel_name).toLowerCase().trim(), String(y.id))
  }

  const { data: existing } = await fetchAllRows(() => (supabaseAdmin as any)
    .from('crew_members').select('id, first_name, last_name, passport_number, sharepoint_item_id').order('id'))
  const bySpId = new Map<string, string>()
  const byPassport = new Map<string, string>()
  const byName = new Map<string, string>()
  const nameKey = (f: any, l: any) => `${String(f ?? '').toLowerCase().trim()}|${String(l ?? '').toLowerCase().trim()}`
  for (const c of (existing ?? []) as Record<string, any>[]) {
    if (c.sharepoint_item_id) bySpId.set(String(c.sharepoint_item_id), String(c.id))
    if (c.passport_number) byPassport.set(String(c.passport_number).toLowerCase().trim(), String(c.id))
    if (c.first_name && c.last_name) byName.set(nameKey(c.first_name, c.last_name), String(c.id))
  }

  const DATE_FIELDS = new Set(['date_of_birth', 'passport_issue_date', 'passport_expiry_date', 'seamans_book_expiry'])
  let skipped = 0
  const skipSamples: string[] = []
  const updateById = new Map<string, Record<string, any>>()
  const insertByKey = new Map<string, Record<string, any>>()

  for (const item of allItems) {
    if (item['@removed']) continue
    const fields = item.fields ?? {}
    const record: Record<string, any> = {
      sharepoint_item_id: item.id,
      sharepoint_synced_at: new Date().toISOString(),
    }

    for (const [spField, dbField] of Object.entries(cfg.fieldMapping)) {
      if (!dbField || !(spField in fields)) continue
      const raw = fields[spField]
      if (dbField === 'vessel_name') {
        const id = yachtByName.get(String(raw ?? '').toLowerCase().trim())
        if (id) record.yacht_id = id
        continue
      }
      let val: any = raw === '' || raw === undefined ? null : raw
      if (val != null && DATE_FIELDS.has(dbField)) val = String(val).slice(0, 10)
      record[dbField] = val
    }

    const existingId =
      bySpId.get(String(item.id)) ??
      (record.passport_number ? byPassport.get(String(record.passport_number).toLowerCase().trim()) : undefined) ??
      ((record.first_name && record.last_name) ? byName.get(nameKey(record.first_name, record.last_name)) : undefined)

    // Inserts require first + last name (NOT NULL); updates can be partial.
    if (!existingId && (!record.first_name || !record.last_name)) {
      skipped++
      const msg = 'Row skipped: SharePoint item has no first/last name mapped or populated'
      if (!skipSamples.includes(msg)) skipSamples.push(msg)
      continue
    }

    if (existingId) updateById.set(existingId, { ...record, id: existingId })
    // status AFTER the spread so a blank mapped SP "Status" can't clobber the
    // NOT NULL column with null (that failed every insert: 0 synced / N errors).
    else insertByKey.set(String(item.id), { ...record, status: record.status || 'active' })
  }

  const r = await bulkPersist('crew_members', updateById, insertByKey)
  return { synced: r.synced, errors: r.errors + skipped, samples: [...skipSamples, ...r.samples].slice(0, 8) }
}

function _permitTypeFromListName(listName: string): string | null {
  const n = listName.toLowerCase().trim()
  if (n.includes('gate')) return 'gate_pass'
  if (n.includes('tdra')) return 'tdra'
  if (n.includes('sanitation')) return 'sanitation'
  if (n.includes('exit') || n.includes('entry')) return 'exit_entry'
  if (n.includes('cruising') && n.includes('tender')) return 'cruising_tenders'
  if (n.includes('cruising')) return 'cruising_mothership'
  if (n.includes('navigation')) return 'navigation_license'
  if (n.includes('dma')) return 'dma'
  return null
}

// ─── Webhook subscription management ──────────────────────────────────────────

export async function registerSharePointWebhook(notificationUrl: string): Promise<{ subscriptionId: string; expiresAt: string }> {
  const cfg = await getSpConfig()
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)
  const listId = await getSpListId(token, siteId, cfg.listName)

  // SharePoint max subscription lifetime is 180 days; use 179 to stay safely under
  const expiry = new Date(Date.now() + 179 * 24 * 60 * 60 * 1000)

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/subscriptions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notificationUrl,
        expirationDateTime: expiry.toISOString(),
        clientState: 'jls-navigator-sp-sync',
      }),
    }
  )
  const data = await res.json() as Record<string, any>
  if (!data.id) {
    throw new Error(`Webhook registration failed: ${data.error?.message ?? JSON.stringify(data)}`)
  }

  await saveSpConfigPatch({
    webhook_subscription_id: data.id,
    webhook_expires_at: data.expirationDateTime,
  })

  return { subscriptionId: data.id, expiresAt: data.expirationDateTime }
}

export async function renewSharePointWebhook(): Promise<string> {
  const cfg = await getSpConfig()
  const subId = (cfg as any as Record<string, any>).webhook_subscription_id
  if (!subId) throw new Error('No webhook subscription registered')

  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)
  const listId = await getSpListId(token, siteId, cfg.listName)

  const expiry = new Date(Date.now() + 179 * 24 * 60 * 60 * 1000)

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/subscriptions/${subId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expirationDateTime: expiry.toISOString() }),
    }
  )
  const data = await res.json() as Record<string, any>
  const newExpiry = data.expirationDateTime ?? expiry.toISOString()
  await saveSpConfigPatch({ webhook_expires_at: newExpiry })
  return newExpiry
}

// ─── Folder creation: new yacht → SharePoint Documents/Yacht/{name} ───────────

export async function createYachtFolderInSharePoint(vesselName: string): Promise<string | null> {
  const cfg = await getSpConfig().catch(() => null)
  if (!cfg) return null

  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  // Get the default document library drive
  const driveRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const drive = await driveRes.json() as Record<string, any>
  if (!drive.id) return null

  // Create folder inside Shared Documents/Yacht/
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${drive.id}/root:/Shared%20Documents/Yacht:/children`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: vesselName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename',
      }),
    }
  )
  const folder = await res.json() as Record<string, any>
  return folder.webUrl ?? null
}

// ─── One-time setup: create the "Crew Sign On Off" SharePoint list + sync config ─
// Idempotent. Creates the list with fixed internal column names so the field
// mapping below is deterministic, then registers an enabled outbound sync config.
export async function setupSignonList(): Promise<{ ok: boolean; listId?: string; reason?: string }> {
  const cfg = await getSpConfig().catch(() => null)
  if (!cfg) return { ok: false, reason: 'SharePoint is not configured in Settings.' }

  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)
  const LIST_NAME = 'Crew Sign On Off'

  // Create the list (ignore "already exists").
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: LIST_NAME,
      list: { template: 'genericList' },
      columns: [
        { name: 'CrewName', text: {} },
        { name: 'Vessel', text: {} },
        { name: 'EventType', text: {} },
        { name: 'EventDate', dateTime: { format: 'dateOnly' } },
        { name: 'Port', text: {} },
        { name: 'Notes', text: { allowMultipleLines: true } },
      ],
    }),
  })
  let listId: string | undefined
  if (res.ok) {
    listId = ((await res.json()) as Record<string, any>).id
  } else {
    const err = (await res.json().catch(() => ({}))) as Record<string, any>
    const code = err?.error?.code
    if (code !== 'nameAlreadyExists') {
      return { ok: false, reason: `List could not be created: ${err?.error?.message ?? res.statusText}. The Azure app likely needs Sites.Manage.All.` }
    }
  }

  // Register the outbound sync config (idempotent on list_name).
  const fieldMapping = {
    Title: 'crew_member_name',
    CrewName: 'crew_member_name',
    Vessel: 'vessel_name',
    EventType: 'event_type',
    EventDate: 'event_date',
    Port: 'port',
    Notes: 'notes',
  }
  const { data: existing } = await (supabaseAdmin as any)
    .from('sharepoint_sync_configs').select('id').eq('list_name', LIST_NAME).maybeSingle()
  if (!existing) {
    await (supabaseAdmin as any).from('sharepoint_sync_configs').insert({
      name: LIST_NAME, list_name: LIST_NAME, sync_target: 'crew_signon_events',
      enabled: true, field_mapping: fieldMapping,
    })
  }
  return { ok: true, listId }
}

// Resolve the SharePoint list name + image column for yacht images. The mapping
// lives in the multi-sync "Yachts" config (sharepoint_sync_configs); the legacy
// integration_settings config often points elsewhere and has no image field.
async function getYachtImageConfig(cfg: SpConfig): Promise<{ listName: string; mapping: Record<string, string>; imageSpField: string | undefined }> {
  const syncs = await getSpSyncs().catch(() => [] as SpSyncConfig[])
  const yachtSync = syncs.find((s) => s.syncTarget === 'yachts' && s.fieldMapping && Object.keys(s.fieldMapping).length > 0)
  const mapping = yachtSync?.fieldMapping ?? cfg.fieldMapping
  const listName = yachtSync?.listName ?? cfg.listName
  const imageSpField = Object.entries(mapping).find(([, db]) => db === 'vessel_image')?.[0]
  return { listName, mapping, imageSpField }
}

// ─── Background image download (cron phase 2) ─────────────────────────────────
// Processes up to 5 yachts per invocation to stay within CF subrequest limits.
// Run after syncFromSharePoint() in the cron so images trickle in over time.

/** Find a yacht's SharePoint list item by IMO first, then exact vessel name. */
async function findSpItemIdForYacht(
  siteId: string,
  token: string,
  listName: string,
  mapping: Record<string, string>,
  yacht: { vessel_name: string | null; imo_no: string | null },
): Promise<string | null> {
  const imoSpField = Object.entries(mapping).find(([, db]) => db === 'imo_no')?.[0]
  const nameSpField = Object.entries(mapping).find(([, db]) => db === 'vessel_name')?.[0]
  const esc = (v: string) => v.replace(/'/g, "''")

  if (imoSpField && yacht.imo_no) {
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listName}/items?$filter=${encodeURIComponent(`fields/${imoSpField} eq '${esc(yacht.imo_no)}'`)}&$select=id`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const d = await r.json() as Record<string, any>
    if (d.value?.[0]?.id) return d.value[0].id
  }
  if (nameSpField && yacht.vessel_name) {
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listName}/items?$filter=${encodeURIComponent(`fields/${nameSpField} eq '${esc(yacht.vessel_name)}'`)}&$select=id`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const d = await r.json() as Record<string, any>
    if (d.value?.[0]?.id) return d.value[0].id
  }
  return null
}

export async function downloadPendingImages(
  limit = 10,
  offset = 0,
): Promise<{ downloaded: number; processed: number; results: Array<{ id: string; ok: boolean; reason?: string }> }> {
  const cfg = await getSpConfig().catch(() => null)
  if (!cfg) return { downloaded: 0, processed: 0, results: [] }

  // The image field + list live in the multi-sync "Yachts" config, NOT the legacy
  // integration_settings config (which may point at a different list with no image
  // mapping). Fall back to the legacy config only if there's no yachts sync.
  const { listName, mapping, imageSpField } = await getYachtImageConfig(cfg)
  if (!imageSpField) return { downloaded: 0, processed: 0, results: [] }

  // Find yachts whose image still needs downloading: either no image yet, OR a
  // legacy raw SharePoint descriptor (JSON starting with "{") was written into
  // vessel_image instead of a downloaded URL. Yachts with no sharepoint_item_id
  // are INCLUDED — we search SharePoint by IMO/name and link them on the fly
  // (previously only the per-yacht manual sync did this, so bulk runs silently
  // skipped every unlinked vessel). `offset` lets the caller page past rows that
  // keep failing, so one bad batch can't block the vessels behind it.
  const { data: pending } = await supabaseAdmin
    .from('yachts')
    .select('id, vessel_name, imo_no, sharepoint_item_id')
    .or('vessel_image.is.null,vessel_image.like.{*')
    .order('vessel_name', { ascending: true })
    .range(offset, offset + limit - 1) as {
      data: Array<{ id: string; vessel_name: string | null; imo_no: string | null; sharepoint_item_id: string | null }> | null
    }

  if (!pending?.length) return { downloaded: 0, processed: 0, results: [] }

  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  let downloaded = 0
  const results: Array<{ id: string; ok: boolean; reason?: string }> = []
  for (const yacht of pending) {
    try {
      // Establish the SharePoint link first if this yacht never got one.
      let spItemId = yacht.sharepoint_item_id
      if (!spItemId) {
        spItemId = await findSpItemIdForYacht(siteId, token, listName, mapping, yacht)
        if (!spItemId) {
          results.push({ id: yacht.id, ok: false, reason: 'Not found in the SharePoint list (no IMO or exact-name match)' })
          continue
        }
        await supabaseAdmin.from('yachts').update({ sharepoint_item_id: spItemId } as never).eq('id', yacht.id)
      }

      const res = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listName}/items/${spItemId}?$expand=fields($select=${encodeURIComponent(imageSpField)})`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) { results.push({ id: yacht.id, ok: false, reason: `SharePoint item fetch HTTP ${res.status}` }); continue }
      const item = await res.json() as Record<string, any>
      const raw = item.fields?.[imageSpField]
      if (!raw) { results.push({ id: yacht.id, ok: false, reason: 'No image value on the SharePoint item' }); continue }

      const { url, reason } = await fetchSpImageToSupabase(raw, token, cfg.tenantUrl, spItemId, cfg.tenantId, cfg.clientId, cfg.clientSecret)
      if (url) {
        await supabaseAdmin.from('yachts').update({ vessel_image: url } as never).eq('id', yacht.id)
        downloaded++
        results.push({ id: yacht.id, ok: true })
      } else {
        results.push({ id: yacht.id, ok: false, reason: reason ?? 'unknown image-download failure' })
      }
    } catch (e) {
      results.push({ id: yacht.id, ok: false, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  return { downloaded, processed: pending.length, results }
}

// Download the SP image for a single yacht by its DB id (on-demand, e.g. from the detail page button).
// If the yacht has no sharepoint_item_id yet, searches SP by IMO or vessel_name first to establish the link.
export async function downloadYachtImage(yachtId: string): Promise<{ url: string | null; reason?: string }> {
  const cfg = await getSpConfig().catch(() => null)
  if (!cfg) return { url: null, reason: 'SharePoint is not configured in Settings.' }

  const { listName, mapping, imageSpField } = await getYachtImageConfig(cfg)
  if (!imageSpField) return { url: null, reason: 'No image field is mapped in the Yachts SharePoint sync.' }

  const { data: yacht } = await supabaseAdmin
    .from('yachts')
    .select('id, vessel_name, imo_no, sharepoint_item_id')
    .eq('id', yachtId)
    .maybeSingle() as { data: { id: string; vessel_name: string | null; imo_no: string | null; sharepoint_item_id: string | null } | null }

  if (!yacht) return { url: null, reason: 'Yacht not found.' }

  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  let spItemId = yacht.sharepoint_item_id

  // If no SP item link, try to find the item by IMO or vessel name
  if (!spItemId) {
    const imoSpField = Object.entries(mapping).find(([, db]) => db === 'imo_no')?.[0]
    const nameSpField = Object.entries(mapping).find(([, db]) => db === 'vessel_name')?.[0]

    if (imoSpField && yacht.imo_no) {
      const r = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listName}/items?$filter=${encodeURIComponent(`fields/${imoSpField} eq '${yacht.imo_no}'`)}&$select=id`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const d = await r.json() as Record<string, any>
      spItemId = d.value?.[0]?.id ?? null
    }

    if (!spItemId && nameSpField && yacht.vessel_name) {
      const r = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listName}/items?$filter=${encodeURIComponent(`fields/${nameSpField} eq '${yacht.vessel_name}'`)}&$select=id`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const d = await r.json() as Record<string, any>
      spItemId = d.value?.[0]?.id ?? null
    }

    if (!spItemId) {
      return { url: null, reason: `"${yacht.vessel_name}" was not found in the SharePoint list. Check that the vessel name or IMO matches exactly.` }
    }

    // Save the link so future syncs are instant
    await supabaseAdmin
      .from('yachts')
      .update({ sharepoint_item_id: spItemId } as never)
      .eq('id', yachtId)
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listName}/items/${spItemId}?$expand=fields($select=${encodeURIComponent(imageSpField)})`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const item = await res.json() as Record<string, any>
  const raw = item.fields?.[imageSpField]
  if (!raw) return { url: null, reason: 'The SharePoint item has no image attached to the mapped image field.' }

  const { url, reason } = await fetchSpImageToSupabase(raw, token, cfg.tenantUrl, spItemId, cfg.tenantId, cfg.clientId, cfg.clientSecret)
  if (url) {
    await supabaseAdmin.from('yachts').update({ vessel_image: url } as never).eq('id', yachtId)
  }
  return { url: url ?? null, reason: url ? undefined : reason }
}
