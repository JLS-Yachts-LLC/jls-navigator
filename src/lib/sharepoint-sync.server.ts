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
}

// ─── Config helpers ────────────────────────────────────────────────────────────

export async function getSpConfig(): Promise<SpConfig> {
  const { data: row } = await (supabaseAdmin as any)
    .from('integration_settings')
    .select('config')
    .eq('integration_name', 'sharepoint')
    .maybeSingle()
  const cfg = row?.config ?? {}
  const { tenant_id, client_id, client_secret, tenant_url, site_url, list_name, field_mapping } = cfg
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
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
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

// ─── Inbound: SharePoint → App (delta sync) ────────────────────────────────────

export async function syncFromSharePoint(): Promise<{ synced: number; errors: number }> {
  const cfg = await getSpConfig()
  if (Object.keys(cfg.fieldMapping).length === 0) return { synced: 0, errors: 0 }

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
      record[dbField] = fields[spField] !== '' ? fields[spField] : null
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

// ─── Webhook subscription management ──────────────────────────────────────────

export async function registerSharePointWebhook(notificationUrl: string): Promise<{ subscriptionId: string; expiresAt: string }> {
  const cfg = await getSpConfig()
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl)
  const listId = await getSpListId(token, siteId, cfg.listName)

  // SharePoint webhook subscriptions last max 6 months
  const expiry = new Date()
  expiry.setMonth(expiry.getMonth() + 6)

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

  const expiry = new Date()
  expiry.setMonth(expiry.getMonth() + 6)

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
