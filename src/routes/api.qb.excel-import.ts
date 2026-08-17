/**
 * QB Excel importer API — the native port of the n8n "QB (Quotation/Estimate)
 * Excel Input" form workflow.
 *
 *   POST /api/qb/excel-import?kind=estimate|invoice      (staff, bearer token)
 *   POST /api/qb/excel-import?token=<link token>          (public upload link)
 *   GET  /api/qb/excel-import?token=<link token>          → { ok, kind } probe
 *
 * Accepts a multipart .xlsx upload and creates one QuickBooks Estimate
 * (Q26-#####) or Invoice (JLS26-#####) per worksheet. Returns per-sheet results.
 *
 * Two authorisation paths:
 *  - Staff in Polaris send a Supabase bearer token and choose the kind.
 *  - The login-free links (/qb-upload/<token>) send the link token instead —
 *    the n8n original was an ungated n8n form URL, and the team still needs a
 *    shareable link. Each token maps to EXACTLY ONE kind (seeded by migration
 *    20260817090000 into integration_settings 'qb_excel_links'), so a quotation
 *    link can never create invoices. Rotate a leaked link by updating the token
 *    in that config row.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { qboConfigured } from '@/lib/qb/qbo.server'
import { importFromXlsx } from '@/lib/qb/excel-import.server'

const db = () => supabaseAdmin as any
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

type Kind = 'estimate' | 'invoice'

/** Resolve a public link token to its document kind; null when unknown/disabled. */
async function kindForToken(token: string): Promise<Kind | null> {
  if (!token || token.length < 16) return null
  const { data: row } = await db()
    .from('integration_settings').select('enabled, config')
    .eq('integration_name', 'qb_excel_links').maybeSingle()
  if (!row || row.enabled === false) return null
  const cfg = row.config ?? {}
  if (token === cfg.estimate_token) return 'estimate'
  if (token === cfg.invoice_token) return 'invoice'
  return null
}

export async function qbExcelImportHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const linkToken = url.searchParams.get('token') ?? ''

  // GET: the public upload page probing whether its link is (still) valid.
  if (request.method === 'GET') {
    const kind = await kindForToken(linkToken)
    if (!kind) return json({ ok: false, error: 'This upload link is not valid or has been replaced.' }, 404)
    return json({ ok: true, kind })
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  // Authorisation: a valid link token (kind comes from the token), or a
  // signed-in staff session (kind comes from the query).
  let kind: Kind
  const tokenKind = await kindForToken(linkToken)
  if (tokenKind) {
    kind = tokenKind
  } else {
    const auth = request.headers.get('authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
    const { data: { user }, error: authErr } = await db().auth.getUser(auth.slice(7))
    if (authErr || !user) return json({ ok: false, error: 'Unauthorized' }, 401)
    kind = url.searchParams.get('kind') === 'invoice' ? 'invoice' : 'estimate'
  }

  if (!qboConfigured()) return json({ ok: false, error: 'QuickBooks is not connected.', code: 'not_configured' }, 503)

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
