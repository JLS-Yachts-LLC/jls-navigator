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
  const cfg = await getSpConfig()
  if (Object.keys(cfg.fieldMapping).length === 0) return { synced: 0, errors: 0 }

  if (cfg.syncTarget === 'permits') return _syncPermits(cfg)
  // small_boats: placeholder until table confirmed
  if (cfg.syncTarget === 'small_boats') return { synced: 0, errors: 0 }
  return _syncYachts(cfg)
}

async function _syncYachts(cfg: SpConfig): Promise<{ synced: number; errors: number }> {
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)

  // Load stored delta token for incremental sync
  const { data: settingsRow } = await (supabaseAdmin as any)
    .from('integration_settings')
    .select('config')
    .eq('integration_name', 'sharepoint')
    .maybeSingle()
  const storedDeltaToken: string | null = settingsRow?.config?.delta_token ?? null

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
      await saveSpConfigPatch({ delta_token: newToken })
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
