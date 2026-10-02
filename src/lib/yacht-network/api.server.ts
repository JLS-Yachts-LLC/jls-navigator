/**
 * HTTP handlers for the Yacht IT Network tab.
 *
 *   POST /api/yacht-network/sync   run the New Horizon sync now   (yacht_it edit)
 *   GET  /api/yacht-network/datto  live Datto devices             (yacht_it view)
 *
 * Both go server-side because they reach New Horizon with the shared secret,
 * which must never be in the browser.
 */
import { requireAccess } from '@/lib/auth/requireAccess.server'
import { runYachtItSync, fetchPartnerDattoDevices } from '@/lib/yacht-network/sync.server'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function yachtNetworkSyncHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: 'yacht_it', level: 'edit' })
  if (!access.ok) return access.response

  // A full pass rather than incremental: this is the button someone presses
  // because something looks wrong, and a full pass is what heals a gap. The row
  // counts are small enough that it costs no more than an incremental run.
  const result = await runYachtItSync({ full: true })
  if (!result) return json({ ok: false, error: 'The New Horizon sync is switched off' }, 503)
  return json(result, result.ok ? 200 : 502)
}

export async function yachtNetworkDattoHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: 'yacht_it', level: 'view' })
  if (!access.ok) return access.response

  const out = await fetchPartnerDattoDevices()
  return json(out, 'error' in out ? 502 : 200)
}
