/**
 * Repair the SharePoint permit lists the old (pre-3 Sept) push polluted.
 *
 * Until 3 Sept every edited permit was written into item <id> of ALL seven permit
 * lists, so the same permit now sits at the same item number in several lists. The
 * sync leaves those items alone (see _permitIdentityConflict / _permitCopyChecker);
 * this job puts them right. For each item that holds another list's permit:
 *
 *   - restore — a Polaris permit is linked to this item and differs from what it
 *     holds. Polaris still has the original, so it is written back (the regular
 *     push, with empty columns blanked).
 *   - delete  — nothing in Polaris is linked to it, and its home item holds
 *     everything it does. The item is deleted; SharePoint keeps it in the site
 *     recycle bin for 93 days.
 *   - person  — anything that cannot be decided safely, listed for staff.
 *
 * Safety rule: an item is only restored or deleted when the permit it holds now
 * also sits, verified, in its HOME list — the list where a Polaris permit linked to
 * that item matches it, or for a DMA "PRMT…" permit the DMA Permits list. "The same
 * permit" means the same holder, vessel and date (or the same number and holder):
 * a shared name is not enough, because one person — or a JLS agent like "Leneve" —
 * holds many permits of different kinds on the same vessel.
 *
 * planPermitRepairs() reads only. applyPermitRepairs() re-plans and carries out only
 * the actions the caller previewed (matched by key), in small batches.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import {
  loadPermitListsForRepair,
  permitItemSignature,
  polarisPermitSignature,
  pushRecordToSharePoint,
} from '@/lib/sharepoint-sync.server'

export type PermitRepairAction = {
  /** Stable id of this exact action: kind, list, item and the permit it holds now. */
  key: string
  kind: 'restore' | 'delete' | 'person'
  list: string
  itemId: string
  /** What the item holds now. */
  holds: string
  /** Where that permit really lives ("DMA Permits item 33"), when known. */
  home: string | null
  /** For a restore: the Polaris permit written back, and what it reads. */
  polarisId?: string
  restoreTo?: string
  why: string
}

/** What identifies a permit here: holder, vessel, number (normalised) and issue date. */
type Sig = { vessel: string; holder: string; number: string; date: string }

