import { supabaseAdmin } from '@/integrations/supabase/client.server'

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
  syncTarget: 'yachts' | 'permits' | 'small_boats' | 'visa_applications' | 'crew_members'
  fieldMapping: Record<string, string>
  enabled: boolean
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
    deltaToken: r.delta_token ?? null,
    lastSyncedAt: r.last_synced_at ?? null,
    lastSyncSynced: r.last_sync_synced ?? null,
    lastSyncErrors: r.last_sync_errors ?? null,
  }))
}

export async function saveSpSync(
  sync: Pick<SpSyncConfig, 'id' | 'name' | 'listName' | 'syncTarget' | 'fieldMapping' | 'enabled'> & { id?: string },
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
    enabled: row.enabled, deltaToken: row.delta_token ?? null,
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

export async function syncById(id: string): Promise<{ synced: number; errors: number }> {
  const syncs = await getSpSyncs()
  const sync = syncs.find(s => s.id === id)
  if (!sync) throw new Error(`Sync config not found: ${id}`)
  const cfg = await getSpConfig()
  const result = await _syncWithConfig(cfg, sync)
  return result
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
    const result = await uploadUrlToSupabase(
      `${serverUrl}${serverRelativeUrl}`,
      downloadToken,
      spItemId,
      img.fileName ?? 'sp-image',
    )
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

export async function syncFromSharePoint(): Promise<{ synced: number; errors: number }> {
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
async function _syncWithConfig(cfg: SpConfig, sync: SpSyncConfig): Promise<{ synced: number; errors: number }> {
  const merged: SpConfig = {
    ...cfg,
    listName: sync.listName,
    fieldMapping: sync.fieldMapping,
    syncTarget: sync.syncTarget,
  }
  let result: { synced: number; errors: number }
  if (sync.syncTarget === 'permits') {
    result = await _syncPermits(merged)
  } else if (sync.syncTarget === 'small_boats') {
    result = await _syncSmallBoats(merged)
  } else if (sync.syncTarget === 'visa_applications') {
    result = await _syncVisas(merged)
  } else if (sync.syncTarget === 'crew_members') {
    result = await _syncCrew(merged)
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

async function _syncYachts(
  cfg: SpConfig,
  syncId?: string,
  preloadedDeltaToken?: string | null,
): Promise<{ synced: number; errors: number }> {
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  // Load stored delta token for incremental sync
  let storedDeltaToken: string | null
  if (preloadedDeltaToken !== undefined) {
    // Multi-sync path: delta token comes from sharepoint_sync_configs row
    storedDeltaToken = preloadedDeltaToken
  } else {
    // Legacy path: read from integration_settings
    const { data: settingsRow } = await (supabaseAdmin as any)
      .from('integration_settings')
      .select('config')
      .eq('integration_name', 'sharepoint')
      .maybeSingle()
    storedDeltaToken = settingsRow?.config?.delta_token ?? null
  }

  const baseUrl = storedDeltaToken
    ? `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items/delta?$deltatoken=${encodeURIComponent(storedDeltaToken)}&$expand=fields`
    : `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items/delta?$expand=fields`

  let allChanged: any[] = []
  let nextUrl: string | null = baseUrl
  let newDeltaLink: string | null = null

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    const page = await res.json() as Record<string, any>
    if (!page.value) break
    allChanged = allChanged.concat(page.value as any[])
    nextUrl = page['@odata.nextLink'] ?? null
    if (page['@odata.deltaLink']) newDeltaLink = page['@odata.deltaLink'] as string
  }

  // Load ALL existing yachts once — avoids N per-item DB round trips
  const { data: existingYachts } = await supabaseAdmin
    .from('yachts')
    .select('id, vessel_name, imo_no, sharepoint_item_id')
  const bySpId = new Map<string, string>()
  const byImo = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const y of (existingYachts ?? []) as Record<string, any>[]) {
    if (y.sharepoint_item_id) bySpId.set(String(y.sharepoint_item_id), String(y.id))
    if (y.imo_no) byImo.set(String(y.imo_no).toLowerCase(), String(y.id))
    if (y.vessel_name) byName.set(String(y.vessel_name).toLowerCase(), String(y.id))
  }

  let synced = 0, errors = 0
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
    if (!record.vessel_name) continue

    record.sharepoint_item_id = item.id
    record.sharepoint_synced_at = new Date().toISOString()

    // In-memory match — no extra DB queries
    const existingId =
      bySpId.get(String(item.id)) ??
      (record.imo_no ? byImo.get(String(record.imo_no).toLowerCase()) : undefined) ??
      byName.get(String(record.vessel_name).toLowerCase())

    const { error } = existingId
      ? await supabaseAdmin.from('yachts').update(record as never).eq('id', existingId)
      : await supabaseAdmin.from('yachts').insert({ ...record, status: record.status ?? 'Active' } as never)

    if (error) {
      errors++
    } else {
      synced++
      // Update local maps so subsequent items in the same batch can match
      bySpId.set(String(item.id), existingId ?? record.vessel_name)
      if (record.imo_no) byImo.set(String(record.imo_no).toLowerCase(), existingId ?? '')
      byName.set(String(record.vessel_name).toLowerCase(), existingId ?? '')
    }
  }

  // Persist new delta token so next run is incremental
  if (newDeltaLink) {
    const newToken = new URL(newDeltaLink).searchParams.get('$deltatoken')
    if (newToken) {
      if (syncId) {
        // Multi-sync path: save to the sync config row
        await (supabaseAdmin as any)
          .from('sharepoint_sync_configs')
          .update({ delta_token: newToken })
          .eq('id', syncId)
      } else {
        // Legacy path: save to integration_settings
        await saveSpConfigPatch({ delta_token: newToken })
      }
    }
  }

  return { synced, errors }
}

async function _syncPermits(cfg: SpConfig): Promise<{ synced: number; errors: number }> {
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

  // Load existing permits for matching
  const { data: existingPermits } = await (supabaseAdmin as any)
    .from('permits')
    .select('id, permit_number, holder_name')
  const byPermitNo = new Map<string, string>()
  const byHolderName = new Map<string, string>()
  for (const p of (existingPermits ?? []) as Record<string, any>[]) {
    if (p.permit_number) byPermitNo.set(String(p.permit_number).toLowerCase(), String(p.id))
    if (p.holder_name) byHolderName.set(String(p.holder_name).toLowerCase(), String(p.id))
  }

  // Preload yachts for vessel_name → yacht_id resolution
  const { data: yachts } = await supabaseAdmin.from('yachts').select('id, vessel_name')
  const yachtByName = new Map<string, string>()
  for (const y of (yachts ?? []) as Record<string, any>[]) {
    if (y.vessel_name) yachtByName.set(String(y.vessel_name).toLowerCase(), String(y.id))
  }

  let synced = 0, errors = 0

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

    const existingId =
      (record.permit_number
        ? byPermitNo.get(String(record.permit_number).toLowerCase())
        : undefined) ??
      (record.holder_name
        ? byHolderName.get(String(record.holder_name).toLowerCase())
        : undefined)

    const { error } = existingId
      ? await (supabaseAdmin as any).from('permits').update(record).eq('id', existingId)
      : await (supabaseAdmin as any).from('permits').insert({ ...record })

    if (error) {
      errors++
    } else {
      synced++
      if (record.permit_number)
        byPermitNo.set(String(record.permit_number).toLowerCase(), existingId ?? 'new')
      if (record.holder_name)
        byHolderName.set(String(record.holder_name).toLowerCase(), existingId ?? 'new')
    }
  }

  return { synced, errors }
}

// Small boats sync: same pattern as permits but targets small_boats table
async function _syncSmallBoats(cfg: SpConfig): Promise<{ synced: number; errors: number }> {
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
  const { data: existing } = await (supabaseAdmin as any)
    .from('small_boats')
    .select('id, boat_name')
  const byName = new Map<string, string>()
  for (const b of (existing ?? []) as Record<string, any>[]) {
    if (b.boat_name) byName.set(String(b.boat_name).toLowerCase(), String(b.id))
  }

  let synced = 0, errors = 0

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

    const existingId = byName.get(String(record.boat_name).toLowerCase())

    const { error } = existingId
      ? await (supabaseAdmin as any).from('small_boats').update(record).eq('id', existingId)
      : await (supabaseAdmin as any).from('small_boats').insert({ ...record })

    if (error) {
      errors++
    } else {
      synced++
      byName.set(String(record.boat_name).toLowerCase(), existingId ?? 'new')
    }
  }

  return { synced, errors }
}

