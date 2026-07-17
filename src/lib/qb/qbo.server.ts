/**
 * QuickBooks Online API client for the worker (edge runtime).
 *
 * OAuth2 with a rotating refresh token, persisted in `qbo_tokens` so the access
 * token is cached and the (rotating) refresh token survives restarts. Resilient:
 * refreshes on 401 and retries 429/5xx with backoff.
 *
 * Required Wrangler secrets (wire after build): QBO_CLIENT_ID, QBO_CLIENT_SECRET,
 * QBO_REFRESH_TOKEN (initial), and optionally QBO_REALM_ID (defaults to the JLS realm).
 */
import { createClient } from '@supabase/supabase-js'

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const API_BASE = 'https://quickbooks.api.intuit.com/v3/company'

export function qboRealm(): string {
  return process.env.QBO_REALM_ID ?? '9341454112300561'
}
export function qboConfigured(): boolean {
  // App credentials are enough to be "configured": the refresh token can come
  // either from the QBO_REFRESH_TOKEN seed env var OR the in-app Connect flow
  // (stored in qbo_tokens). refreshAccessToken() throws a clear error if neither exists.
  return !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET)
}
function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

const enc = new TextEncoder()
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Exchange the stored (or seed) refresh token for a fresh access token; persist rotation. */
async function refreshAccessToken(sb: any, realm: string): Promise<string> {
  const { data: row } = await sb.from('qbo_tokens').select('refresh_token').eq('realm_id', realm).maybeSingle()
  // The env seed token belongs to the DEFAULT realm only — a secondary realm
  // (e.g. Superyacht ME retail) must be connected via /api/qb/connect.
  const refreshToken = row?.refresh_token ?? (realm === qboRealm() ? process.env.QBO_REFRESH_TOKEN : undefined)
  if (!refreshToken) throw new Error(`QBO realm ${realm} is not connected — connect it via /api/qb/connect`)

  const basic = btoa(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`)
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  })
  if (!res.ok) throw new Error(`QBO token refresh failed (${res.status}): ${await res.text().catch(() => '')}`)
  const j: any = await res.json()
  const now = Date.now()
  await sb.from('qbo_tokens').upsert({
    realm_id: realm,
    access_token: j.access_token,
    access_expires_at: new Date(now + (j.expires_in ?? 3600) * 1000).toISOString(),
    refresh_token: j.refresh_token ?? refreshToken,
    refresh_expires_at: new Date(now + (j.x_refresh_token_expires_in ?? 8726400) * 1000).toISOString(),
    updated_at: new Date(now).toISOString(),
  }, { onConflict: 'realm_id' })
  return j.access_token
}

async function getAccessToken(sb: any, realm: string, force = false): Promise<string> {
  if (!force) {
    const { data: row } = await sb.from('qbo_tokens').select('access_token, access_expires_at').eq('realm_id', realm).maybeSingle()
    if (row?.access_token && row.access_expires_at && new Date(row.access_expires_at).getTime() > Date.now() + 60_000) {
      return row.access_token
    }
  }
  return refreshAccessToken(sb, realm)
}

/** Make an authenticated QBO request. Path is relative to /v3/company/{realm}.
 *  Pass realmOverride to talk to a secondary company (e.g. the Superyacht ME
 *  retail realm) — its tokens must exist in qbo_tokens (via /api/qb/connect). */
export async function qboRequest(method: string, path: string, body?: unknown, realmOverride?: string): Promise<any> {
  if (!qboConfigured()) throw new Error('QBO not configured (QBO_CLIENT_ID/SECRET/REFRESH_TOKEN missing)')
  const sb = admin()
  const realm = realmOverride ?? qboRealm()
  let token = await getAccessToken(sb, realm)
  const url = `${API_BASE}/${realm}${path}`

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (res.status === 401 && attempt === 0) { token = await getAccessToken(sb, realm, true); continue } // expired → refresh once
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(500 * (attempt + 1)); continue }
    if (!res.ok) throw new Error(`QBO ${method} ${path} → ${res.status}: ${await res.text().catch(() => '')}`)
    return res.json()
  }
  throw new Error(`QBO ${method} ${path} failed after retries`)
}

/** Run a QBO SQL-ish query (read). */
export async function qboQuery(query: string, realmOverride?: string): Promise<any> {
  return qboRequest('GET', `/query?query=${encodeURIComponent(query)}&minorversion=73`, undefined, realmOverride)
}

/** Upload a file to QBO and link it to an entity (multipart /upload endpoint).
 *  Returns the created Attachable object. */
export async function qboUpload(
  fileName: string,
  bytes: Uint8Array,
  contentType: string,
  entityType: string,
  entityId: string,
): Promise<any> {
  if (!qboConfigured()) throw new Error('QBO not configured')
  const sb = admin()
  const realm = qboRealm()
  let token = await getAccessToken(sb, realm)
  const url = `${API_BASE}/${realm}/upload?minorversion=73`

  const metadata = JSON.stringify({
    AttachableRef: [{ IncludeOnSend: false, EntityRef: { type: entityType, value: String(entityId) } }],
    ContentType: contentType,
    FileName: fileName,
  })

  for (let attempt = 0; attempt < 4; attempt++) {
    const form = new FormData()
    form.append('file_metadata_01', new Blob([metadata], { type: 'application/json' }), 'attachment.json')
    form.append('file_content_01', new Blob([bytes as unknown as BlobPart], { type: contentType }), fileName)
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      body: form,
    })
    if (res.status === 401 && attempt === 0) { token = await getAccessToken(sb, realm, true); continue }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(500 * (attempt + 1)); continue }
    const j: any = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`QBO upload ${fileName} → ${res.status}: ${JSON.stringify(j).slice(0, 300)}`)
    const attachable = j?.AttachableResponse?.[0]?.Attachable
    const fault = j?.AttachableResponse?.[0]?.Fault
    if (fault) throw new Error(`QBO upload fault: ${JSON.stringify(fault).slice(0, 300)}`)

    // QBO often stores the uploaded file WITHOUT actually linking it to the entity,
    // even when the response echoes an AttachableRef. Mirror the proven n8n flow:
    // ALWAYS follow up with an /attachable update (Id + SyncToken + AttachableRef)
    // so the PDF genuinely shows on the invoice/estimate/PO.
    let upd: any = null
    let verify: any = null
    if (attachable?.Id) {
      upd = await qboRequest('POST', `/attachable?minorversion=73`, {
        Id: attachable.Id,
        SyncToken: attachable.SyncToken ?? '0',
        FileName: fileName,
        ContentType: contentType,
        AttachableRef: [{ IncludeOnSend: false, EntityRef: { type: entityType, value: String(entityId) } }],
      }).catch((e: any) => ({ __error: e?.message ?? String(e) }))
      // Post-bind verification: read the Attachable back and see what QBO REALLY stored.
      verify = await qboRequest('GET', `/attachable/${attachable.Id}?minorversion=73`).catch((e: any) => ({ __error: e?.message ?? String(e) }))
    }
    // Debug trail (temporary): raw responses so attach failures are diagnosable
    // from the Automations run log instead of guessed at.
    try {
      const { logAutomationRun } = await import('@/lib/automations.server')
      const slim = (o: any) => JSON.stringify(o ?? null).slice(0, 600)
      await logAutomationRun({
        key: 'qb-attach-debug', name: 'QB Attach (raw debug)', source: 'worker', trigger_type: 'event', category: 'Finance',
        status: 'success',
        detail: `${fileName} → ${entityType}/${entityId} | upload=${slim(j?.AttachableResponse?.[0])} | bind=${slim(upd)} | verify=${slim((verify as any)?.Attachable ?? verify)}`,
      })
    } catch { /* debug only */ }
    const bound = upd?.Attachable
    if (attachable?.Id && !bound?.Id) throw new Error(`QBO attach-link for ${fileName} returned no Attachable: ${JSON.stringify(upd ?? {}).slice(0, 300)}`)
    return bound ?? attachable
  }
  throw new Error(`QBO upload ${fileName} failed after retries`)
}

/** Fetch a QBO-rendered PDF (e.g. /invoice/{id}/pdf or /estimate/{id}/pdf) as bytes.
 *  Pass realmOverride for a secondary company (e.g. the Waypoint retail realm). */
export async function qboPdf(path: string, realmOverride?: string): Promise<ArrayBuffer> {
  if (!qboConfigured()) throw new Error('QBO not configured')
  const sb = admin()
  const realm = realmOverride ?? qboRealm()
  let token = await getAccessToken(sb, realm)
  const url = `${API_BASE}/${realm}${path}`
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' } })
    if (res.status === 401 && attempt === 0) { token = await getAccessToken(sb, realm, true); continue }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(500 * (attempt + 1)); continue }
    if (!res.ok) throw new Error(`QBO PDF ${path} → ${res.status}`)
    return res.arrayBuffer()
  }
  throw new Error(`QBO PDF ${path} failed after retries`)
}
