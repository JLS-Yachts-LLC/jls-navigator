/**
 * Visa → Excel write-back trigger.
 *   GET  /api/visa/excel-push?id=<visaId>&dry=1   → dry run (no writes), returns planned cell changes
 *   GET  /api/visa/excel-push?id=<visaId>         → live write-back
 *   POST /api/visa/excel-push   { id, dry? }      → live write-back (fire-and-forget from UI)
 */
import { pushVisaToExcel } from '@/lib/visa/excel-writeback.server'

export async function visaExcelPushHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  let id = url.searchParams.get('id') ?? ''
  let dry = url.searchParams.get('dry') === '1'
  if (request.method === 'POST') {
    try {
      const body: any = await request.json()
      id = body.id ?? id
      dry = body.dry ?? dry
    } catch { /* ignore */ }
  }
  if (!id) return new Response(JSON.stringify({ ok: false, error: 'missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const result = await pushVisaToExcel(id, { dryRun: dry })
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  })
}