// Visa applications sync: SharePoint Visa list → visa_applications.
// Resolves crew name → crew_member_id and vessel name → yacht_id; matches
// existing rows by SharePoint item id, then jls_reference. Date-typed targets
// are truncated to YYYY-MM-DD.
async function _syncVisas(cfg: SpConfig): Promise<{ synced: number; errors: number }> {
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
  const { data: crew } = await (supabaseAdmin as any).from('crew_members').select('id, full_name')
  const crewByName = new Map<string, string>()
  for (const c of (crew ?? []) as Record<string, any>[]) {
    if (c.full_name) crewByName.set(String(c.full_name).toLowerCase().trim(), String(c.id))
  }
  const { data: yachts } = await supabaseAdmin.from('yachts').select('id, vessel_name')
  const yachtByName = new Map<string, string>()
  for (const y of (yachts ?? []) as Record<string, any>[]) {
    if (y.vessel_name) yachtByName.set(String(y.vessel_name).toLowerCase().trim(), String(y.id))
  }

  // Existing visa rows for matching.
  const { data: existing } = await (supabaseAdmin as any)
    .from('visa_applications').select('id, jls_reference, sharepoint_item_id')
  const bySpId = new Map<string, string>()
  const byRef = new Map<string, string>()
  for (const v of (existing ?? []) as Record<string, any>[]) {
    if (v.sharepoint_item_id) bySpId.set(String(v.sharepoint_item_id), String(v.id))
    if (v.jls_reference) byRef.set(String(v.jls_reference).toLowerCase(), String(v.id))
  }

  const DATE_FIELDS = new Set(['planned_arrival', 'planned_departure'])
  let synced = 0, errors = 0

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

    const { error } = existingId
      ? await (supabaseAdmin as any).from('visa_applications').update(record).eq('id', existingId)
      : await (supabaseAdmin as any).from('visa_applications').insert({ status: 'submitted', ...record })

    if (error) {
      errors++
    } else {
      synced++
      bySpId.set(String(item.id), existingId ?? 'new')
      if (record.jls_reference) byRef.set(String(record.jls_reference).toLowerCase(), existingId ?? 'new')
    }
  }

  return { synced, errors }
}

