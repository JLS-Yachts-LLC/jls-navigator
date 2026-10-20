/**
 * Compass Card → Polaris events: checking, shaping and storing what Compass Card sends.
 *
 * Compass Card (compasscard.online) POSTs one JSON event per happening to
 * /api/compass-card/event:
 *
 *   { "id": "vendor_signup:42", "type": "vendor_signup", "occurred_at": "2026-10-20T09:15:00Z",
 *     "data": { ...fields for that type... } }
 *
 * signed with Compass Card's RSA private key (generated on its own server, never
 * copied anywhere). Polaris holds only the public key (compass_card_integration.public_key):
 *
 *   X-Compass-Timestamp: <unix seconds>
 *   X-Compass-Signature: base64(RSASSA-PKCS1-v1_5 SHA-256 signature of "<timestamp>.<raw body>")
 *
 * Only the fields listed below are kept (no passport, ID or card numbers ever),
 * and the title / summary the team reads are built here, not taken from the sender.
 * Stored once per id (a resend is ignored); the bell rings from the database
 * trigger (migration 20261020100000), email from ./alerts.server.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const db = () => supabaseAdmin as any

/** How far the sender's clock may be from ours before a request is refused (replay guard). */
const MAX_SKEW_S = 5 * 60

/** The Compass Card admin portal, where each record is actioned. */
export const COMPASS_ADMIN_BASE = 'https://compasscard.online/Admin-portal/'

export type CompassEventType = 'user_signup' | 'vendor_signup' | 'vendor_status' | 'offer_submitted' | 'offer_status'
export const EVENT_TYPES: CompassEventType[] = ['user_signup', 'vendor_signup', 'vendor_status', 'offer_submitted', 'offer_status']

/** Which team each event goes to: sign-ups = Crew Care, partners = vendors and offers (Lucy). */
export const TEAM_FOR: Record<CompassEventType, 'signups' | 'partners'> = {
  user_signup: 'signups',
  vendor_signup: 'partners',
  vendor_status: 'partners',
  offer_submitted: 'partners',
  offer_status: 'partners',
}

// ── Signature ────────────────────────────────────────────────────────────────

const fromBase64 = (b64: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/** The PEM public key Compass Card's events are checked against, or null when not set up. */
export async function loadPublicKey(): Promise<string | null> {
  const { data } = await db().from('compass_card_integration').select('public_key').eq('id', 1).maybeSingle()
  return (data?.public_key as string | null) || null
}

/** Null when the timestamp is fresh and the signature matches the raw body; otherwise why not. */
export async function verifySignature(publicKeyPem: string, rawBody: string, timestamp: string | null, signature: string | null): Promise<string | null> {
  if (!timestamp || !signature) return 'Missing signature headers'
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return 'Bad timestamp'
  if (Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_S) return 'Timestamp too old or too far ahead'
  try {
    const der = fromBase64(publicKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''))
    const key = await crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64(signature.trim()), new TextEncoder().encode(`${timestamp}.${rawBody}`))
    return ok ? null : 'Bad signature'
  } catch {
    return 'Bad signature'
  }
}

// ── Shaping ──────────────────────────────────────────────────────────────────

const str = (v: unknown, max = 200): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : null
}
const id = (v: unknown): string | null => {
  const s = str(v, 20)
  return s && /^\d+$/.test(s) ? s : null
}
const list = (v: unknown, max = 10): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, 80)).filter((x): x is string => !!x).slice(0, max) : []
const status = (v: unknown): string | null => {
  const s = str(v, 20)?.toLowerCase() ?? null
  return s && ['pending', 'approved', 'rejected', 'inactive'].includes(s) ? s : null
}

export type ShapedEvent = {
  event_id: string
  event_type: CompassEventType
  team: 'signups' | 'partners'
  occurred_at: string
  title: string
  summary: string | null
  status: string | null
  person_name: string | null
  person_email: string | null
  admin_url: string
  data: Record<string, unknown>
}

const METHOD_LABEL: Record<string, string> = { email: 'email', google: 'Google', apple: 'Apple', firebase: 'Google / Apple' }

