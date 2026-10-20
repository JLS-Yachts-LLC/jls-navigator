/**
 * /api/sharepoint/permits-repair — put right the SharePoint permit items the old
 * (pre-3 Sept) push overwrote with another list's permit.
 *
 *   GET                       → the plan: what would be restored, deleted, or left for
 *                               a person. Writes nothing.
 *   POST { keys: string[] }   → carries out those previewed actions, up to 25 per call;
 *                               returns `remaining` keys for the caller to send again.
 *   ?job=dma-copies           → the same, for DMA permits the old push copied into the
 *                               other lists (Polaris rows backed up, then removed).
 *
 * See permits-sp-repair.server.ts for the rules. Admin only.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { applyDmaCopyCleanup, applyPermitRepairs, planDmaCopyCleanup, planPermitRepairs } from '@/lib/permits-sp-repair.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function permitsRepairHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request, ['global_admin', 'org_admin'])
  if (!session.ok) return session.response

  // ?job=dma-copies — the DMA permits the old push copied into every other list.
  const dmaCopies = new URL(request.url).searchParams.get('job') === 'dma-copies'

  try {
    if (request.method === 'GET') return json({ ok: true, ...(dmaCopies ? await planDmaCopyCleanup() : await planPermitRepairs()) })
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { keys?: unknown }
      const keys = Array.isArray(body.keys) ? body.keys.map(String).filter(Boolean) : []
      if (!keys.length) return json({ ok: false, error: 'No actions given' }, 400)
      const result = dmaCopies ? await applyDmaCopyCleanup(keys) : await applyPermitRepairs(keys)
      console.log(`[permits-sp-repair] by ${session.user.email}: done=${result.done.length} failed=${result.failed.length} skipped=${result.skipped} remaining=${result.remaining.length}`)
      return json({ ok: true, ...result })
    }
    return new Response('Method not allowed', { status: 405 })
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e).slice(0, 300) }, 500)
  }
}
