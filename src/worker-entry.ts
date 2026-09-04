import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { downloadPendingImages, downloadPendingImagesRotating, pushChangedRecords, discoverSharePoint, syncById, getSpSyncs, syncStalestList, syncPrioritisedLists, syncWebhookList, setupSignonList, resetDeltaTokens } from './lib/sharepoint-sync.server'
import { syncAisPositions } from './lib/aisstream.server'
import { runExpiryAlerts } from './lib/permit-expiry-cron.server'
import { syncFleetPositions } from './lib/mygps.server'
import { syncVesselPositions } from './lib/vesselfinder.server'
import { syncMyShipTracking } from './lib/myshiptracking.server'
import { runDailyComplianceChecks } from './lib/visa/complianceMonitor.server'
import { leoBriefingHandler } from './routes/api.leo.briefing'
import { leoChatHandler } from './routes/api.leo.chat'
import { leoWelcomeHandler } from './routes/api.leo.welcome'
import { visaComplianceHandler } from './routes/api.visa.compliance'
import { visaMonitorHandler } from './routes/api.visa.monitor'
import { visaExportHandler } from './routes/api.visa.export'
import { visaExcelPushHandler } from './routes/api.visa.excel-push'
import { visaExcelSyncHandler } from './routes/api.visa.excel-sync'
import { visaUploadArrivalDocHandler } from './routes/api.visa.upload-arrival-doc'
import { visaSendToVesselHandler } from './routes/api.visa.send-to-vessel'
import { mmsiSuggestHandler } from './routes/api.vessels.mmsi-suggest'
import { seedTemplatesFolderHandler } from './routes/api.admin.seed-templates-folder'
import { visaPassportOcrHandler } from './routes/api.visa.passport-ocr'
import { itTicketsNotifyHandler } from './routes/api.it-tickets.notify'
import { internalServicesRenewalCheckHandler } from './routes/api.internal-services.renewal-check'
import { fxRateHandler } from './routes/api.fx-rate'
import { shipsyncPwaHandler } from './lib/shipsync/pwa-assets'
import { shipsyncApiHandler } from './routes/api.shipsync'
import { anchorFormsHandler } from './routes/api.anchor-forms'
import { qbInvoiceHandler } from './routes/api.qb.invoice'
import { qbConnectHandler, qbCallbackHandler } from './routes/api.qb.connect'
import { crewPlacementHandler } from './routes/api.crew-placement'
import { qbCustomersHandler } from './routes/api.qb.customers'
import { qbSyncHandler, qbDocPdfHandler } from './routes/api.qb.sync'
import { syncAllRealms } from './lib/qb/sync.server'
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
import { adminPortalUsersHandler } from './routes/api.admin.portal-users'
import { adminUserByIdHandler } from './routes/api.admin.users.$id'
import { adminPermissionsHandler } from './routes/api.admin.permissions'
import { adminAuditHandler } from './routes/api.admin.audit'
import { adminAuditExportHandler } from './routes/api.admin.audit.export'
import { adminStatsHandler } from './routes/api.admin.stats'
import { automationEventHandler } from './routes/api.automations.event'
import { qbWebhookHandler, retryPendingQbWebhookEvents } from './routes/api.qb.webhook'
import { movementsNotifyHandler } from './routes/api.movements.notify'
import { movementReportsHandler, runWeeklyImmigrationReports } from './routes/api.movements.reports'
import { visaReportGenerateHandler } from './routes/api.visa.report-generate'
import { visaReportSendHandler } from './routes/api.visa.report-send'
import { visaVesselPrefsHandler } from './routes/api.visa.vessel-prefs'
import { nativeLanguageResolveDefaultHandler } from './routes/api.native-language.resolve-default'
import { nativeLanguageSaveHandler } from './routes/api.native-language.save'
import { runWeeklyVisaReports } from './lib/visa-reporting/runWeeklyVisaReports.server'
import { runWeeklyFleetFinance } from './lib/fleet-finance-report.server'
import { trackRun } from './lib/automations.server'
import { runVisaExpiryFlagJob } from './lib/visa/visaExpiryFlags.server'
import { runTwoWaySyncTick } from './lib/visa/excel-sync.server'

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
      ctx.waitUntil(downloadPendingImagesRotating(10).catch(() => 0))
      return new Response(JSON.stringify({ ok: true, results }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Email test: `?test-email=<addr>` sends a test from BOTH senders (polaris@ and
  // anchor@) to verify Graph Mail.Send + the per-sender access policy. Recipient is
  // restricted to jlsyachts.com / newhorizon-it.co.uk so this can't be an open relay.
  const testEmail = url.searchParams.get('test-email')
  if (testEmail) {
    if (!/@(jlsyachts\.com|newhorizon-it\.co\.uk)$/i.test(testEmail)) {
      return new Response(JSON.stringify({ ok: false, error: 'Recipient must be a jlsyachts.com or newhorizon-it.co.uk address' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }
    const { sendGraphEmail } = await import('./lib/graph-mail.server')
    const results: Array<{ from: string; ok: boolean; error?: string }> = []
    for (const from of ['polaris@jlsyachts.com', 'anchor@jlsyachts.com']) {
      try {
        await sendGraphEmail({
          from,
          to: [testEmail],
          subject: `Polaris email test — from ${from}`,
          html: `<p>This is a test message from the Polaris platform, sent as <strong>${from}</strong>.</p><p>If you can read this, Microsoft Graph sending is working for this mailbox.</p>`,
          text: `Test message from Polaris, sent as ${from}. Graph sending works for this mailbox.`,
        })
        results.push({ from, ok: true })
      } catch (e) {
        results.push({ from, ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return new Response(JSON.stringify({ ok: results.every((r) => r.ok), to: testEmail, results }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Manual ShipSync import: `?run=monday-import` pulls the Monday.com Import
  // board into shipsync_packages now (no-op error if Monday isn't configured).
  if (url.searchParams.get('run') === 'monday-import') {
    try {
      const { importMondayShipments } = await import('./lib/shipsync/monday.server')
      const r = await importMondayShipments({})
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Manual ShipSync Import board sync: `?run=shipsync-import-board` pulls the
  // Monday.com Import/Transit board into shipsync_packages (local_import =
  // 'Import') now, same as the hourly cron and the "Sync from Monday" button
  // on the Import tab (no-op error if not configured).
  if (url.searchParams.get('run') === 'shipsync-import-board') {
    try {
      const { importMondayImportBoard } = await import('./lib/shipsync/monday-import-board.server')
      const r = await importMondayImportBoard()
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Manual ShipSync Export board sync: `?run=shipsync-export-board` pulls the
  // Monday.com Export board into shipsync_packages (local_import = 'Export')
  // now, same as the "Sync from Monday" button on the Export tab (no-op
  // error if not configured).
  if (url.searchParams.get('run') === 'shipsync-export-board') {
    try {
      const { importMondayExportBoard } = await import('./lib/shipsync/monday-export-board.server')
      const r = await importMondayExportBoard()
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Manual ShipSync EDAS board sync: `?run=shipsync-edas-board` pulls the
  // Monday.com EDAS 2026 board into shipsync_packages (local_import =
  // 'EDAS') now, same as the "Sync from Monday" button on the EDAS tab
  // (no-op error if not configured). Same manual-only pattern as Export —
  // not on the hourly cron.
  if (url.searchParams.get('run') === 'shipsync-edas-board') {
    try {
      const { importMondayEdasBoard } = await import('./lib/shipsync/monday-edas-board.server')
      const r = await importMondayEdasBoard()
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Manual ShipSync proximity check: `?run=shipsync-proximity-check` runs the
  // "arriving in ~5 minutes" pass now, same as the 5-min cron tick — useful
  // for confirming the Google Maps key actually works server-side (it's
  // documented as referrer-restricted for browser use, which a
  // server-to-server call carries no Referer header for).
  // Manual ShipSync photo backup: `?run=shipsync-photo-backup` copies photos
  // captured in Polaris into the SharePoint image library now, rather than
  // waiting for the hourly pass. `&limit=` widens the batch for a first catch-up.
  if (url.searchParams.get('run') === 'shipsync-photo-backup') {
    try {
      const { backupShipSyncPhotos } = await import('./lib/shipsync/photo-backup.server')
      const limit = Number(url.searchParams.get('limit') ?? '') || undefined
      const r = await backupShipSyncPhotos({ limit })
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  if (url.searchParams.get('run') === 'shipsync-proximity-check') {
    try {
      const { checkDeliveryProximity } = await import('./lib/shipsync/proximity-alert.server')
      const r = await checkDeliveryProximity()
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // One-time repair: `?run=monday-dedup-all` collapses every duplicate row
  // (any local_import value) sharing a monday_item_id down to the single most
  // recently updated one. Needed to clean up duplicates that accumulated
  // before the sync lock existed.
  if (url.searchParams.get('run') === 'monday-dedup-all') {
    try {
      const { dedupeAllMondayRows } = await import('./lib/shipsync/monday.server')
      const r = await dedupeAllMondayRows()
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Read-only diagnostic: `?run=monday-debug` returns the board's real column
  // titles + several sample items' raw values. Writes nothing.
  if (url.searchParams.get('run') === 'monday-debug') {
    try {
      const { debugMondayBoard } = await import('./lib/shipsync/monday.server')
      const r = await debugMondayBoard()
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Read-only diagnostic: `?run=monday-board-probe&board=<id>` returns the
  // schema (title, columns w/ settings, groups, sample items) of any Monday
  // board by id — used to scope a new board integration off real data before
  // building it. Writes nothing.
  if (url.searchParams.get('run') === 'monday-board-probe') {
    try {
      const boardId = url.searchParams.get('board')
      if (!boardId) throw new Error('Missing ?board=<id>')
      const { probeMondayBoard } = await import('./lib/shipsync/monday-probe.server')
      const r = await probeMondayBoard(boardId)
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Read-only diagnostic: `?run=training-boards-probe` returns the schema
  // (title, columns, groups, sample items) of the 4 Monday.com Training
  // Institute boards, ahead of building the Training module UI to mirror
  // them. Writes nothing.
  if (url.searchParams.get('run') === 'training-boards-probe') {
    try {
      const { probeTrainingBoards } = await import('./lib/training/monday.server')
      const r = await probeTrainingBoards()
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Manual Training Institute sync: `?run=training-sync-all` pulls all 4
  // boards (Instructors/Students/Courses/Classes) in one call — same manual
  // trigger the in-UI "Sync from Monday" buttons use, for ops/cron use
  // outside the browser.
  if (url.searchParams.get('run') === 'training-sync-all') {
    try {
      const { syncAllTrainingBoards } = await import('./lib/training/monday.server')
      const r = await syncAllTrainingBoards()
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Read-only diagnostic: `?run=monday-debug-file` checks whether Monday's
  // file links need the API token to actually download. Writes nothing.
  if (url.searchParams.get('run') === 'monday-debug-file') {
    try {
      const { debugMondayFileAccess } = await import('./lib/shipsync/monday.server')
      const r = await debugMondayFileAccess()
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Read-only diagnostic: `?run=package-debug&barcode=<tracking number>`
  // returns EVERY shipsync_packages row with this exact barcode, regardless
  // of monday_item_id — so a duplicate not created by the Monday sync isn't
  // missed. Writes nothing.
  if (url.searchParams.get('run') === 'package-debug') {
    try {
      const { supabaseAdmin } = await import('./integrations/supabase/client.server')
      const barcode = url.searchParams.get('barcode') ?? ''
      const { data, error } = await (supabaseAdmin as any)
        .from('shipsync_packages')
        .select('id, local_import, barcode, boat_name, receiver_full_name, delivery_note_no, created_at, updated_at, extra')
        .eq('barcode', barcode)
        .order('created_at', { ascending: true })
      return new Response(JSON.stringify({ ok: true, count: data?.length ?? 0, rows: data ?? [], error: error?.message ?? null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Read-only diagnostic: `?run=sp-dupe-scan` groups every shipsync_packages
  // row with a barcode by (barcode), counts groups with more than one row,
  // and reports whether each group's rows share an identical imported_at
  // (a strong sign of a batch-import bug) vs. genuinely different creation
  // times (more likely real, separate records). Writes nothing.
  if (url.searchParams.get('run') === 'sp-dupe-scan') {
    try {
      const { supabaseAdmin } = await import('./integrations/supabase/client.server')
      const sb = supabaseAdmin as any
      const rows: { barcode: string; created_at: string; extra: any }[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data: page } = await sb
          .from('shipsync_packages')
          .select('barcode, created_at, extra')
          .not('barcode', 'is', null)
          .range(offset, offset + 999)
        if (!page || page.length === 0) break
        rows.push(...page)
        if (page.length < 1000) break
      }

      const groups = new Map<string, typeof rows>()
      for (const r of rows) {
        const list = groups.get(r.barcode) ?? []
        list.push(r)
        groups.set(r.barcode, list)
      }

      let dupeGroups = 0
      let identicalImportedAtGroups = 0
      const samples: any[] = []
      for (const [barcode, group] of groups) {
        if (group.length <= 1) continue
        dupeGroups++
        const importedAts = group.map((r) => r.extra?.imported_at).filter(Boolean)
        const allSame = importedAts.length === group.length && importedAts.every((t) => t === importedAts[0])
        if (allSame) identicalImportedAtGroups++
        if (samples.length < 5) samples.push({ barcode, size: group.length, allSameImportedAt: allSame })
      }

      return new Response(JSON.stringify({
        ok: true, totalRows: rows.length, totalBarcodeGroups: groups.size,
        dupeGroups, identicalImportedAtGroups, samples,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Read-only diagnostic: `?run=monday-vs-nonmonday-scan` finds every barcode
  // that has both a Monday-linked row and a non-Monday row (SharePoint import
  // or hand-entered), and checks whether the non-Monday sibling shows any sign
  // of real manual work (status changed from the default, warehouse zone,
  // driver, or a photo) — vs. sitting untouched since creation. Needed before
  // deciding whether it's safe to prefer the Monday row and drop the other.
  // Writes nothing.
  if (url.searchParams.get('run') === 'monday-vs-nonmonday-scan') {
    try {
      const { supabaseAdmin } = await import('./integrations/supabase/client.server')
      const sb = supabaseAdmin as any
      const rows: any[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data: page } = await sb
          .from('shipsync_packages')
          .select('id, barcode, status, warehouse_zone, driver_id, item_photo_url, documents, extra')
          .not('barcode', 'is', null)
          .range(offset, offset + 999)
        if (!page || page.length === 0) break
        rows.push(...page)
        if (page.length < 1000) break
      }

      const groups = new Map<string, any[]>()
      for (const r of rows) {
        const list = groups.get(r.barcode) ?? []
        list.push(r)
        groups.set(r.barcode, list)
      }

      const hasActivity = (r: any) =>
        (r.status && r.status !== 'in_office') || r.warehouse_zone || r.driver_id ||
        r.item_photo_url || (Array.isArray(r.documents) && r.documents.length > 0)

      let pairGroups = 0, untouchedSiblings = 0, activeSiblings = 0
      const activeSamples: any[] = []
      for (const [barcode, group] of groups) {
        if (group.length <= 1) continue
        const mondayRows = group.filter((r: any) => r.extra?.monday_item_id)
        const otherRows = group.filter((r: any) => !r.extra?.monday_item_id)
        if (mondayRows.length === 0 || otherRows.length === 0) continue
        pairGroups++
        for (const o of otherRows) {
          if (hasActivity(o)) {
            activeSiblings++
            if (activeSamples.length < 10) activeSamples.push({ barcode, id: o.id, status: o.status, warehouse_zone: o.warehouse_zone, driver_id: o.driver_id, hasPhoto: !!o.item_photo_url, docCount: o.documents?.length ?? 0 })
          } else {
            untouchedSiblings++
          }
        }
      }

      return new Response(JSON.stringify({ ok: true, pairGroups, untouchedSiblings, activeSiblings, activeSamples }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // One-time repair: `?run=cleanup-empty-stub-dupes` removes rows that are
  // COMPLETELY empty besides their barcode (no boat, courier, owner, local_import,
  // supplier, origin, commodity, description, or delivery note) when another
  // row shares that same barcode and has real data. Never touches a row that
  // has any content of its own, and never touches a barcode group that's
  // either all-stub or all-rich (nothing to prefer between siblings there).
  if (url.searchParams.get('run') === 'cleanup-empty-stub-dupes') {
    try {
      const { supabaseAdmin } = await import('./integrations/supabase/client.server')
      const sb = supabaseAdmin as any
      const isEmptyStub = (r: any) =>
        !r.boat_name && !r.package_owner && !r.courier && !r.local_import &&
        !r.supplier && !r.origin && !r.commodity && !r.description && !r.delivery_note_no

      const rows: any[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data: page } = await sb
          .from('shipsync_packages')
          .select('id, barcode, boat_name, package_owner, courier, local_import, supplier, origin, commodity, description, delivery_note_no')
          .not('barcode', 'is', null)
          .range(offset, offset + 999)
        if (!page || page.length === 0) break
        rows.push(...page)
        if (page.length < 1000) break
      }

      const groups = new Map<string, any[]>()
      for (const r of rows) {
        const list = groups.get(r.barcode) ?? []
        list.push(r)
        groups.set(r.barcode, list)
      }

      let removed = 0, groupsFixed = 0
      const removedIds: string[] = []
      for (const [, group] of groups) {
        if (group.length <= 1) continue
        const stubs = group.filter(isEmptyStub)
        const rich = group.filter((r: any) => !isEmptyStub(r))
        if (stubs.length === 0 || rich.length === 0) continue
        groupsFixed++
        for (const s of stubs) {
          const { error } = await sb.from('shipsync_packages').delete().eq('id', s.id)
          if (!error) { removed++; removedIds.push(s.id) }
        }
      }

      return new Response(JSON.stringify({ ok: true, groupsFixed, removed, removedIds: removedIds.slice(0, 20) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Read-only diagnostic: `?run=monday-debug-item&name=<tracking number>`
  // compares one item's raw Monday data against what's actually stored for
  // it in shipsync_packages. Writes nothing.
  if (url.searchParams.get('run') === 'monday-debug-item') {
    try {
      const { debugMondayItemLookup } = await import('./lib/shipsync/monday.server')
      const r = await debugMondayItemLookup(url.searchParams.get('name') ?? '')
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Read-only diagnostic: `?run=monday-debug-boat&name=<boat name>` checks
  // whether a boat has items on Monday and/or rows in shipsync_packages.
  // Writes nothing.
  if (url.searchParams.get('run') === 'monday-debug-boat') {
    try {
      const { debugMondayBoatSearch } = await import('./lib/shipsync/monday.server')
      const r = await debugMondayBoatSearch(url.searchParams.get('name') ?? '')
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Read-only diagnostic: `?run=vessel-debug&name=<boat name>` checks the
  // yachts table for a boat (case-insensitive substring) and every permit row
  // linked to any match, across all permit types. Writes nothing. There's no
  // audit log wired for permit/yacht deletes in this codebase, so this can
  // only report current state — not history of what happened to a record.
  if (url.searchParams.get('run') === 'vessel-debug') {
    try {
      const name = url.searchParams.get('name') ?? ''
      const { supabaseAdmin } = await import('./integrations/supabase/client.server')
      const sb = supabaseAdmin as any
      const { data: yachts, error: yachtsErr } = await sb
        .from('yachts').select('*').ilike('vessel_name', `%${name}%`)
      const yachtIds = (yachts ?? []).map((y: any) => y.id)
      let permits: any[] = []
      let permitsErr: string | null = null
      if (yachtIds.length > 0) {
        const { data, error } = await sb.from('permits').select('*').in('yacht_id', yachtIds)
        permits = data ?? []
        permitsErr = error?.message ?? null
      }
      const { data: permitsByText } = await sb
        .from('permits').select('id, permit_type, holder_name, notes, status, expiry_date, yacht_id')
        .or(`holder_name.ilike.%${name}%,notes.ilike.%${name}%`)

      // Any permit found by text mention may reference a yacht_id that no
      // longer resolves to a row — check those ids directly, not just by name.
      const referencedYachtIds = Array.from(new Set((permitsByText ?? []).map((p: any) => p.yacht_id).filter(Boolean)))
      let referencedYachts: any[] = []
      if (referencedYachtIds.length > 0) {
        const { data } = await sb.from('yachts').select('*').in('id', referencedYachtIds)
        referencedYachts = data ?? []
      }

      return new Response(JSON.stringify({
        ok: true,
        yachtMatches: yachts ?? [],
        yachtsError: yachtsErr?.message ?? null,
        permitsForMatchedYachts: permits,
        permitsError: permitsErr,
        permitsMentioningNameInText: permitsByText ?? [],
        referencedYachtIds,
        referencedYachtsFound: referencedYachts,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Manual test: `?run=fleet-finance` sends the weekly Fleet Finance email now
  // (respects the toggle + recipients; add `&force=1` to bypass the toggle).
  if (url.searchParams.get('run') === 'fleet-finance') {
    try {
      const { runWeeklyFleetFinance } = await import('./lib/fleet-finance-report.server')
      const r = await runWeeklyFleetFinance({ force: url.searchParams.get('force') === '1' })
      return new Response(JSON.stringify({ ok: true, ...r }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Manual AIS test: `?run-ais=myshiptracking` runs one MyShipTracking sync pass
  // and returns the result (for verifying the API key after `wrangler secret put`).
  if (url.searchParams.get('run-ais') === 'myshiptracking') {
    try {
      const r = await syncMyShipTracking({ extended: url.searchParams.get('extended') === '1' })
      return new Response(JSON.stringify({ ok: true, ...r }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
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
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0)
    try {
      const { downloaded, results } = await downloadPendingImages(n, offset)
      // Surface per-vessel failure reasons so image-sync problems are diagnosable.
      const failures = results.filter((r) => !r.ok).map((r) => r.reason)
      return new Response(JSON.stringify({ ok: true, requested: n, offset, attempted: results.length, downloaded, failures }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Template importer: `?fetch-template=<driveItemId>` copies one of the QB
  // document Word templates from the production@jlsyachts.com OneDrive into the
  // private qb_templates table (service-role only), so the native doc-gen layout
  // can be matched to the real templates. Locked to the exact file IDs from the
  // n8n workflows, and no file content is ever returned to the caller — the
  // response carries only the file name and size.
  {
    const tplId = url.searchParams.get('fetch-template')
    if (tplId) {
      const QB_TEMPLATE_IDS = new Set([
        '01TFJIWC222XD5BFRFLJBLNHKEUROOHDUL', '01TFJIWC2IHFQRYQCCZVBLY5THQXT7YGCF',
        '01TFJIWC2KFEL5MRDMHRBKWUQSF7EV4O3D', '01TFJIWC2P6I4OZULRSRDYOV63C23XQDFC',
        '01TFJIWC34KJCTESMTQ5H357DC4VIU2EP7', '01TFJIWC3F2U537O35RJEIZS2RUZHFDJP6',
        '01TFJIWC3IF7IYPZ22KRDKQEOBQKSMECFU', '01TFJIWC3OHXDSIUS3JNB3FHX2QE4EAEBR',
        '01TFJIWC3PK3QNK6MU3ZFYO2APKQF6QTLT', '01TFJIWC3VSK5BOMM67FFYO4HEMYK2ZUE2',
        '01TFJIWC4UMQSLUHKIBNCZ3PL2FYD47NIP', '01TFJIWC4X3V3ANN7275BJF3AQMYGHJULY',
        '01TFJIWC6KIY4IMWQXHBEJKBGPGJRSHVJJ', '01TFJIWC6KKYBO4QSPMNHJT4LMUP25FDCW',
        '01TFJIWC6YNOVCN5VUEZE3MCY3222WNL6M', '01TFJIWC7E3JZZIO55NNDL76QLTQAK2FTC',
        '01TFJIWCY7GAIY2S3KBBG2TWYD45VWGWQU', '01TFJIWCYDX3MW3YVBRVHZ4ECDTCA2FVXY',
      ])
      if (!QB_TEMPLATE_IDS.has(tplId)) {
        return new Response(JSON.stringify({ ok: false, error: 'Unknown template id' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        })
      }
      try {
        const { getSpConfig, getGraphToken } = await import('./lib/sharepoint-sync.server')
        const { supabaseAdmin } = await import('./integrations/supabase/client.server')
        const cfg = await getSpConfig()
        const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
        const base = `https://graph.microsoft.com/v1.0/users/production@jlsyachts.com/drive/items/${tplId}`
        const metaRes = await fetch(base, { headers: { Authorization: `Bearer ${token}` } })
        if (!metaRes.ok) throw new Error(`Graph metadata ${metaRes.status}: ${(await metaRes.text()).slice(0, 300)}`)
        const meta: any = await metaRes.json()
        const fileRes = await fetch(`${base}/content`, { headers: { Authorization: `Bearer ${token}` } })
        if (!fileRes.ok) throw new Error(`Graph content ${fileRes.status}`)
        const buf = new Uint8Array(await fileRes.arrayBuffer())
        let b64 = ''
        for (let i = 0; i < buf.length; i += 0x8000) {
          b64 += String.fromCharCode(...buf.subarray(i, i + 0x8000))
        }
        b64 = btoa(b64)
        const { error } = await (supabaseAdmin as any).from('qb_templates').upsert({
          id: tplId, name: meta.name ?? tplId, size_bytes: buf.length, content_b64: b64,
          fetched_at: new Date().toISOString(),
        })
        if (error) throw new Error(error.message)
        return new Response(JSON.stringify({ ok: true, name: meta.name, size: buf.length }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        })
      }
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
  //
  // Syncs ONLY the list the subscription is registered for (syncWebhookList).
  // It previously called syncFromSharePoint(), which loops every enabled list in
  // one invocation — the same thing the cron deliberately avoids because it
  // exceeds Cloudflare's subrequest limit, so the instant sync died silently.
  if (request.method === 'POST') {
    ctx.waitUntil(
      syncWebhookList()
        .then((r) => {
          if (r) console.log(`[sp-webhook] ${r.name}: synced=${r.synced} errors=${r.errors}`)
          return downloadPendingImagesRotating(10)
        })
        .then((img) => console.log(`[sp-webhook] images downloaded=${img.downloaded}/${img.processed} offset=${img.offset} pending=${img.pending}`))
        .catch((e) => console.error('[sp-webhook] sync error:', e))
    )
    return new Response('', { status: 202 })
  }

  return new Response('Method not allowed', { status: 405 })
}

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
    // Expose the Worker env (incl. the static ASSETS binding) to server libs.
    // A Worker cannot HTTP-fetch its own hostname, so anything needing a file
    // from public/ (e.g. the branded Quotation template backgrounds) must go
    // through env.ASSETS instead of a URL fetch.
    ;(globalThis as Record<string, unknown>).__CF_ENV = env
    const url = new URL(request.url)

    if (url.pathname === '/sp-hook' || url.pathname === '/api/sharepoint-webhook' || url.pathname === '/api/sharepoint-webhook/') {
      return handleSharePointWebhook(request, ctx)
    }

    // Captain-portal login admin (kept at the top of the dispatch — see #debug note)
    if (url.pathname === '/api/admin/portal-users') {
      return adminPortalUsersHandler(request)
    }

    // Client portal — vessel-scoped Finances (QuickBooks) & Logistics (ShipSync)
    if (url.pathname === '/api/portal/finance') {
      const { portalFinanceHandler } = await import('./routes/api.portal.finance')
      return portalFinanceHandler(request)
    }
    if (url.pathname === '/api/portal/logistics') {
      const { portalLogisticsHandler } = await import('./routes/api.portal.logistics')
      return portalLogisticsHandler(request)
    }

    // Prof Inv registry for the QuickBooks browser extension (token-protected)
    if (url.pathname === '/api/qb/profinv') {
      const { qbProfinvHandler } = await import('./routes/api.qb.profinv')
      return qbProfinvHandler(request)
    }

    // Native QB Invoice PDF preview / manual run (admin only)
    if (url.pathname === '/api/qb/invoice-pdf') {
      const { qbInvoicePdfHandler } = await import('./routes/api.qb.invoice-pdf')
      return qbInvoicePdfHandler(request)
    }

    // Forms: public tokenised fill (no login — the token is the authorisation)
    if (url.pathname === '/api/forms/public') {
      const { formsPublicHandler } = await import('./routes/api.forms.public')
      return formsPublicHandler(request)
    }

    // Client portal — the vessel's documents, and the file behind one.
    if (url.pathname === '/api/portal/documents') {
      const { portalDocumentsHandler } = await import('./routes/api.portal.documents')
      return portalDocumentsHandler(request)
    }
    if (url.pathname === '/api/portal/documents/open') {
      const { portalDocumentOpenHandler } = await import('./routes/api.portal.documents')
      return portalDocumentOpenHandler(request)
    }

    // What the permits sync would write, without writing it (admin only).
    if (url.pathname === '/api/sharepoint/permits-dry-run') {
      const { permitsDryRunHandler } = await import('./routes/api.sharepoint.permits-dry-run')
      return permitsDryRunHandler(request)
    }

    // Secure document links — public, authorised by the token alone.
    if (url.pathname === '/api/documents/meta') {
      const { documentShareMetaHandler } = await import('./routes/api.documents')
      return documentShareMetaHandler(request)
    }
    if (url.pathname === '/api/documents/open') {
      const { documentShareOpenHandler } = await import('./routes/api.documents')
      return documentShareOpenHandler(request)
    }
    // Forms: load the built-in definitions from code into the DB (admin only)
    if (url.pathname === '/api/forms/seed' && request.method === 'POST') {
      const { formsSeedHandler } = await import('./routes/api.forms.seed')
      return formsSeedHandler(request)
    }

    // Permit expiry digest — dry run, sends nothing (admin only)
    if (url.pathname === '/api/permits/expiry-digest') {
      const { permitExpiryDigestHandler } = await import('./routes/api.permits.expiry-digest')
      return permitExpiryDigestHandler(request)
    }

    // Lightspeed → QuickBooks item-description sync (admin only, form-triggered)
    if (url.pathname === '/api/permits/email') {
      const { permitsEmailHandler } = await import('./routes/api.permits.email')
      return permitsEmailHandler(request)
    }

    if (url.pathname === '/api/backups') {
      const { backupsHandler } = await import('./routes/api.backups')
      return backupsHandler(request)
    }

    if (url.pathname === '/api/lightspeed/sync') {
      const { lightspeedSyncHandler } = await import('./routes/api.lightspeed.sync')
      return lightspeedSyncHandler(request)
    }

    // Knowledge Base: import a PDF/Word document into a guide (+ branded PDF)
    if (url.pathname === '/api/guides/import') {
      const { guidesImportHandler } = await import('./routes/api.guides.import')
      return guidesImportHandler(request)
    }

    // TEMPORARY one-off: external email recipients (90d) CSV export (admin only).
    if (url.pathname === '/api/admin/mail-export') {
      const { mailExportHandler } = await import('./routes/api.admin.mail-export')
      return mailExportHandler(request)
    }

    // QB Excel importer — upload a workbook to create Estimates/Invoices
    if (url.pathname === '/api/qb/excel-import') {
      const { qbExcelImportHandler } = await import('./routes/api.qb.excel-import')
      return qbExcelImportHandler(request)
    }

    // Lightspeed → Waypoint suppliers manual sync (authenticated)
    if (url.pathname === '/api/lightspeed/suppliers-sync') {
      const { lightspeedSuppliersSyncHandler } = await import('./routes/api.lightspeed.suppliers-sync')
      return lightspeedSuppliersSyncHandler(request)
    }

    // Lightspeed (Vend) → QuickBooks retail sync webhooks
    if (url.pathname.startsWith('/api/lightspeed/')) {
      const { lightspeedWebhookHandler } = await import('./routes/api.lightspeed.webhook')
      return lightspeedWebhookHandler(request)
    }

    // Public: password-reset email via SES (Supabase's own mailer is unconfigured).
    if (url.pathname === '/api/auth/forgot-password' && request.method === 'POST') {
      const { authForgotPasswordHandler } = await import('./routes/api.auth.forgot-password')
      return authForgotPasswordHandler(request)
    }

    if (url.pathname === '/api/leo/briefing' && request.method === 'POST') {
      return leoBriefingHandler(request)
    }

    if (url.pathname === '/api/native-language/resolve-default' && request.method === 'GET') {
      return nativeLanguageResolveDefaultHandler(request)
    }

    if (url.pathname === '/api/native-language/save' && request.method === 'POST') {
      return nativeLanguageSaveHandler(request)
    }

    if (url.pathname === '/api/leo/chat' && request.method === 'POST') {
      return leoChatHandler(request)
    }

    if (url.pathname === '/api/leo/welcome' && request.method === 'POST') {
      return leoWelcomeHandler(request)
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

    if (url.pathname === '/api/visa/excel-sync' && (request.method === 'GET' || request.method === 'POST')) {
      return visaExcelSyncHandler(request)
    }

    if (url.pathname === '/api/visa/upload-arrival-doc' && request.method === 'POST') {
      return visaUploadArrivalDocHandler(request)
    }

    if (url.pathname === '/api/visa/send-to-vessel' && request.method === 'POST') {
      return visaSendToVesselHandler(request)
    }

    if (url.pathname === '/api/admin/seed-templates-folder' && request.method === 'POST') {
      return seedTemplatesFolderHandler(request)
    }

    if (url.pathname === '/api/visa/passport-ocr' && request.method === 'POST') {
      return visaPassportOcrHandler(request)
    }

    // Read an air waybill so an Import shipment can be raised from the paperwork.
    if (url.pathname === '/api/shipsync/awb-ocr' && request.method === 'POST') {
      const { shipsyncAwbOcrHandler } = await import('./routes/api.shipsync.awb-ocr')
      return shipsyncAwbOcrHandler(request)
    }

    if (url.pathname === '/api/crew/verification-letter' && request.method === 'POST') {
      const { crewVerificationHandler } = await import('./lib/crew-verification.server')
      return crewVerificationHandler(request)
    }

    if (url.pathname === '/api/it-tickets/poll-mail' && request.method === 'POST') {
      const { itTicketsPollMailHandler } = await import('./routes/api.it-tickets.poll-mail')
      return itTicketsPollMailHandler(request)
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

    if (url.pathname === '/api/anchor-forms' && request.method === 'POST') {
      return anchorFormsHandler(request)
    }

    if (url.pathname === '/api/feedback/notify' && request.method === 'POST') {
      return feedbackNotifyHandler(request)
    }

    if (url.pathname === '/api/vessels/mmsi-suggest' && request.method === 'GET') {
      return mmsiSuggestHandler(request)
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
    if (url.pathname === '/api/admin/user-modules') {
      const { adminUserModulesHandler } = await import('./routes/api.admin.user-modules')
      return adminUserModulesHandler(request)
    }
    if (url.pathname === '/api/admin/users') {
      return adminUsersHandler(request)
    }
    if (url.pathname.startsWith('/api/admin/users/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/admin/users/'.length))
      if (id) return adminUserByIdHandler(request, id)
    }
    if (url.pathname === '/api/movements/import' && request.method === 'POST') {
      const { movementsImportHandler } = await import('./routes/api.movements.import')
      return movementsImportHandler(request)
    }
    if (url.pathname === '/api/movements/notify' && request.method === 'POST') {
      return movementsNotifyHandler(request)
    }
    if (url.pathname === '/api/automations/event' && request.method === 'POST') {
      return automationEventHandler(request)
    }
    if (url.pathname === '/api/qb/webhook' && request.method === 'POST') {
      return qbWebhookHandler(request, ctx)
    }
    if (url.pathname === '/api/qb/invoice' && (request.method === 'GET' || request.method === 'POST')) {
      return qbInvoiceHandler(request)
    }
    if (url.pathname === '/api/qb/customers' && request.method === 'GET') {
      return qbCustomersHandler(request)
    }
    if (url.pathname === '/api/qb/sync' && (request.method === 'GET' || request.method === 'POST')) {
      return qbSyncHandler(request)
    }
    if (url.pathname === '/api/qb/doc-pdf' && request.method === 'GET') {
      return qbDocPdfHandler(request)
    }
    if (url.pathname === '/api/crew-placement' && request.method === 'POST') {
      return crewPlacementHandler(request)
    }
    if (url.pathname === '/api/qb/connect' && request.method === 'GET') {
      return qbConnectHandler(request)
    }
    if (url.pathname === '/api/qb/callback' && request.method === 'GET') {
      return qbCallbackHandler(request)
    }
    if (url.pathname.startsWith('/api/reports/') && request.method === 'GET') {
      return movementReportsHandler(request)
    }

    // TanStack's handler takes (request, opts?) — `env`/`ctx` were being passed
    // into a slot that expects `{ context }` and a third parameter that does not
    // exist, so both were ignored. Server code reads the environment from
    // globalThis.__CF_ENV, set at the top of this fetch handler.
    return handleRequest(request)
  },

  // Cron triggers: "0 * * * *" (hourly) → SharePoint inbound sync of all lists;
  // "*/15 * * * *" (every 15 min) → live vehicle/vessel tracking + daily alert checks.
  async scheduled(_event: unknown, _env: Record<string, unknown>, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<void> {
    ;(globalThis as Record<string, unknown>).__CF_ENV = _env
    const utcHour = new Date().getUTCHours();
    const cron = (_event as { cron?: string } | undefined)?.cron;
    const isHourly = cron === '0 * * * *' || (cron == null && new Date().getUTCMinutes() < 15);
    const isQuarterly = cron === '*/15 * * * *' || cron == null;
    const isAis = cron === '5,20,35,50 * * * *';
    const isFiveMin = cron === '*/5 * * * *';

    // ── Every 5 min: incremental QBO document sync (invoices / pro-formas /
    //    estimates) for every connected company — JLS + Waypoint retail. ──
    if (isFiveMin) {
      // Sync first, THEN the reconciler — strictly sequential so the two can
      // never process the same document at the same time (a parallel run could
      // race the duplicate-sweeps against each other), and so the reconciler
      // sees the doc-gen state the sync's own backstop just wrote.
      ctx.waitUntil(
        syncAllRealms({})
          .then((r) => console.log(`[qbo-sync] ${JSON.stringify(r)}`))
          .catch((e) => console.error('[qbo-sync] error:', e))
          .then(() => import('./lib/qb/health.server'))
          .then((m) => m.docgenReconcile())
          .then((r) => console.log(`[qb-docgen-reconcile] ${r.length ? r.join('; ') : 'nothing to do'}`))
          .catch((e) => console.error('[qb-docgen-reconcile] error:', e))
      );
      // Reliability sweeper: re-process any QuickBooks webhook event that hasn't
      // fully succeeded (per-document failure, deploy mid-request, transient QBO
      // error). Events are ACKed + stored on receipt, so nothing is ever lost.
      ctx.waitUntil(
        retryPendingQbWebhookEvents()
          .catch((e) => console.error('[qb-webhook-sweeper] error:', e))
      );
      // ── Every 5 min: pull SharePoint changes IN ──
      // Priority lists (Yachts) every tick so vessel location/berth/ETD is never
      // more than 5 minutes behind SharePoint, plus the stalest few others so the
      // whole set cycles in ~15-20 min instead of the old 3 hours. Bounded per
      // ── Every 5 min: pull email replies INTO their tickets ──
      //    Our notifications tell people "reply to this email to add to your
      //    ticket"; this is what delivers on that. No-ops until the mail
      //    credentials are set (and the app has Mail.Read).
      ctx.waitUntil(
        import('./lib/ticket-mail-inbound.server')
          .then((m) => m.pollTicketMailbox())
          .then((r) => { if (r && (r.appended || r.errors.length)) console.log('[ticket-mail]', JSON.stringify(r)) })
          .catch((e) => console.error('[ticket-mail] error:', e instanceof Error ? e.message : String(e)))
      );

      // invocation — see syncPrioritisedLists().
      ctx.waitUntil(
        syncPrioritisedLists()
          .then((ran) => { if (ran.length) console.log('[sp-fast] ' + ran.map(r => `${r.name}: synced=${r.synced} errors=${r.errors}`).join(' | ')) })
          .catch((e) => console.error('[sp-fast] error:', e))
      );

      // Van GPS every 5 min (moved from the 15-min tick): the "arriving in ~5
      // minutes" proximity check right below needs a position no more than a
      // few minutes stale, or a genuinely-5-minutes-out van could be missed
      // or reported late.
      ctx.waitUntil(
        syncFleetPositions()
          .then(({ fetched, updated }) => console.log(`[mygps-cron] fetched=${fetched} updated=${updated}`))
          .catch((e) => console.error('[mygps-cron] error:', e))
      );

      // ShipSync: email a package's receiver once their van's real
      // driving-time ETA drops to 5 minutes or under. No-ops silently until
      // Google Maps integration is configured.
      ctx.waitUntil(
        import('./lib/shipsync/proximity-alert.server')
          .then((m) => m.checkDeliveryProximity())
          .then((r) => { if (r.checked) console.log(`[shipsync-proximity] checked=${r.checked} notified=${r.notified} skipped=${r.skipped}`) })
          .catch((e) => console.error('[shipsync-proximity] error:', e))
      );
      return;
    }

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

      // ── Hourly: copy Polaris-captured package photos into the SharePoint
      //    image library, so it keeps a second copy of every photo. Backup
      //    only — Supabase holds the original and a failure just retries. ──
      ctx.waitUntil(
        import('./lib/shipsync/photo-backup.server')
          .then(({ backupShipSyncPhotos }) => backupShipSyncPhotos())
          .then((r) => { if (r.copied || r.failed) console.log(`[shipsync-photo-backup] ${r.detail}`) })
          .catch((e) => console.error('[shipsync-photo-backup] error:', e))
      )

      // ── Hourly: MyShipTracking live positions (no-op until API key set).
      //    Simple response (1 credit/vessel); upgraded to extended (3 credits)
      //    every 6 hours so destination/ETA stay fresh without burning credits. ──
      const mstExtended = utcHour % 6 === 0
      ctx.waitUntil(
        syncMyShipTracking({ extended: mstExtended })
          .then((r) => console.log(`[myshiptracking-cron] ${mstExtended ? 'extended' : 'simple'} requested=${r.requested} matched=${r.matched} updated=${r.updated}${r.note ? ' note=' + r.note : ''}`))
          .catch((e) => console.error('[myshiptracking-cron] error:', e))
      )

      // ── Hourly: mirror the Monday.com ShipSync Import/Transit board into the
      //    app (read-only). No-ops silently until the token + import_board_id are set. ──
      ctx.waitUntil(
        import('./lib/shipsync/monday-import-board.server')
          .then(({ importMondayImportBoard }) => importMondayImportBoard())
          .then((r) => console.log(`[shipsync-import-board-cron] synced=${r.synced} errors=${r.errors}`))
          .catch((e) => console.error('[shipsync-import-board-cron] error:', e instanceof Error ? e.message : String(e)))
      )

      // ── Hourly: QuickBooks pipeline health monitor — broken/expiring company
      //    connections, sync errors, exhausted webhook retries, webhook silence.
      //    Problems land in the run log and email an alert (max one per 6h). ──
      ctx.waitUntil(
        import('./lib/qb/health.server')
          .then((m) => m.qbHealthCheck())
          .then((p) => console.log(`[qb-health] ${p.length ? p.length + ' issue(s)' : 'ok'}`))
          .catch((e) => console.error('[qb-health] error:', e))
      )

      // ── Daily (03:00 UTC): pull the Lightspeed supplier list into Waypoint.
      //    No-ops until the Lightspeed API token is set. ──
      if (utcHour === 3) {
        ctx.waitUntil(
          import('./lib/lightspeed/suppliers.server')
            .then(({ syncLightspeedSuppliers }) => syncLightspeedSuppliers('cron'))
            .then((r) => console.log(`[ls-suppliers-cron] fetched=${r.fetched} upserted=${r.upserted}${r.note ? ' note=' + r.note : ''}`))
            .catch((e) => console.error('[ls-suppliers-cron] error:', e))
        )
      }
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

    // ── Hourly: one chunk of the two-way visa ⇄ tracker sync (rotating cursor,
    // snapshot-guarded newest-wins). Cycles through all vessels over ~8 hours. ──
    if (isHourly) {
      ctx.waitUntil(
        runTwoWaySyncTick()
          .then((r) => console.log(`[visa-2way-cron] offset=${r.offset} next=${r.nextOffset} ${JSON.stringify(r.summary ?? {})}`))
          .catch((e) => console.error('[visa-2way-cron] error:', e))
      )
    }

    // ── Every 15 min: Mini Backup platform — start due AMIs, poll them, and
    //    advance the offsite block copy to Impossible Cloud (bounded per tick).
    //    No-ops until the AWS credentials are saved in the Backups tab. ──
    ctx.waitUntil(
      import('./lib/backup/runner.server')
        .then((m) => m.runBackupTick())
        .then((r) => { if (r) console.log('[backup-cron]', JSON.stringify(r)) })
        .catch((e) => console.error('[backup-cron] error:', e))
    )

    // ── Every 15 min: vessel-image backfill ──
    // The list pull itself moved to the 5-minute tick (syncPrioritisedLists) so
    // vessel movements land promptly; this tick keeps the image backfill, and
    // still nudges the stalest list as a safety net if the fast tick is ever
    // disabled. All lists at once would exceed Cloudflare's per-invocation
    // subrequest limit, and a Worker can't self-fetch to fan out.
    ctx.waitUntil(
      syncStalestList()
        // Image backfill walks the WHOLE pending set via a persisted cursor. The
        // old (UTCminutes % 4) * 10 window only ever produced offsets 0/10/20/30,
        // so with a backlog over 40 rows every vessel past the first 40 was never
        // reached — newly uploaded photos for those vessels never downloaded.
        .then((r) => { if (r) console.log(`[sp-cron] ${r.name}: synced=${r.synced} errors=${r.errors}`); return downloadPendingImagesRotating(10) })
        .then((img) => { if (img.processed) console.log(`[sp-cron] images downloaded=${img.downloaded}/${img.processed} offset=${img.offset}→${img.nextOffset} pending=${img.pending}`) })
        .catch((e) => console.error('[sp-cron] error:', e))
    )

    // (myGPS vehicle positions now sync on the 5-min tick above — the
    // ShipSync proximity alert needs fresher data than 15 min gave it.)

    // Sync live VesselFinder AIS positions onto yachts (no-op until userkey set)
    ctx.waitUntil(
      syncVesselPositions()
        .then(({ matched, updated }) => console.log(`[vesselfinder-cron] matched=${matched} updated=${updated}`))
        .catch((e) => console.error('[vesselfinder-cron] error:', e))
    )

    // (MyShipTracking positions moved to the hourly block above — see isHourly.)

    // Weekly immigration digest — Monday 07:00 GST (03:00 UTC). Emails ops/visa
    // a summary of this week's planned sign-ons / sign-offs + report links.
    if (utcHour === 3 && new Date().getUTCDay() === 1 && new Date().getUTCMinutes() < 15) {
      ctx.waitUntil(
        trackRun({ key: 'weekly-immigration-report', name: 'Weekly immigration digest', source: 'worker-cron', trigger_type: 'schedule', category: 'Crew' },
          () => runWeeklyImmigrationReports())
          .then((r) => console.log(`[weekly-immigration] on=${r.signOn} off=${r.signOff} sent=${r.sent}`))
          .catch((e) => console.error('[weekly-immigration] error:', e))
      )
    }

    // Weekly Fleet Finance email — Monday 08:00 GST (04:00 UTC). Outstanding QBO
    // balances per yacht; toggle + recipients live on the Automations page.
    if (utcHour === 4 && new Date().getUTCDay() === 1 && new Date().getUTCMinutes() < 15) {
      ctx.waitUntil(
        trackRun({ key: 'weekly-fleet-finance', name: 'Weekly Fleet Finance email', source: 'worker-cron', trigger_type: 'schedule', category: 'Finance' },
          () => runWeeklyFleetFinance())
          .then((r) => console.log(`[fleet-finance] sent=${r.sent} yachts=${r.yachts} outstanding=${r.outstanding}${r.note ? ' note=' + r.note : ''}`))
          .catch((e) => console.error('[fleet-finance] error:', e))
      )
    }

    // Weekly visa report — Friday 08:00 GST (04:00 UTC). Generates + emails a
    // visa-status report to every yacht opted in (send_visa_reports = true).
    if (utcHour === 4 && new Date().getUTCDay() === 5 && new Date().getUTCMinutes() < 15) {
      ctx.waitUntil(
        trackRun({ key: 'weekly-visa-report', name: 'Weekly visa report', source: 'worker-cron', trigger_type: 'schedule', category: 'Visa' },
          () => runWeeklyVisaReports())
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

    // Permit expiry digest — one internal email to Port Ops, daily at 08:00 UTC.
    // No-ops until PERMIT_EXPIRY_ALERTS_ENABLED is true (see wrangler.jsonc).
    if (utcHour === 8) {
      ctx.waitUntil(
        runExpiryAlerts()
          .then(({ sent, skipped }) => console.log(`[expiry-digest] sent=${sent} skipped=${skipped}`))
          .catch((e) => console.error('[expiry-digest] error:', e))
      )
    }
  },
}