const fieldOf = (mapping: Record<string, string>, db: string) => Object.entries(mapping).find(([, d]) => d === db)?.[0]
const isoDay = (v: unknown) => { const d = String(v ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '' }
/** Within a day: SharePoint dates read back a day off until the 15 Sept fix. */
const dayClose = (a: string, b: string) => !!a && !!b && Math.abs(Date.parse(a) - Date.parse(b)) <= 86_400_000

function itemSig(fields: Record<string, any>, mapping: Record<string, string>): Sig {
  const get = (db: string) => { const c = fieldOf(mapping, db); return c ? fields[c] : null }
  return { ...permitItemSignature(fields, mapping), date: isoDay(get('issue_date') ?? get('expiry_date')) }
}
const rowSig = (r: Record<string, any>): Sig =>
  ({ ...polarisPermitSignature(r, r.yachts?.vessel_name), date: isoDay(r.issue_date ?? r.expiry_date) })

/** The same permit's details: same holder, vessel and date — or the same number and holder. */
function sameContent(a: Sig, b: Sig): boolean {
  if (a.holder && a.holder === b.holder && a.vessel && a.vessel === b.vessel && dayClose(a.date, b.date)) return true
  return !!a.number && a.number === b.number && !!a.holder && a.holder === b.holder
}

/** Safe to delete `a` because `b` holds everything it does — its own permit number too? */
function holdsNothingMore(a: Sig, b: Sig): boolean {
  return sameContent(a, b) && (!a.number || a.number === b.number)
}

/** Does the Polaris permit linked to an item match what the item holds? */
function ownMatch(row: Sig, item: Sig): boolean {
  if (row.number && item.number && row.number !== item.number) return false
  if (row.vessel && item.vessel && row.vessel !== item.vessel) return false
  if (row.holder && item.holder) return row.holder === item.holder || row.holder.includes(item.holder) || item.holder.includes(row.holder)
  return !!row.number && row.number === item.number
}

function describeItem(fields: Record<string, any>, mapping: Record<string, string>): string {
  const get = (db: string) => { const c = fieldOf(mapping, db); return c ? fields[c] : null }
  const date = String(get('issue_date') ?? get('expiry_date') ?? '').slice(0, 10)
  return [get('holder_name'), get('permit_number'), get('vessel_name'), date].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ') || '(empty)'
}

function describeRow(r: Record<string, any>): string {
  return [r.holder_name, r.permit_number, r.yachts?.vessel_name, String(r.issue_date ?? r.expiry_date ?? '').slice(0, 10)]
    .map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ') || '(empty)'
}

const sigKey = (s: Sig) => `${s.vessel}|${s.holder}|${s.number}|${s.date}`

export async function planPermitRepairs(): Promise<{ actions: PermitRepairAction[]; checkedAt: string }> {
  const { actions } = await _plan()
  return { actions, checkedAt: new Date().toISOString() }
}

async function _plan(): Promise<{ actions: PermitRepairAction[]; token: string; siteOf: Map<string, string> }> {
  const { token, lists } = await loadPermitListsForRepair()

  // Polaris permits linked to a SharePoint item, keyed by list + item.
  const rows: Record<string, any>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (supabaseAdmin as any).from('permits')
      .select('id, permit_type, holder_name, permit_number, issue_date, expiry_date, sharepoint_list_name, sharepoint_item_id, yachts(vessel_name)')
      .not('sharepoint_item_id', 'is', null)
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(`read permits → ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const listByType = new Map(lists.map((l) => [l.permitType, l.listName]))
  const linked = new Map<string, Record<string, any>>()
  for (const r of rows) {
    const list = r.sharepoint_list_name ?? listByType.get(r.permit_type) ?? null
    if (list) linked.set(`${list}#${r.sharepoint_item_id}`, r)
  }

  // Every item's signature, per list.
  const sigs = new Map<string, Map<string, { sig: Sig; fields: Record<string, any> }>>()
  for (const l of lists) {
    const m = new Map<string, { sig: Sig; fields: Record<string, any> }>()
    for (const i of l.items) m.set(String(i.id), { sig: itemSig(i.fields ?? {}, l.fieldMapping), fields: i.fields ?? {} })
    sigs.set(l.listName, m)
  }
  const dmaList = lists.find((l) => l.permitType === 'dma')?.listName ?? null
  const isPrmt = (s: Sig | undefined) => !!s?.number.startsWith('prmt')

  /** Does this list's item <id> verifiably hold its OWN permit (the Polaris one linked to it)? */
  const holdsOwn = (list: string, id: string): boolean => {
    const it = sigs.get(list)?.get(id)
    const row = linked.get(`${list}#${id}`)
    return !!it && !!row && ownMatch(rowSig(row), it.sig)
  }

  const actions: PermitRepairAction[] = []
  for (const l of lists) {
    for (const [id, it] of sigs.get(l.listName)!) {
      if (holdsOwn(l.listName, id)) continue
      const row = linked.get(`${l.listName}#${id}`) ?? null
      const holds = describeItem(it.fields, l.fieldMapping)
      const person = (why: string) => actions.push({
        key: `person|${l.listName}|${id}|${sigKey(it.sig)}`, kind: 'person', list: l.listName, itemId: id, holds, home: null,
        ...(row ? { polarisId: row.id, restoreTo: describeRow(row) } : {}), why,
      })
      // A DMA "PRMT…" permit in the DMA list is in its own list.
      if (l.listName === dmaList && isPrmt(it.sig)) {
        if (row) person('holds a different DMA permit from the one Polaris has linked — check by hand')
        continue
      }
      // Lists whose item <id> holds this same permit.
      const sameIn = lists.filter((o) => {
        if (o.listName === l.listName) return false
        const other = sigs.get(o.listName)?.get(id)
        return !!other && sameContent(it.sig, other.sig)
      }).map((o) => o.listName)
      if (!sameIn.length) {
        // Not a cross-list copy. Linked but different = overwritten by something we
        // can't trace, so it may exist nowhere else: a person decides.
        if (row) person('holds a different permit from Polaris, and no other list has it — check by hand')
        continue
      }
      // Where does it really live? Verified by Polaris, else the DMA list for a DMA permit.
      let homes = sameIn.filter((o) => holdsOwn(o, id))
      if (!homes.length && dmaList && sameIn.includes(dmaList) && isPrmt(sigs.get(dmaList)?.get(id)?.sig)) homes = [dmaList]
      if (homes.length !== 1) {
        person(`same details as ${sameIn.map((o) => `${o} item ${id}`).join(', ')}, but which list it belongs to can't be told — check by hand`)
        continue
      }
      const home = `${homes[0]} item ${id}`
      if (row) {
        actions.push({
          key: `restore|${l.listName}|${id}|${sigKey(it.sig)}|${row.id}`, kind: 'restore', list: l.listName, itemId: id, holds, home,
          polarisId: row.id, restoreTo: describeRow(row),
          why: `holds a copy of ${home}; Polaris still has this item's own permit`,
        })
      } else if (holdsNothingMore(it.sig, sigs.get(homes[0])!.get(id)!.sig)) {
        actions.push({
          key: `delete|${l.listName}|${id}|${sigKey(it.sig)}`, kind: 'delete', list: l.listName, itemId: id, holds, home,
          why: `a copy of ${home}; nothing in Polaris is linked to it`,
        })
      } else {
        person(`same holder, vessel and date as ${home}, but its own permit number differs — check by hand`)
      }
    }
  }
  const order = { restore: 0, delete: 1, person: 2 }
  actions.sort((a, b) => order[a.kind] - order[b.kind] || a.list.localeCompare(b.list) || Number(a.itemId) - Number(b.itemId))
  return { actions, token, siteOf: new Map(lists.map((l) => [l.listName, l.siteId])) }
}

/**
 * Carry out the previewed actions whose keys are given, at most `max` per call (the
 * Worker's subrequest budget). Re-plans first, so an item that changed since the
 * preview no longer matches its key and is skipped, not written.
 */
export async function applyPermitRepairs(keys: string[], max = 25): Promise<{
  done: Array<{ key: string; kind: string; list: string; itemId: string }>
  failed: Array<{ key: string; error: string }>
  skipped: number
  remaining: string[]
}> {
  const wanted = new Set(keys)
  const { actions, token, siteOf } = await _plan()
  const current = new Map(actions.filter((a) => a.kind !== 'person').map((a) => [a.key, a]))
  const runnable = keys.filter((k) => current.has(k))
  const skipped = [...wanted].filter((k) => !current.has(k)).length
  const batch = runnable.slice(0, max)

  const done: Array<{ key: string; kind: string; list: string; itemId: string }> = []
  const failed: Array<{ key: string; error: string }> = []
  for (const key of batch) {
    const a = current.get(key)!
    try {
      if (a.kind === 'delete') {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${siteOf.get(a.list)}/lists/${encodeURIComponent(a.list)}/items/${a.itemId}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok && res.status !== 404) throw new Error(`DELETE → ${res.status} ${(await res.text()).slice(0, 200)}`)
      } else {
        await pushRecordToSharePoint('permits', a.polarisId!, { create: false, clearEmpty: true })
      }
      done.push({ key, kind: a.kind, list: a.list, itemId: a.itemId })
      console.log(`[permits-sp-repair] ${a.kind} ${a.list} item ${a.itemId} (held: ${a.holds})`)
    } catch (e) {
      failed.push({ key, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { done, failed, skipped, remaining: runnable.slice(max) }
}