// Crew sync: a SharePoint crew/visa list (people with passports) → crew_members.
// Resolves vessel name → yacht_id; matches existing crew by SP item id, then
// passport number, then first+last name. Date-typed targets truncated to date.
async function _syncCrew(cfg: SpConfig): Promise<{ synced: number; errors: number }> {
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

  const { data: yachts } = await supabaseAdmin.from('yachts').select('id, vessel_name')
  const yachtByName = new Map<string, string>()
  for (const y of (yachts ?? []) as Record<string, any>[]) {
    if (y.vessel_name) yachtByName.set(String(y.vessel_name).toLowerCase().trim(), String(y.id))
  }

  const { data: existing } = await (supabaseAdmin as any)
    .from('crew_members').select('id, first_name, last_name, passport_number, sharepoint_item_id')
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
  let synced = 0, errors = 0

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
    if (!existingId && (!record.first_name || !record.last_name)) { errors++; continue }

    const { error } = existingId
      ? await (supabaseAdmin as any).from('crew_members').update(record).eq('id', existingId)
      : await (supabaseAdmin as any).from('crew_members').insert({ status: 'active', ...record })

    if (error) {
      errors++
    } else {
      synced++
      bySpId.set(String(item.id), existingId ?? 'new')
      if (record.passport_number) byPassport.set(String(record.passport_number).toLowerCase().trim(), existingId ?? 'new')
      if (record.first_name && record.last_name) byName.set(nameKey(record.first_name, record.last_name), existingId ?? 'new')
    }
  }

  return { synced, errors }
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

