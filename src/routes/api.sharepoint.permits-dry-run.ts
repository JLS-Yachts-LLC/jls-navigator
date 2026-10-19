/**
 * GET /api/sharepoint/permits-dry-run — what the permit lists would write.
 *
 * The permits sync overwrote rows across lists for three months, so before it
 * goes back on someone needs to see the blast radius. This reads SharePoint and
 * reports the planned updates and inserts per list — and, since a real run also
 * PUSHES rows Polaris changed, what would go the other way — and writes nothing. It works
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
        const d = l.result.dryRun
        return {
          updates: a.updates + (d?.updates ?? 0),
          changedRows: a.changedRows + (d?.changedRows ?? 0),
          riskyChanges: a.riskyChanges + (d?.riskyChanges ?? 0),
          inserts: a.inserts + (d?.inserts ?? 0),
          errors: a.errors + l.result.errors,
          dateFixOnlyRows: a.dateFixOnlyRows + (d?.dateFixOnlyRows ?? 0),
          conflicts: a.conflicts + (d?.conflicts ?? 0),
          twinLinks: a.twinLinks + (d?.twinLinks.length ?? 0),
          testItems: a.testItems + (d?.testItems ?? 0),
          pushDirty: a.pushDirty + (d?.push.dirty ?? 0),
          pushBulkStamped: a.pushBulkStamped + (d?.push.bulkStamped ?? 0),
          pushPatch: a.pushPatch + (d?.push.patch ?? 0),
          pushCreate: a.pushCreate + (d?.push.create ?? 0),
          heldBack: a.heldBack + (d?.push.heldBack ?? 0),
          copySkips: a.copySkips + (d?.copySkips.length ?? 0),
          nearMisses: a.nearMisses + (d?.nearMisses.filter((n) => n.itemId).length ?? 0),
        }
      },
      {
        updates: 0, changedRows: 0, riskyChanges: 0, inserts: 0, errors: 0,
        dateFixOnlyRows: 0, conflicts: 0, twinLinks: 0, testItems: 0,
        pushDirty: 0, pushBulkStamped: 0, pushPatch: 0, pushCreate: 0, heldBack: 0,
        copySkips: 0, nearMisses: 0,
      },
    )
    // The SharePoint items staff need to correct by hand: items the old push
    // overwrote with another permit (Polaris still has the original), and copies of
    // another list's item that were never in Polaris at all.
    const fixList = lists.flatMap((l) => {
      const d = l.result.dryRun
      if (!d) return []
      return [
        ...d.conflictSamples.map((c) => ({
          list: l.list, itemId: c.itemId, holdsNow: c.sharepoint, shouldBe: c.polaris,
          note: c.copyOf ? `${c.reason}; same as ${c.copyOf}`
            : c.reason === 'vessel replaced' || c.reason === 'different vessel' ? `${c.reason} — check which vessel is right before changing SharePoint`
            : c.reason,
        })),
        ...d.copySkips.map((c) => ({
          list: l.list, itemId: c.itemId, holdsNow: c.holds,
          shouldBe: 'not known — the permit that was here was overwritten; re-key it from the file, or delete this item',
          note: `copy of ${c.copyOf}`,
        })),
      ]
    }).sort((a, b) => a.list.localeCompare(b.list) || Number(a.itemId) - Number(b.itemId))
    return json({ ok: true, dryRun: true, totals, lists, fixList })
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e).slice(0, 500) }, 500)
  }
}
