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
 *   - delete  — nothing in Polaris is linked to it. The item is deleted; SharePoint
 *     keeps it in the site recycle bin for 93 days.
 *   - person  — anything that cannot be decided safely, listed for staff.
 *
 * Safety rule: an item is only restored or deleted when the permit it holds now
 * also sits, verified, in its HOME list — the list where a Polaris permit linked to
 * that item matches it, or for a DMA "PRMT…" number the DMA Permits list. So nothing
 * that exists only in this item is ever lost.
 *
 * planPermitRepairs() reads only. applyPermitRepairs() re-plans and carries out only
 * the actions the caller previewed (matched by key), in small batches.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import {
  loadPermitListsForRepair,
  permitItemSignature,
  permitSigsMatch,
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

type Sig = { vessel: string; holder: string; number: string }

const fieldOf = (mapping: Record<string, string>, db: string) => Object.entries(mapping).find(([, d]) => d === db)?.[0]

function describeItem(fields: Record<string, any>, mapping: Record<string, string>): string {
  const get = (db: string) => { const c = fieldOf(mapping, db); return c ? fields[c] : null }
  const date = String(get('issue_date') ?? get('expiry_date') ?? '').slice(0, 10)
  return [get('holder_name'), get('permit_number'), get('vessel_name'), date].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ') || '(empty)'
}

function describeRow(r: Record<string, any>): string {
  return [r.holder_name, r.permit_number, r.yachts?.vessel_name, String(r.issue_date ?? r.expiry_date ?? '').slice(0, 10)]
    .map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ') || '(empty)'
}

const sigKey = (s: Sig) => `${s.vessel}|${s.holder}|${s.number}`

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
  const rowSig = (r: Record<string, any>): Sig => polarisPermitSignature(r, r.yachts?.vessel_name)

  // Every item's signature, per list.
  const sigs = new Map<string, Map<string, { sig: Sig; fields: Record<string, any> }>>()
  for (const l of lists) {
    const m = new Map<string, { sig: Sig; fields: Record<string, any> }>()
    for (const i of l.items) m.set(String(i.id), { sig: permitItemSignature(i.fields ?? {}, l.fieldMapping), fields: i.fields ?? {} })
    sigs.set(l.listName, m)
  }
  const dmaList = lists.find((l) => l.permitType === 'dma')?.listName ?? null

  /** Does this list's item <id> verifiably hold its OWN permit? */
  const holdsOwn = (list: string, id: string): boolean => {
    const it = sigs.get(list)?.get(id)
    const row = linked.get(`${list}#${id}`)
    return !!it && !!row && permitSigsMatch(rowSig(row), it.sig)
  }

  const actions: PermitRepairAction[] = []
  for (const l of lists) {
    for (const [id, it] of sigs.get(l.listName)!) {
      if (holdsOwn(l.listName, id)) continue
      const row = linked.get(`${l.listName}#${id}`) ?? null
      // Lists whose item <id> holds the same permit as this one.
      const sameIn = lists.filter((o) => {
        if (o.listName === l.listName) return false
        const other = sigs.get(o.listName)?.get(id)
        return !!other && permitSigsMatch(it.sig, other.sig)
      }).map((o) => o.listName)
      if (!sameIn.length) {
        // Not a cross-list copy. Linked but different = overwritten by something we
        // cannot trace, so it may exist nowhere else: a person decides.
        if (row) {
          actions.push({
            key: `person|${l.listName}|${id}|${sigKey(it.sig)}`, kind: 'person', list: l.listName, itemId: id,
            holds: describeItem(it.fields, l.fieldMapping), home: null, polarisId: row.id, restoreTo: describeRow(row),
            why: 'holds a different permit from Polaris, and no other list has it — check by hand',
          })
        }
        continue
      }
      // Where does this permit really live? Verified by Polaris, else DMA for a PRMT number.
      let homes = sameIn.filter((o) => holdsOwn(o, id))
      if (!homes.length && dmaList && it.sig.number.startsWith('prmt') && sameIn.includes(dmaList)) homes = [dmaList]
      if (!homes.length && dmaList && l.listName === dmaList && it.sig.number.startsWith('prmt')) continue // this IS the home
      const holds = describeItem(it.fields, l.fieldMapping)
      if (homes.length !== 1) {
        actions.push({
          key: `person|${l.listName}|${id}|${sigKey(it.sig)}`, kind: 'person', list: l.listName, itemId: id, holds,
          home: null, ...(row ? { polarisId: row.id, restoreTo: describeRow(row) } : {}),
          why: `same permit as ${sameIn.map((o) => `${o} item ${id}`).join(', ')}, but which list it belongs to can't be told — check by hand`,
        })
        continue
      }
      const home = `${homes[0]} item ${id}`
      if (row) {
        actions.push({
          key: `restore|${l.listName}|${id}|${sigKey(it.sig)}|${row.id}`, kind: 'restore', list: l.listName, itemId: id, holds, home,
          polarisId: row.id, restoreTo: describeRow(row),
          why: `holds a copy of ${home}; Polaris still has this item's own permit`,
        })
      } else {
        actions.push({
          key: `delete|${l.listName}|${id}|${sigKey(it.sig)}`, kind: 'delete', list: l.listName, itemId: id, holds, home,
          why: `a copy of ${home}; nothing in Polaris is linked to it`,
        })
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
