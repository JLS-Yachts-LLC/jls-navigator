/**
 * POST /api/lightspeed/{customer|product|credit|invoice}
 *
 * Native receivers for the Lightspeed (Vend) webhooks — replaces the n8n
 * lightspeed-* webhook endpoints. Vend POSTs application/x-www-form-urlencoded
 * with fields: domain_prefix, payload (JSON string), retailer_id, type.
 *
 * Optional hardening: set `webhook_key` in Settings → Integrations → Lightspeed
 * and register the Vend webhooks with ?key=<value>; mismatches are rejected.
 */
import { handleLightspeedWebhook, lsConfig, type LsKind } from '@/lib/lightspeed/sync.server'

const KINDS = new Set(['customer', 'product', 'sale', 'credit', 'invoice'])

export async function lightspeedWebhookHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const url = new URL(request.url)
  const kind = url.pathname.split('/').pop() ?? ''
  if (!KINDS.has(kind)) return new Response('Unknown webhook', { status: 404 })

  const cfg = await lsConfig()
  if (cfg.webhookKey && url.searchParams.get('key') !== cfg.webhookKey) {
    return new Response('Forbidden', { status: 403 })
  }

  const raw = await request.text()
  const body = new URLSearchParams(raw)

  const { status, result } = await handleLightspeedWebhook(kind as LsKind, body)
  return new Response(JSON.stringify({ ok: status < 400, result }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