// ─── Background image download (cron phase 2) ─────────────────────────────────
// Processes up to 5 yachts per invocation to stay within CF subrequest limits.
// Run after syncFromSharePoint() in the cron so images trickle in over time.

export async function downloadPendingImages(): Promise<number> {
  const cfg = await getSpConfig().catch(() => null)
  if (!cfg) return 0

  const imageSpField = Object.entries(cfg.fieldMapping).find(([, db]) => db === 'vessel_image')?.[0]
  if (!imageSpField) return 0

  // Find yachts synced from SP that still have no image
  const { data: pending } = await supabaseAdmin
    .from('yachts')
    .select('id, sharepoint_item_id')
    .not('sharepoint_item_id', 'is', null)
    .is('vessel_image', null)
    .limit(5) as { data: Array<{ id: string; sharepoint_item_id: string }> | null }

  if (!pending?.length) return 0

  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  let downloaded = 0
  for (const yacht of pending) {
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items/${yacht.sharepoint_item_id}?$expand=fields($select=${encodeURIComponent(imageSpField)})`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const item = await res.json() as Record<string, any>
      const raw = item.fields?.[imageSpField]
      if (!raw) continue

      const { url } = await fetchSpImageToSupabase(raw, token, cfg.tenantUrl, yacht.sharepoint_item_id, cfg.tenantId, cfg.clientId, cfg.clientSecret)
      if (url) {
        await supabaseAdmin.from('yachts').update({ vessel_image: url } as never).eq('id', yacht.id)
        downloaded++
      }
    } catch {
      // Non-fatal — will retry on next cron run
    }
  }
  return downloaded
}

// Download the SP image for a single yacht by its DB id (on-demand, e.g. from the detail page button).
// If the yacht has no sharepoint_item_id yet, searches SP by IMO or vessel_name first to establish the link.
export async function downloadYachtImage(yachtId: string): Promise<{ url: string | null; reason?: string }> {
  const cfg = await getSpConfig().catch(() => null)
  if (!cfg) return { url: null, reason: 'SharePoint is not configured in Settings.' }

  const imageSpField = Object.entries(cfg.fieldMapping).find(([, db]) => db === 'vessel_image')?.[0]
  if (!imageSpField) return { url: null, reason: 'No image field is mapped in SharePoint settings.' }

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
    const imoSpField = Object.entries(cfg.fieldMapping).find(([, db]) => db === 'imo_no')?.[0]
    const nameSpField = Object.entries(cfg.fieldMapping).find(([, db]) => db === 'vessel_name')?.[0]

    if (imoSpField && yacht.imo_no) {
      const r = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items?$filter=${encodeURIComponent(`fields/${imoSpField} eq '${yacht.imo_no}'`)}&$select=id`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const d = await r.json() as Record<string, any>
      spItemId = d.value?.[0]?.id ?? null
    }

    if (!spItemId && nameSpField && yacht.vessel_name) {
      const r = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items?$filter=${encodeURIComponent(`fields/${nameSpField} eq '${yacht.vessel_name}'`)}&$select=id`,
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
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${cfg.listName}/items/${spItemId}?$expand=fields($select=${encodeURIComponent(imageSpField)})`,
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
