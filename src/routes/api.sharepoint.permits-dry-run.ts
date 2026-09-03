/**
 * GET /api/sharepoint/permits-dry-run — what the permit lists would write.
 *
 * The permits sync overwrote rows across lists for three months, so before it
 * goes back on someone needs to see the blast radius. This reads SharePoint and
 * reports the planned updates and inserts per list, and writes nothing. It works
 * while the lists are disabled, which is the point.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { dryRunPermitsSync } from '@/lib/sharepoint-sync.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export async function permitsDryRunHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request, ['global_admin', 'org_admin'])
  if (!session.ok) return session.response

  try {
    const lists = await dryRunPermitsSync()
    const totals = lists.reduce(
      (a, l) => {
        const line = l.result.samples?.[0] ?? ''
        const m = line.match(/(\d+) update\(s\), (\d+) insert\(s\)/)
        return {
          updates: a.updates + (m ? Number(m[1]) : 0),
          inserts: a.inserts + (m ? Number(m[2]) : 0),
          errors: a.errors + l.result.errors,
        }
      },
      { updates: 0, inserts: 0, errors: 0 },
    )
    return json({ ok: true, dryRun: true, totals, lists })
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e).slice(0, 500) }, 500)
  }
}
