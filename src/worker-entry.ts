import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { syncFromSharePoint, downloadPendingImages } from './lib/sharepoint-sync.server'

const handleRequest = createStartHandler(defaultStreamHandler)

async function handleSharePointWebhook(request: Request, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
  const url = new URL(request.url)

  // SharePoint sends GET with validationToken when registering a subscription.
  // Must echo it back as text/plain within 5 seconds.
  if (request.method === 'GET') {
    const token = url.searchParams.get('validationToken')
    if (token) {
      return new Response(decodeURIComponent(token), {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
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

  // Cloudflare cron trigger — runs on the schedule defined in wrangler.jsonc
  async scheduled(_event: unknown, _env: Record<string, unknown>, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<void> {
    ctx.waitUntil(
      syncFromSharePoint()
        .then(({ synced, errors }) => {
          console.log(`[sp-cron] synced=${synced} errors=${errors}`)
          // Phase 2: download images for yachts that don't have one yet (5 per run)
          return downloadPendingImages()
        })
        .then((imgs) => { if (imgs) console.log(`[sp-cron] images downloaded=${imgs}`) })
        .catch((e) => console.error('[sp-cron] error:', e))
    )
  },
}
