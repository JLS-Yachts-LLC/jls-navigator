/**
 * POST /api/qb/excel-import?kind=estimate|invoice  (authenticated, bearer)
 *
 * Accepts a multipart upload of an .xlsx workbook and creates one QuickBooks
 * Estimate (Q26-#####) or Invoice (JLS26-#####) per worksheet — the native port
 * of the n8n Excel-input form workflows. Returns per-sheet results.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { qboConfigured } from '@/lib/qb/qbo.server'
import { importFromXlsx } from '@/lib/qb/excel-import.server'

const db = () => supabaseAdmin as any
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function qbExcelImportHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const { data: { user }, error: authErr } = await db().auth.getUser(auth.slice(7))
  if (authErr || !user) return json({ ok: false, error: 'Unauthorized' }, 401)
  if (!qboConfigured()) return json({ ok: false, error: 'QuickBooks is not connected.', code: 'not_configured' }, 503)

  const url = new URL(request.url)
  const kind = url.searchParams.get('kind') === 'invoice' ? 'invoice' : 'estimate'

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return json({ ok: false, error: 'No file uploaded (field "file")' }, 400)
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return json({ ok: false, error: 'Not a valid .xlsx file' }, 400)

    const results = await importFromXlsx(kind, bytes)
    const created = results.filter((r) => r.ok).length
    return json({ ok: true, kind, created, total: results.length, results })
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e).slice(0, 400) }, 500)
  }
}
