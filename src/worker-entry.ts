import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { syncFromSharePoint, downloadPendingImages, pushChangedRecords, discoverSharePoint, syncById, getSpSyncs } from './lib/sharepoint-sync.server'

// Self-invoke base URL for fan-out (each list syncs in its own invocation to
// stay under Cloudflare's per-invocation subrequest limit).
const SELF_BASE = 'https://jls-navigator.m-peeters-4a0.workers.dev'
import { runExpiryAlerts } from './lib/permit-expiry-cron.server'
import { syncFleetPositions } from './lib/mygps.server'
import { syncVesselPositions } from './lib/vesselfinder.server'
import { runDailyComplianceChecks } from './lib/visa/complianceMonitor.server'

const handleRequest = createStartHandler(defaultStreamHandler)

async function handleSharePointWebhook(request: Request, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
  const url = new URL(request.url)

  // Manual run: `?run=1` syncs all enabled lists, each in its OWN invocation
  // (fan-out via self-fetch) so no single invocation exceeds Cloudflare's
  // subrequest limit. `?run=1&only=<syncId>` runs just that one list.
  // Per-sync error samples persist to sharepoint_sync_configs.last_sync_error_sample.
  if (url.searchParams.get('run') === '1') {
    const only = url.searchParams.get('only')
    try {
      if (only) {
        const r = await syncById(only)
        return new Response(JSON.stringify({ ok: true, only, ...r }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      const syncs = (await getSpSyncs()).filter((s) => s.enabled)
      const results: Array<Record<string, unknown>> = []
      for (const s of syncs) {
        try {
          const res = await fetch(`${url.origin}/sp-hook?run=1&only=${encodeURIComponent(s.id)}`)
          results.push({ name: s.name, ...(await res.json() as Record<string, unknown>) })
        } catch (e) {
          results.push({ name: s.name, ok: false, error: e instanceof Error ? e.message : String(e) })
        }
      }
      ctx.waitUntil(downloadPendingImages().catch(() => 0))
      return new Response(JSON.stringify({ ok: true, results }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Discovery: `?discover=1` returns all user lists + their columns (no row data,
  // no secrets) so syncs can be created with correct field mappings.
  if (url.searchParams.get('discover') === '1') {
    try {
      const d = await discoverSharePoint()
      return new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // SharePoint sends GET with validationToken when registering a subscription.
  // Must echo the raw token back as text/plain within 5 seconds.
  // NOTE: url.searchParams.get() already URL-decodes the value — do NOT
  // wrap in decodeURIComponent() again or tokens containing % will throw URIError.
  if (request.method === 'GET') {
    const token = url.searchParams.get('validationToken')
    if (token) {
      return new Response(token, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }
    return new Response('ok', { status: 200 })
  }

  // POST: SharePoint change notification.
  // Return 202 immediately — SP will retry if we don't respond within 5s.
  // Use waitUntil so the Worker stays alive while the sync runs.
  if (request.method === 'POST') {
    ctx.waitUntil(
      syncFromSharePoint()
        .then(() => downloadPendingImages())
        .catch((e) => console.error('[sp-webhook] sync error:', e))
    )
    return new Response('', { status: 202 })
  }

  return new Response('Method not allowed', { status: 405 })
}

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/sp-hook' || url.pathname === '/api/sharepoint-webhook' || url.pathname === '/api/sharepoint-webhook/') {
      return handleSharePointWebhook(request, ctx)
    }

    return handleRequest(request, env, ctx)
  },

  // Cron triggers: "0 * * * *" (hourly) → SharePoint inbound sync of all lists;
  // "*/15 * * * *" (every 15 min) → live vehicle/vessel tracking + daily alert checks.
  async scheduled(_event: unknown, _env: Record<string, unknown>, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<void> {
    const utcHour = new Date().getUTCHours();
    const cron = (_event as { cron?: string } | undefined)?.cron;
    const isHourly = cron === '0 * * * *' || (cron == null && new Date().getUTCMinutes() < 15);
    const isQuarterly = cron === '*/15 * * * *' || cron == null;

    // ── Hourly: push in-app edits OUT, then pull SharePoint changes IN ──
    // Pull is fanned out one-invocation-per-list via /sp-hook?run=1 (self-fetch)
    // so no single invocation exceeds the Cloudflare subrequest limit.
    if (isHourly) {
      const base = (typeof (_env as Record<string, unknown>).PUBLIC_APP_URL === 'string'
        && (_env as Record<string, string>).PUBLIC_APP_URL) || SELF_BASE
      ctx.waitUntil(
        pushChangedRecords()
          .then(({ pushed }) => console.log(`[sp-pushback] pushed=${pushed}`))
          .catch((e) => console.error('[sp-pushback] error:', e))
          .then(() => fetch(`${base}/sp-hook?run=1`))
          .then((r) => r.text())
          .then((t) => console.log(`[sp-cron] ${t.slice(0, 300)}`))
          .catch((e) => console.error('[sp-cron] error:', e))
      )
    }

    if (!isQuarterly) return;

    // Sync live myGPS vehicle positions onto crew_vehicles every run (~15 min)
    ctx.waitUntil(
      syncFleetPositions()
        .then(({ fetched, updated }) => console.log(`[mygps-cron] fetched=${fetched} updated=${updated}`))
        .catch((e) => console.error('[mygps-cron] error:', e))
    )

    // Sync live VesselFinder AIS positions onto yachts (no-op until userkey set)
    ctx.waitUntil(
      syncVesselPositions()
        .then(({ matched, updated }) => console.log(`[vesselfinder-cron] matched=${matched} updated=${updated}`))
        .catch((e) => console.error('[vesselfinder-cron] error:', e))
    )

    // Run visa compliance monitor once daily at 07:00 UTC
    if (utcHour === 7) {
      ctx.waitUntil(
        runDailyComplianceChecks()
          .then(({ passports, visas, staleDocs }) =>
            console.log(`[visa-compliance] passports=${passports} visas=${visas} staleDocs=${staleDocs}`))
          .catch((e) => console.error('[visa-compliance] error:', e))
      )
    }

    // Send expiry alerts once daily at 08:00 UTC
    if (utcHour === 8) {
      ctx.waitUntil(
        runExpiryAlerts()
          .then(({ sent, skipped }) => console.log(`[expiry-cron] sent=${sent} skipped=${skipped}`))
          .catch((e) => console.error('[expiry-cron] error:', e))
      )
    }
  },
}
