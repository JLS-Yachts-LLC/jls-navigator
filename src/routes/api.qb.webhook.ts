/**
 * POST /api/qb/webhook  — reliable QuickBooks (Intuit) webhook receiver.
 *
 * A thin, reliable ingress in front of the existing n8n "QB (All)" workflow. It:
 *   1. verifies the Intuit HMAC-SHA256 signature (when INTUIT_WEBHOOK_VERIFIER is set)
 *   2. de-duplicates Intuit retries (idempotency by body hash)
 *   3. logs every hit / retry / success / error to the Automations tracker
 *   4. retry-forwards the exact payload to n8n, returning 500 on total failure so
 *      Intuit re-delivers (the dedup makes re-delivery safe)
 *
 * The heavy QB logic (PDF generation, OneDrive, doc-number heal) stays in n8n.
 * Point Intuit's webhook at this URL; set the n8n target via QB_N8N_WEBHOOK_URL.
 */
import { createClient } from '@supabase/supabase-js'
import { logAutomationRun } from '@/lib/automations.server'
import { orchestrate } from '@/lib/qb/orchestrator.server'
import { qboConfigured } from '@/lib/qb/qbo.server'

const N8N_URL = () => process.env.QB_N8N_WEBHOOK_URL
  ?? 'https://n8n.jlsyachts.com/webhook/841c1c3c-9326-4adf-9565-11c93a7ca72e'

const AUTO = { key: 'qb-webhook', name: 'QuickBooks Webhook (receiver)', source: 'worker', trigger_type: 'webhook', category: 'Finance' } as const

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

const enc = new TextEncoder()
async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', enc.encode(s))
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('')
}
async function hmacBase64(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg))
  let bin = ''
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b)
  return btoa(bin)
}

export async function qbWebhookHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const raw = await request.text()

  // 1. Signature verification (Intuit signs the raw body with the webhook verifier).
  const verifier = (process.env.INTUIT_WEBHOOK_VERIFIER ?? '').trim()
  if (verifier) {
    const provided = (request.headers.get('intuit-signature') ?? '').trim()
    const expected = await hmacBase64(verifier, raw)
    if (!provided || provided !== expected) {
      await logAutomationRun({ ...AUTO, status: 'error', detail: 'Invalid Intuit signature — rejected (check INTUIT_WEBHOOK_VERIFIER matches the PRODUCTION verifier token in Intuit Developer → Webhooks)' })
      return new Response('invalid signature', { status: 401 })
    }
  }

  await logAutomationRun({ ...AUTO, status: 'hit', detail: verifier ? undefined : 'signature unverified (INTUIT_WEBHOOK_VERIFIER not set)' })

  const sb = admin()
  const id = await sha256Hex(raw)

  // 2. De-dup Intuit retries.
  const { data: existing } = await sb.from('qb_webhook_events').select('forwarded').eq('id', id).maybeSingle()
  if (existing?.forwarded) {
    return new Response('duplicate ignored', { status: 200 })
  }
  if (!existing) await sb.from('qb_webhook_events').insert({ id })

  // 3. The in-app toggle (Automations → "QuickBooks Webhook — native processing")
  //    decides WHO processes the event — never both, so nothing double-fires:
  //      ON  → the worker handles everything natively (parse → invoice fetch →
  //            doc-number heal → Pro-Forma classification → instant Finance sync).
  //            n8n is NOT called at all.
  //      OFF → pure retry-safe relay to the existing n8n workflow (today's setup).
  const { data: auto } = await sb.from('automations').select('enabled').eq('key', 'qb-webhook').maybeSingle()
  const nativeEnabled = !!auto?.enabled

  if (nativeEnabled) {
    if (!qboConfigured()) {
      await logAutomationRun({ ...AUTO, status: 'error', detail: 'native mode is ON but QBO credentials are not configured' })
      return new Response('qbo not configured', { status: 500 }) // Intuit re-delivers
    }
    try {
      const items = await orchestrate(raw)
      const summary = items.map(i =>
        `${i.entity}${i.invoiceType ? '/' + i.invoiceType : ''}${i.heal ? ' heal:' + i.heal.action : ''}${i.ingest ? ' ' + i.ingest : ''}${i.error ? ' ERR:' + i.error : ''}`,
      ).join('; ')
      const anyError = items.some(i => i.error)
      await sb.from('qb_webhook_events')
        .update({ forwarded: !anyError, attempts: 1, last_status: anyError ? 500 : 200, last_error: anyError ? summary : null, updated_at: new Date().toISOString() })
        .eq('id', id)
      await logAutomationRun({ ...AUTO, status: anyError ? 'error' : 'success', detail: `native — ${summary || 'no events'}` })
      // Per-event errors → 500 so Intuit re-delivers; successes are dedup-safe.
      return new Response(anyError ? 'partial failure' : 'ok', { status: anyError ? 500 : 200 })
    } catch (e: any) {
      await logAutomationRun({ ...AUTO, status: 'error', detail: `native processing failed: ${e?.message ?? e}` })
      return new Response('native processing failed', { status: 500 }) // Intuit re-delivers
    }
  }

  // 3b. Toggle OFF: retry-forward the exact payload to n8n.
  const contentType = request.headers.get('content-type') ?? 'application/json'
  let ok = false, attempts = 0, lastStatus: number | null = null, lastErr = ''
  for (let i = 0; i < 3 && !ok; i++) {
    attempts++
    if (i > 0) await logAutomationRun({ ...AUTO, status: 'retry', detail: `forward attempt ${i + 1}` })
    try {
      const r = await fetch(N8N_URL(), {
        method: 'POST',
        headers: { 'Content-Type': contentType, 'intuit-signature': request.headers.get('intuit-signature') ?? '' },
        body: raw,
      })
      lastStatus = r.status
      if (r.ok) ok = true
      else lastErr = `n8n responded ${r.status}`
    } catch (e: any) {
      lastErr = e?.message ?? String(e)
    }
    if (!ok && i < 2) await new Promise(res => setTimeout(res, 400 * (i + 1)))
  }

  await sb.from('qb_webhook_events')
    .update({ forwarded: ok, attempts, last_status: lastStatus, last_error: ok ? null : lastErr, updated_at: new Date().toISOString() })
    .eq('id', id)
  await logAutomationRun({ ...AUTO, status: ok ? 'success' : 'error', detail: ok ? undefined : lastErr })

  // On total failure, 500 → Intuit re-delivers later; dedup makes that safe.
  return new Response(ok ? 'ok' : 'forward failed', { status: ok ? 200 : 500 })
}
