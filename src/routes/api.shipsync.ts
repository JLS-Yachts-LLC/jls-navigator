/**
 * ShipSync server API — POST /api/shipsync/note-pdf and /api/shipsync/email-pod.
 * Authenticated (bearer). Generates delivery-note PDFs and sends POD emails.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { generateNotePdf, emailProofOfDelivery } from '@/lib/shipsync/automations.server'
import { pushShipSyncToSharePoint, importShipSyncFromSharePoint } from '@/lib/shipsync/sharepoint.server'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function shipsyncApiHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const { data: { user }, error } = await (supabaseAdmin as any).auth.getUser(auth.slice(7))
  if (error || !user) return json({ ok: false, error: 'Unauthorized' }, 401)

  let body: any = {}
  try { body = await request.json() } catch { /* allow empty */ }

  try {
    if (url.pathname === '/api/shipsync/note-pdf') {
      if (!body.noteId) return json({ ok: false, error: 'noteId required' }, 400)
      const kind = body.kind === 'predelivery' ? 'predelivery' : 'delivery'
      const pdfUrl = await generateNotePdf(body.noteId, kind)
      return json({ ok: true, pdfUrl, kind })
    }
    if (url.pathname === '/api/shipsync/email-pod') {
      if (!body.noteId) return json({ ok: false, error: 'noteId required' }, 400)
      const res = await emailProofOfDelivery(body.noteId, body.to)
      return json({ ok: true, ...res })
    }
    if (url.pathname === '/api/shipsync/sp-push') {
      const res = await pushShipSyncToSharePoint({ dryRun: !!body.dryRun })
      return json(res)
    }
    if (url.pathname === '/api/shipsync/sp-import') {
      const res = await importShipSyncFromSharePoint({ limit: body.limit })
      return json(res)
    }
    return json({ ok: false, error: 'Unknown endpoint' }, 404)
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? 'ShipSync action failed' }, 500)
  }
}
