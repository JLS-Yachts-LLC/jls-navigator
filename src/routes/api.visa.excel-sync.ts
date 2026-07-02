/**
 * Visa ⇄ Excel tracker sync.
 *   GET /api/visa/excel-sync?mode=inspect   → read-only structure of the 3 trackers (no PII)
 * (reconcile + two-way modes are added on top of this.)
 */
import { inspectTrackers, peekSheet, reconcileCrewVisa, syncCrewVisaTwoWay } from '@/lib/visa/excel-sync.server'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function visaExcelSyncHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const mode = url.searchParams.get('mode') ?? 'inspect'

  if (mode === 'inspect') {
    const trackerKey = url.searchParams.get('tracker') ?? undefined
    const sampleSheets = url.searchParams.get('sheets') ? Number(url.searchParams.get('sheets')) : undefined
    const sheetOffset = url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined
    const r = await inspectTrackers({ trackerKey, sampleSheets, sheetOffset })
    return json(r, r.ok ? 200 : 500)
  }
  // Excel → app reconcile (Crew Visa Tracker). mode=pull-crew (dry by default; apply=1 to write).
  if (mode === 'pull-crew') {
    const num = (k: string, d?: number) => { const v = url.searchParams.get(k); return v == null ? d : Number(v) }
    const r = await reconcileCrewVisa({
      vesselOffset: num('offset', 0),
      vesselLimit: num('limit', 20),
      dryRun: url.searchParams.get('apply') !== '1',
      createMissing: url.searchParams.get('create') !== '0',
    })
    return json(r, r.ok ? 200 : 500)
  }

  // Two-way sync (snapshot-guarded, newest-wins). mode=two-way (dry by default; apply=1 to write).
  if (mode === 'two-way') {
    const num = (k: string, d?: number) => { const v = url.searchParams.get(k); return v == null ? d : Number(v) }
    const r = await syncCrewVisaTwoWay({
      vesselOffset: num('offset', 0),
      vesselLimit: num('limit', 20),
      dryRun: url.searchParams.get('apply') !== '1',
    })
    return json(r, r.ok ? 200 : 500)
  }

  if (mode === 'peek') {
    const tracker = url.searchParams.get('tracker') ?? ''
    const sheet = url.searchParams.get('sheet') ?? ''
    const rows = url.searchParams.get('rows') ? Number(url.searchParams.get('rows')) : 8
    const r = await peekSheet(tracker, sheet, rows)
    return json(r, r.ok ? 200 : 500)
  }
  return json({ ok: false, error: `unknown mode: ${mode}` }, 400)
}
