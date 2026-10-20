/**
 * /api/sharepoint/permits-repair — put right the SharePoint permit items the old
 * (pre-3 Sept) push overwrote with another list's permit.
 *
 *   GET                       → the plan: what would be restored, deleted, or left for
 *                               a person. Writes nothing.
 *   POST { keys: string[] }   → carries out those previewed actions, up to 25 per call;
 *                               returns `remaining` keys for the caller to send again.
 *
 * See permits-sp-repair.server.ts for the rules. Admin only.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { applyPermitRepairs, planPermitRepairs } from '@/lib/permits-sp-repair.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function permitsRepairHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request, ['global_admin', 'org_admin'])
  if (!session.ok) return session.response

  try {
    if (request.method === 'GET') return json({ ok: true, ...(await planPermitRepairs()) })
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { keys?: unknown }
      const keys = Array.isArray(body.keys) ? body.keys.map(String).filter(Boolean) : []
      if (!keys.length) return json({ ok: false, error: 'No actions given' }, 400)
      const result = await applyPermitRepairs(keys)
      console.log(`[permits-sp-repair] by ${session.user.email}: done=${result.done.length} failed=${result.failed.length} skipped=${result.skipped} remaining=${result.remaining.length}`)
      return json({ ok: true, ...result })
    }
    return new Response('Method not allowed', { status: 405 })
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e).slice(0, 300) }, 500)
  }
}