/** Turn what Compass Card sent into the row we keep. Returns an error string for a bad event. */
export function shapeEvent(body: any): ShapedEvent | string {
  const eventId = str(body?.id, 120)
  if (!eventId) return 'id is required'
  const type = body?.type as CompassEventType
  if (!EVENT_TYPES.includes(type)) return `type must be one of ${EVENT_TYPES.join(', ')}`
  const d = (body?.data && typeof body.data === 'object') ? body.data : {}
  const when = body?.occurred_at && !Number.isNaN(Date.parse(body.occurred_at)) ? new Date(body.occurred_at).toISOString() : new Date().toISOString()
  const base = { event_id: eventId, event_type: type, team: TEAM_FOR[type], occurred_at: when }
  const join = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(' · ') || null

  switch (type) {
    case 'user_signup': {
      const data = {
        user_id: id(d.user_id), name: str(d.name, 120), email: str(d.email, 200),
        country_code: str(d.country_code, 8), mobile: str(d.mobile, 30), method: str(d.method, 20),
      }
      const method = data.method ? METHOD_LABEL[data.method] ?? data.method : null
      return {
        ...base,
        title: `New app sign-up: ${data.name ?? data.email ?? 'a new user'}`,
        summary: join(data.email, data.mobile && `${data.country_code ?? ''} ${data.mobile}`.trim(), method && `signed up with ${method}`, 'awaiting approval'),
        status: 'pending', person_name: data.name, person_email: data.email,
        admin_url: COMPASS_ADMIN_BASE + 'admin/users/unapproved', data,
      }
    }
    case 'vendor_signup': {
      const data = {
        vendor_id: id(d.vendor_id), brand_name: str(d.brand_name, 160), contact_person: str(d.contact_person, 120),
        email: str(d.email, 200), phone: str(d.phone, 40), country: str(d.country, 80), categories: list(d.categories),
      }
      return {
        ...base,
        title: `New vendor request: ${data.brand_name ?? data.email ?? 'a new vendor'}`,
        summary: join(data.contact_person, data.email, data.country, data.categories.length > 0 && data.categories.join(', ')),
        status: 'pending', person_name: data.contact_person, person_email: data.email,
        admin_url: COMPASS_ADMIN_BASE + (data.vendor_id ? `admin/vendors/view/${data.vendor_id}` : 'admin/vendors/pending'), data,
      }
    }
    case 'vendor_status': {
      const data = {
        vendor_id: id(d.vendor_id), brand_name: str(d.brand_name, 160), email: str(d.email, 200),
        status: status(d.status), reason: str(d.reason, 500), decided_by: str(d.decided_by, 120),
      }
      return {
        ...base,
        title: `Vendor ${data.status ?? 'updated'}: ${data.brand_name ?? 'a vendor'}`,
        summary: join(data.decided_by && `by ${data.decided_by}`, data.reason),
        status: data.status, person_name: data.brand_name, person_email: data.email,
        admin_url: COMPASS_ADMIN_BASE + (data.vendor_id ? `admin/vendors/view/${data.vendor_id}` : 'admin/vendors'), data,
      }
    }
    case 'offer_submitted': {
      const data = {
        offer_id: id(d.offer_id), title: str(d.title, 200), vendor_id: id(d.vendor_id), vendor_name: str(d.vendor_name, 160),
        discount: str(d.discount, 20), start_date: str(d.start_date, 20), end_date: str(d.end_date, 20),
        resubmitted: d.resubmitted === true || d.resubmitted === 1 || d.resubmitted === '1',
      }
      return {
        ...base,
        title: `${data.resubmitted ? 'Offer re-submitted' : 'New offer to approve'}: ${data.title ?? 'an offer'}`,
        summary: join(data.vendor_name, data.discount && `${data.discount}% off`, data.start_date && data.end_date && `${data.start_date} to ${data.end_date}`, data.resubmitted && 'changed after approval, needs re-approval'),
        status: 'pending', person_name: data.vendor_name, person_email: null,
        admin_url: COMPASS_ADMIN_BASE + 'admin/offer-approval/pending', data,
      }
    }
    case 'offer_status': {
      const data = {
        offer_id: id(d.offer_id), title: str(d.title, 200), vendor_id: id(d.vendor_id), vendor_name: str(d.vendor_name, 160),
        status: status(d.status), reason: str(d.reason, 500), decided_by: str(d.decided_by, 120),
      }
      return {
        ...base,
        title: `Offer ${data.status ?? 'updated'}: ${data.title ?? 'an offer'}`,
        summary: join(data.vendor_name, data.decided_by && `by ${data.decided_by}`, data.reason),
        status: data.status, person_name: data.vendor_name, person_email: null,
        admin_url: COMPASS_ADMIN_BASE + 'admin/offer-approval', data,
      }
    }
  }
}

/** Store the event once. Returns 'created', or 'duplicate' when that id was already received. */
export async function storeEvent(e: ShapedEvent): Promise<{ result: 'created' | 'duplicate'; id?: string }> {
  const { data, error } = await db().from('compass_card_events')
    .upsert(e, { onConflict: 'event_id', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error(error.message)
  const row = (data ?? [])[0]
  return row ? { result: 'created', id: row.id } : { result: 'duplicate' }
}
