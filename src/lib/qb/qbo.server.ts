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
  const refreshToken = row?.refresh_token ?? process.env.QBO_REFRESH_TOKEN
  if (!refreshToken) throw new Error('QBO not configured: no refresh token (set QBO_REFRESH_TOKEN secret)')

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

/** Make an authenticated QBO request. Path is relative to /v3/company/{realm}. */
export async function qboRequest(method: string, path: string, body?: unknown): Promise<any> {
  if (!qboConfigured()) throw new Error('QBO not configured (QBO_CLIENT_ID/SECRET/REFRESH_TOKEN missing)')
  const sb = admin()
  const realm = qboRealm()
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
export async function qboQuery(query: string): Promise<any> {
  return qboRequest('GET', `/query?query=${encodeURIComponent(query)}&minorversion=73`)
}

/** Fetch a QBO-rendered PDF (e.g. /invoice/{id}/pdf or /estimate/{id}/pdf) as bytes. */
export async function qboPdf(path: string): Promise<ArrayBuffer> {
  if (!qboConfigured()) throw new Error('QBO not configured')
  const sb = admin()
  const realm = qboRealm()
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
