import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { syncFromSharePoint, downloadPendingImages } from './lib/sharepoint-sync.server'
import { runExpiryAlerts } from './lib/permit-expiry-cron.server'
import { syncFleetPositions } from './lib/mygps.server'
import { syncVesselPositions } from './lib/vesselfinder.server'
import { runDailyComplianceChecks } from './lib/visa/complianceMonitor.server'

const handleRequest = createStartHandler(defaultStreamHandler)

async function handleSharePointWebhook(request: Request, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
  const url = new URL(request.url)

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

  // Cloudflare cron trigger — runs every 15 min for SharePoint; expiry alerts only at 08:xx UTC
  async scheduled(_event: unknown, _env: Record<string, unknown>, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<void> {
    const utcHour = new Date().getUTCHours();

    ctx.waitUntil(
      syncFromSharePoint()
        .then(({ synced, errors }) => {
          console.log(`[sp-cron] synced=${synced} errors=${errors}`)
          return downloadPendingImages()
        })
        .then((imgs) => { if (imgs) console.log(`[sp-cron] images downloaded=${imgs}`) })
        .catch((e) => console.error('[sp-cron] error:', e))
    )

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
