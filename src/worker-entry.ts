import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { syncFromSharePoint, downloadPendingImages, pushChangedRecords, discoverSharePoint, syncById, getSpSyncs, syncStalestList, setupSignonList, resetDeltaTokens } from './lib/sharepoint-sync.server'
import { syncAisPositions } from './lib/aisstream.server'
import { runExpiryAlerts } from './lib/permit-expiry-cron.server'
import { syncFleetPositions } from './lib/mygps.server'
import { syncVesselPositions } from './lib/vesselfinder.server'
import { runDailyComplianceChecks } from './lib/visa/complianceMonitor.server'
import { leoBriefingHandler } from './routes/api.leo.briefing'
import { leoChatHandler } from './routes/api.leo.chat'
import { visaComplianceHandler } from './routes/api.visa.compliance'
import { visaMonitorHandler } from './routes/api.visa.monitor'
import { visaExportHandler } from './routes/api.visa.export'
import { visaExcelPushHandler } from './routes/api.visa.excel-push'
import { visaPassportOcrHandler } from './routes/api.visa.passport-ocr'
import { itTicketsNotifyHandler } from './routes/api.it-tickets.notify'
import { internalServicesRenewalCheckHandler } from './routes/api.internal-services.renewal-check'
import { fxRateHandler } from './routes/api.fx-rate'
import { shipsyncPwaHandler } from './lib/shipsync/pwa-assets'
import { shipsyncApiHandler } from './routes/api.shipsync'
import { feedbackNotifyHandler } from './routes/api.feedback.notify'
import { vesselHandler } from './routes/api.vessels'
import { phoneHandler } from './routes/api.phone'
import { configFeesHandler } from './routes/api.config.fees'
import { visaSupportingDocsHandler } from './routes/api.visa.supporting-docs'
import { crewPassportsHandler } from './routes/api.crew.passports'
import { visaPassportSelectHandler } from './routes/api.visa.passport-select'
import { crewSearchHandler } from './routes/api.crew.search'
import { crewPersonalInfoHandler } from './routes/api.crew.personal-info'
import { visaApplicationActionsHandler } from './routes/api.visa.applicationActions'
import { visaReportsHandler } from './routes/api.visa.reports'
import { adminUsersHandler } from './routes/api.admin.users'
import { adminUserByIdHandler } from './routes/api.admin.users.$id'
import { adminPermissionsHandler } from './routes/api.admin.permissions'
import { adminAuditHandler } from './routes/api.admin.audit'
import { adminAuditExportHandler } from './routes/api.admin.audit.export'
import { adminStatsHandler } from './routes/api.admin.stats'
import { automationEventHandler } from './routes/api.automations.event'
import { qbWebhookHandler } from './routes/api.qb.webhook'
import { movementsNotifyHandler } from './routes/api.movements.notify'
import { movementReportsHandler, runWeeklyImmigrationReports } from './routes/api.movements.reports'
import { visaReportGenerateHandler } from './routes/api.visa.report-generate'
import { visaReportSendHandler } from './routes/api.visa.report-send'
import { visaVesselPrefsHandler } from './routes/api.visa.vessel-prefs'
import { runWeeklyVisaReports } from './lib/visa-reporting/runWeeklyVisaReports.server'
import { runVisaExpiryFlagJob } from './lib/visa/visaExpiryFlags.server'

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
          const r = await syncById(s.id)
          results.push({ name: s.name, ...r })
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

  // One-time setup: `?setup=signon-list` creates the "Crew Sign On Off" SharePoint
  // list and registers its outbound sync config. Safe to call repeatedly.
  if (url.searchParams.get('setup') === 'signon-list') {
    try {
      const r = await setupSignonList()
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 500, headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Manual image backfill: `?images=N` synchronously downloads up to N pending
  // vessel images from SharePoint (default 10, max 15) and returns the count.
  // Unlike the cron's waitUntil download, this runs inside the request so it
  // reliably completes — loop it to backfill the whole fleet a batch at a time.
  if (url.searchParams.get('images')) {
    const n = Math.min(Math.max(parseInt(url.searchParams.get('images') || '10', 10) || 10, 1), 15)
    try {
      const { downloaded, results } = await downloadPendingImages(n)
      // Surface per-vessel failure reasons so image-sync problems are diagnosable.
      const failures = results.filter((r) => !r.ok).map((r) => r.reason)
      return new Response(JSON.stringify({ ok: true, requested: n, attempted: results.length, downloaded, failures }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Manual AIS run: `?ais=1` collects live vessel positions from AISStream and
  // writes them to the yachts table, returning the JSON result.
  if (url.searchParams.get('ais') === '1') {
    try {
      const r = await syncAisPositions(15000)
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Discovery: `?discover=1` returns all user lists + their columns (no row data,
  // no secrets) so syncs can be created with correct field mappings.
  // Read-only diagnostic: `?peek=<listName>&site=<path>` returns raw item fields.
  if (url.searchParams.get('peek')) {
    try {
      const { peekSpList } = await import('./lib/sharepoint-sync.server')
      const r = await peekSpList(url.searchParams.get('peek') as string, url.searchParams.get('site') || undefined, 30)
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  if (url.searchParams.get('discover') === '1') {
    try {
      const d = await discoverSharePoint(url.searchParams.get('site') || undefined)
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

    if (url.pathname === '/api/leo/briefing' && request.method === 'POST') {
      return leoBriefingHandler(request)
    }

    if (url.pathname === '/api/leo/chat' && request.method === 'POST') {
      return leoChatHandler(request)
    }

    if (url.pathname === '/api/visa/compliance' && request.method === 'POST') {
      return visaComplianceHandler(request)
    }

    if (url.pathname === '/api/visa/monitor' && request.method === 'POST') {
      return visaMonitorHandler(request)
    }

    if ((url.pathname === '/api/visa/export' && request.method === 'GET') ||
        (url.pathname === '/api/visa/export/email' && request.method === 'POST')) {
      return visaExportHandler(request)
    }

    if (url.pathname === '/api/visa/excel-push' && (request.method === 'GET' || request.method === 'POST')) {
      return visaExcelPushHandler(request)
    }

    if (url.pathname === '/api/visa/passport-ocr' && request.method === 'POST') {
      return visaPassportOcrHandler(request)
    }

    if (url.pathname === '/api/crew/verification-letter' && request.method === 'POST') {
      const { crewVerificationHandler } = await import('./lib/crew-verification.server')
      return crewVerificationHandler(request)
    }

    if (url.pathname === '/api/it-tickets/notify' && request.method === 'POST') {
      return itTicketsNotifyHandler(request)
    }

    if (url.pathname === '/api/internal-services/renewal-check' && request.method === 'POST') {
      return internalServicesRenewalCheckHandler(request)
    }

    if (url.pathname === '/api/fx-rate' && request.method === 'GET') {
      return fxRateHandler(request)
    }

    // ShipSync driver PWA assets (service worker, manifest, icon).
    {
      const pwa = shipsyncPwaHandler(request)
      if (pwa) return pwa
    }

    if (url.pathname.startsWith('/api/shipsync/') && request.method === 'POST') {
      return shipsyncApiHandler(request)
    }

    if (url.pathname === '/api/feedback/notify' && request.method === 'POST') {
      return feedbackNotifyHandler(request)
    }

    if (url.pathname.startsWith('/api/vessels/')) {
      return vesselHandler(request)
    }

    if (url.pathname.startsWith('/api/phone/')) {
      return phoneHandler(request)
    }

    if (url.pathname === '/api/config/fees' && request.method === 'GET') {
      return configFeesHandler(request)
    }

    if (url.pathname === '/api/visa/supporting-docs' && request.method === 'POST') {
      return visaSupportingDocsHandler(request)
    }

    if (url.pathname === '/api/crew/search' && request.method === 'GET') {
      return crewSearchHandler(request)
    }

    if (url.pathname.match(/^\/api\/crew\/[^/]+\/personal-info$/) &&
        (request.method === 'GET' || request.method === 'PATCH')) {
      return crewPersonalInfoHandler(request)
    }

    if (url.pathname.match(/^\/api\/crew\/[^/]+\/passports\/[^/]+\/ocr$/) &&
        request.method === 'GET') {
      return crewPersonalInfoHandler(request)
    }

    if (url.pathname.match(/^\/api\/crew\/[^/]+\/passports\/?([^/]*)$/)) {
      return crewPassportsHandler(request)
    }

    if (url.pathname.match(/^\/api\/visa\/[^/]+\/passport$/) && request.method === 'PATCH') {
      return visaPassportSelectHandler(request)
    }

    // Visa back-office actions: status / amendment / renewal
    if (url.pathname.match(/^\/api\/visa\/applications\/[^/]+\/(status|amendment|renewal)$/) &&
        (request.method === 'PATCH' || request.method === 'POST')) {
      return visaApplicationActionsHandler(request)
    }

    // Visa reports: pipeline + expiry (with ?format=csv export)
    if ((url.pathname === '/api/visa/reports/pipeline' || url.pathname === '/api/visa/reports/expiry') &&
        request.method === 'GET') {
      return visaReportsHandler(request)
    }

    // Vessel visa reporting: generate / send / comms prefs
    if (url.pathname === '/api/visa/report-generate' && request.method === 'POST') {
      return visaReportGenerateHandler(request)
    }
    if (url.pathname === '/api/visa/report-send' && request.method === 'POST') {
      return visaReportSendHandler(request)
    }
    if (url.pathname === '/api/visa/vessel-prefs' && (request.method === 'GET' || request.method === 'POST')) {
      return visaVesselPrefsHandler(request)
    }

    // ── Admin Panel API (TanStack API routes aren't dispatched by the CF handler,
    //    so each is wired here). Order: more-specific paths first. ──
    if (url.pathname === '/api/admin/audit/export' && request.method === 'GET') {
      return adminAuditExportHandler(request)
    }
    if (url.pathname === '/api/admin/audit' && request.method === 'GET') {
      return adminAuditHandler(request)
    }
    if (url.pathname === '/api/admin/stats' && request.method === 'GET') {
      return adminStatsHandler(request)
    }
    if (url.pathname === '/api/admin/permissions') {
      return adminPermissionsHandler(request)
    }
    if (url.pathname === '/api/admin/users') {
      return adminUsersHandler(request)
    }
    if (url.pathname.startsWith('/api/admin/users/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/admin/users/'.length))
      if (id) return adminUserByIdHandler(request, id)
    }
    if (url.pathname === '/api/movements/notify' && request.method === 'POST') {
      return movementsNotifyHandler(request)
    }
    if (url.pathname === '/api/automations/event' && request.method === 'POST') {
      return automationEventHandler(request)
    }
    if (url.pathname === '/api/qb/webhook' && request.method === 'POST') {
      return qbWebhookHandler(request)
    }
    if (url.pathname.startsWith('/api/reports/') && request.method === 'GET') {
      return movementReportsHandler(request)
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
    const isAis = cron === '5,20,35,50 * * * *';

    // ── AIS tick: collect live vessel positions in its own invocation (own
    //    subrequest budget) and write them to the yachts table. ──
    if (isAis) {
      ctx.waitUntil(
        syncAisPositions()
          .then((r) => console.log(`[ais-cron] tracked=${r.tracked} received=${r.received} updated=${r.updated}${r.note ? ' note=' + r.note : ''}`))
          .catch((e) => console.error('[ais-cron] error:', e))
      );
      return;
    }

    // ── Hourly: push in-app edits OUT to SharePoint ──
    if (isHourly) {
      ctx.waitUntil(
        pushChangedRecords()
          .then(({ pushed }) => console.log(`[sp-pushback] pushed=${pushed}`))
          .catch((e) => console.error('[sp-pushback] error:', e))
      )
    }

    if (!isQuarterly) return;

    // ── Daily full refresh (02:00 UTC tick): clear all delta tokens so every
    //    enabled list does a complete re-pull today. The rotating syncStalestList()
    //    ticks below then carry it out one list at a time (subrequest-safe), and
    //    downloadPendingImages() refreshes any missing vessel images. This guards
    //    against delta sync never backfilling mapping/data changes. ──
    if (utcHour === 2 && new Date().getUTCMinutes() < 15) {
      ctx.waitUntil(
        resetDeltaTokens()
          .then((n) => console.log(`[sp-daily-refresh] full re-pull queued for ${n} list(s)`))
          .catch((e) => console.error('[sp-daily-refresh] error:', e))
      )
      // Daily 90-day renewal-quotation check for internal services (idempotent).
      ctx.waitUntil(
        internalServicesRenewalCheckHandler(new Request('http://internal/renewal-check', { method: 'POST' }))
          .then(async (r) => console.log('[renewal-cron]', JSON.stringify(await r.json().catch(() => ({})))))
          .catch((e) => console.error('[renewal-cron] error:', e))
      )
      // ShipSync outbound push is intentionally NOT on the cron: SharePoint is the
      // source of truth for ShipSync (Packages + Drivers are pulled IN via the
      // rotating syncStalestList() like every other list). The "Push now" button
      // on the Integrations page remains for a manual push when needed.
    }

    // ── Every 15 min: pull SharePoint changes IN, ONE list per tick ──
    // All lists at once exceeds Cloudflare's per-invocation subrequest limit, and
    // a Worker can't self-fetch to fan out — so each tick syncs the single
    // least-recently-synced list, rotating through the whole set over time.
    ctx.waitUntil(
      syncStalestList()
        .then((r) => { if (r) console.log(`[sp-cron] ${r.name}: synced=${r.synced} errors=${r.errors}`); return downloadPendingImages() })
        .then((img) => { if (img.downloaded || img.results.length) console.log(`[sp-cron] images downloaded=${img.downloaded}/${img.results.length}`) })
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

    // Weekly immigration digest — Monday 07:00 GST (03:00 UTC). Emails ops/visa
    // a summary of this week's planned sign-ons / sign-offs + report links.
    if (utcHour === 3 && new Date().getUTCDay() === 1 && new Date().getUTCMinutes() < 15) {
      ctx.waitUntil(
        runWeeklyImmigrationReports()
          .then((r) => console.log(`[weekly-immigration] on=${r.signOn} off=${r.signOff} sent=${r.sent}`))
          .catch((e) => console.error('[weekly-immigration] error:', e))
      )
    }

    // Weekly visa report — Friday 08:00 GST (04:00 UTC). Generates + emails a
    // visa-status report to every yacht opted in (send_visa_reports = true).
    if (utcHour === 4 && new Date().getUTCDay() === 5 && new Date().getUTCMinutes() < 15) {
      ctx.waitUntil(
        runWeeklyVisaReports()
          .then((r) => console.log(`[weekly-visa] vessels=${r.vessels} generated=${r.generated} sent=${r.sent}`))
          .catch((e) => console.error('[weekly-visa] error:', e))
      )
    }

    // Run UAE visa expiry-flag engine once daily at 03:00 UTC (07:00 UAE time).
    // Fires 30-calendar-day, 10-working-day and 5-working-day flags + notifications.
    if (utcHour === 3) {
      ctx.waitUntil(
        runVisaExpiryFlagJob()
          .then(({ processed, flagged }) => console.log(`[visa-expiry-flags] processed=${processed} flagged=${flagged}`))
          .catch((e) => console.error('[visa-expiry-flags] error:', e))
      )
    }

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
