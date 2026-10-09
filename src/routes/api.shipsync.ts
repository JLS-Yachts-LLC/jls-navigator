/**
 * ShipSync server API — POST /api/shipsync/note-pdf, /email-pod, /email-warehouse-receipt,
 * /sp-push and /sp-import. Generates delivery-note PDFs, sends proof-of-delivery and
 * receipt emails, and runs the SharePoint sync.
 *
 * Each route decides who may call it (see access.server.ts): ShipSync staff, and — for the
 * PDF and proof-of-delivery routes only — a driver acting on their OWN delivery note. A signed-in
 * account with no ShipSync access (or a client-portal captain) is refused.
 */
import { authorizeShipSync } from '@/lib/shipsync/access.server'
import { generateNotePdf, emailProofOfDelivery, emailWarehouseReceipt } from '@/lib/shipsync/automations.server'
import { pushShipSyncToSharePoint, importShipSyncFromSharePoint } from '@/lib/shipsync/sharepoint.server'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function shipsyncApiHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  let body: any = {}
  try { body = await request.json() } catch { /* allow empty */ }

  const access = await authorizeShipSync(request,
    url.pathname === '/api/shipsync/note-pdf' || url.pathname === '/api/shipsync/email-pod'
      ? { driverOk: true, noteId: typeof body.noteId === 'string' ? body.noteId : undefined }
      : url.pathname === '/api/shipsync/sp-push' || url.pathname === '/api/shipsync/sp-import'
        ? { level: 'edit' }
        : {})
  if (!access.ok) return access.response

  try {
    if (url.pathname === '/api/shipsync/note-pdf') {
      if (!body.noteId) return json({ ok: false, error: 'noteId required' }, 400)
      const kind = body.kind === 'predelivery' ? 'predelivery' : 'delivery'
      const pdfUrl = await generateNotePdf(body.noteId, kind)
      return json({ ok: true, pdfUrl, kind })
    }
    if (url.pathname === '/api/shipsync/email-pod') {
      if (!body.noteId) return json({ ok: false, error: 'noteId required' }, 400)
      const res = await emailProofOfDelivery(body.noteId, body.to, body.kind === 'predelivery' ? 'predelivery' : 'delivery', typeof body.boat === 'string' && body.boat ? body.boat : undefined)
      return json({ ok: true, ...res })
    }
    if (url.pathname === '/api/shipsync/email-warehouse-receipt') {
      if (!body.checkoutId || !body.to) return json({ ok: false, error: 'checkoutId and to required' }, 400)
      const res = await emailWarehouseReceipt(body.checkoutId, body.to)
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
