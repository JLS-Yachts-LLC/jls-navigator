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

// ─── DMA permits copied into the other lists ──────────────────────────────────
//
// The old push also POSTed each DMA Foreign Visitor Permit ("PRMT…" number) as a NEW
// item into every other permit list, and those items were pulled back into Polaris
// as Navigation Licenses, Tenders, Mothership permits, Gate Passes and Sanitation
// certificates. A PRMT number is one DMA permit, so a non-DMA permit carrying one is
// a copy — provided the real one is in Polaris as a DMA permit AND in the SharePoint
// DMA list. Each copy is removed from Polaris (backed up first) and from SharePoint.

export type DmaCopyAction = {
  key: string
  kind: 'remove' | 'person'
  /** The copy in Polaris (if any) and its SharePoint item (if any). */
  polarisId: string | null
  list: string | null
  itemId: string | null
  holds: string
  /** The real DMA permit it copies. */
  real: string | null
  why: string
}

async function _planDmaCopies(): Promise<{ actions: DmaCopyAction[]; token: string; siteOf: Map<string, string> }> {
  const { token, lists } = await loadPermitListsForRepair()
  const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const isPrmt = (n: string) => /^prmt\d{6,}$/.test(n)

  // Every Polaris permit carrying a PRMT number.
  const rows: Record<string, any>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (supabaseAdmin as any).from('permits')
      .select('id, permit_type, holder_name, permit_number, issue_date, document_url, created_by, sharepoint_list_name, sharepoint_item_id, yacht_id, yachts(vessel_name)')
      .ilike('permit_number', '%prmt%')
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(`read permits → ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const real = new Map<string, Record<string, any>[]>()
  for (const r of rows) if (r.permit_type === 'dma' && isPrmt(norm(r.permit_number))) {
    const k = norm(r.permit_number); real.set(k, [...(real.get(k) ?? []), r])
  }

  // PRMT numbers in the SharePoint DMA list, and every item of the other lists by id.
  const dma = lists.find((l) => l.permitType === 'dma')
  const spDma = new Set<string>()
  for (const i of dma?.items ?? []) { const n = permitItemSignature(i.fields ?? {}, dma!.fieldMapping).number; if (isPrmt(n)) spDma.add(n) }
  const others = lists.filter((l) => l.permitType !== 'dma')
  const itemOf = new Map<string, { list: (typeof lists)[number]; item: any }>()
  for (const l of others) for (const i of l.items) itemOf.set(`${l.listName}#${i.id}`, { list: l, item: i })

  const describeRealRow = (r: Record<string, any>) => [r.holder_name, String(r.permit_number ?? '').trim(), r.yachts?.vessel_name].filter(Boolean).join(' · ')
  const describeCopy = (r: Record<string, any>) => `${String(r.permit_type).replace(/_/g, ' ')}: ${describeRealRow(r)}`
  const actions: DmaCopyAction[] = []
  const handledItems = new Set<string>()

  // 1. Polaris copies (non-DMA rows with a PRMT number).
  for (const r of rows) {
    const n = norm(r.permit_number)
    if (r.permit_type === 'dma' || !isPrmt(n)) continue
    const twins = real.get(n) ?? []
    const list = r.sharepoint_item_id ? (r.sharepoint_list_name ?? null) : null
    const spKey = list ? `${list}#${r.sharepoint_item_id}` : null
    if (spKey) handledItems.add(spKey)
    const base = { polarisId: r.id, list, itemId: list ? String(r.sharepoint_item_id) : null, holds: describeCopy(r) }
    const person = (why: string) => actions.push({ key: `person|${r.id}`, kind: 'person', ...base, real: twins[0] ? describeRealRow(twins[0]) : null, why })
    if (!twins.length) { person('no DMA permit with this number in Polaris — check by hand'); continue }
    if (!spDma.has(n)) { person('the DMA permit is not in the SharePoint DMA list yet — check by hand'); continue }
    const vessel = (x: Record<string, any>) => norm(x.yachts?.vessel_name)
    if (vessel(r) && twins.every((t) => vessel(t) && vessel(t) !== vessel(r))) { person('same number, but the DMA permit is on a different vessel — check by hand'); continue }
    if (r.document_url && !twins.some((t) => t.document_url)) { person('has a document the DMA permit lacks — move it to the DMA permit first'); continue }
    // Its SharePoint item is removed with it, but only if it holds the same number.
    let spNote = ''
    if (spKey) {
      const it = itemOf.get(spKey)
      if (!it) { base.list = null; base.itemId = null; spNote = ' (its SharePoint item is already gone)' }
      else if (permitItemSignature(it.item.fields ?? {}, it.list.fieldMapping).number !== n) {
        base.list = null; base.itemId = null; spNote = ' (its SharePoint item now holds something else — left alone)'
      } else if (it.item.fields?.Attachments === true) {
        // The old push overwrote columns but never attachments: an item with a file is
        // that list's own permit with the DMA permit written over it. Repair, not delete.
        base.list = null; base.itemId = null; spNote = ' (its SharePoint item has an attachment — the original permit, left for Repair in SharePoint)'
      }
    }
    actions.push({
      key: `remove|${r.id}|${base.list ?? '-'}#${base.itemId ?? '-'}|${n}`, kind: 'remove', ...base, real: describeRealRow(twins[0]),
      why: `a copy of DMA permit ${String(twins[0].permit_number).trim()}${spNote}`,
    })
  }

  // 2. SharePoint copies no Polaris permit is linked to.
  const linkedKeys = new Set<string>()
  // Paged: PostgREST caps a request at 1,000 rows, and a missed link here would mean
  // deleting an item a Polaris permit still points at.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (supabaseAdmin as any).from('permits')
      .select('id, sharepoint_list_name, sharepoint_item_id, permit_type')
      .not('sharepoint_item_id', 'is', null).order('id').range(from, from + 999)
    if (error) throw new Error(`read links → ${error.message}`)
    for (const r of (data ?? []) as any[]) {
      const list = r.sharepoint_list_name ?? lists.find((l) => l.permitType === r.permit_type)?.listName
      if (list) linkedKeys.add(`${list}#${r.sharepoint_item_id}`)
    }
    if (!data || data.length < 1000) break
  }
  for (const [k, { list, item }] of itemOf) {
    if (handledItems.has(k) || linkedKeys.has(k)) continue
    const n = permitItemSignature(item.fields ?? {}, list.fieldMapping).number
    if (!isPrmt(n) || !spDma.has(n) || !real.has(n)) continue
    // An item with a file is an overwritten original (see above), never a copy to delete.
    if (item.fields?.Attachments === true) continue
    const f = item.fields ?? {}
    const col = (db: string) => Object.entries(list.fieldMapping).find(([, d]) => d === db)?.[0]
    const holds = [f[col('holder_name') ?? ''], f[col('permit_number') ?? ''], f[col('vessel_name') ?? '']].filter(Boolean).join(' · ')
    actions.push({
      key: `remove|-|${k}|${n}`, kind: 'remove', polarisId: null, list: list.listName, itemId: String(item.id),
      holds: `${list.listName}: ${holds}`, real: describeRealRow(real.get(n)![0]), why: 'a copy of a DMA permit; not in Polaris',
    })
  }

  // 3. A second item with the same PRMT number in the DMA list itself (the old push
  // re-POSTed DMA permits into their own list too). Removed only when another DMA item
  // with that number is linked to the DMA permit in Polaris, and nothing links to it.
  if (dma) {
    const linkedDmaItem = new Map<string, string>()
    for (const [n, rs] of real) for (const r of rs) {
      if (r.sharepoint_list_name === dma.listName && r.sharepoint_item_id) linkedDmaItem.set(n, String(r.sharepoint_item_id))
    }
    const dmaItemIds = new Set(dma.items.map((i: any) => String(i.id)))
    for (const i of dma.items) {
      const n = permitItemSignature(i.fields ?? {}, dma.fieldMapping).number
      const keep = linkedDmaItem.get(n)
      const k = `${dma.listName}#${i.id}`
      if (!isPrmt(n) || !keep || keep === String(i.id) || !dmaItemIds.has(keep) || linkedKeys.has(k)) continue
      if (i.fields?.Attachments === true) continue
      const f = i.fields ?? {}
      const col = (db: string) => Object.entries(dma.fieldMapping).find(([, d]) => d === db)?.[0]
      const holds = [f[col('holder_name') ?? ''], f[col('permit_number') ?? ''], f[col('vessel_name') ?? '']].filter(Boolean).join(' · ')
      actions.push({
        key: `remove|-|${k}|${n}`, kind: 'remove', polarisId: null, list: dma.listName, itemId: String(i.id),
        holds: `${dma.listName}: ${holds}`, real: describeRealRow(real.get(n)![0]), why: `a second DMA list item for this permit; the DMA permit is linked to item ${keep}`,
      })
    }
  }

  actions.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'remove' ? -1 : 1) || String(a.list).localeCompare(String(b.list)) || Number(a.itemId) - Number(b.itemId))
  return { actions, token, siteOf: new Map(lists.map((l) => [l.listName, l.siteId])) }
}

export async function planDmaCopyCleanup(): Promise<{ actions: DmaCopyAction[]; checkedAt: string }> {
  const { actions } = await _planDmaCopies()
  return { actions, checkedAt: new Date().toISOString() }
}

/**
 * Remove the previewed copies (by key), at most `max` per call. Every Polaris row is
 * saved to permit-documents/_backups/ before it is deleted; SharePoint items go to the
 * site recycle bin. SharePoint first, so the next pull has nothing to bring back.
 */
export async function applyDmaCopyCleanup(keys: string[], max = 40): Promise<{
  done: Array<{ key: string }>
  failed: Array<{ key: string; error: string }>
  skipped: number
  remaining: string[]
  backup: string | null
}> {
  const { actions, token, siteOf } = await _planDmaCopies()
  const current = new Map(actions.filter((a) => a.kind === 'remove').map((a) => [a.key, a]))
  const runnable = keys.filter((k) => current.has(k))
  const skipped = keys.length - runnable.length
  const batch = runnable.slice(0, max).map((k) => current.get(k)!)

  // Back up the Polaris rows of this batch, whole, before anything is deleted.
  const ids = batch.map((a) => a.polarisId).filter(Boolean) as string[]
  let backup: string | null = null
  if (ids.length) {
    const { data: full, error } = await (supabaseAdmin as any).from('permits').select('*').in('id', ids)
    if (error) throw new Error(`backup read → ${error.message}`)
    backup = `_backups/dma-copies-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const { error: upErr } = await supabaseAdmin.storage.from('permit-documents')
      // text/plain: the permit-documents bucket refuses application/json (the file is still JSON).
      .upload(backup, new Blob([JSON.stringify(full, null, 2)], { type: 'text/plain' }), { upsert: false, contentType: 'text/plain' })
    if (upErr) throw new Error(`backup write → ${upErr.message} — nothing deleted`)
  }

  const done: Array<{ key: string }> = []
  const failed: Array<{ key: string; error: string }> = []
  for (const a of batch) {
    try {
      if (a.list && a.itemId) {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${siteOf.get(a.list)}/lists/${encodeURIComponent(a.list)}/items/${a.itemId}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok && res.status !== 404) throw new Error(`DELETE ${a.list} ${a.itemId} → ${res.status} ${(await res.text()).slice(0, 200)}`)
      }
      if (a.polarisId) {
        const { error } = await (supabaseAdmin as any).from('permits').delete().eq('id', a.polarisId)
        if (error) throw new Error(`delete permit → ${error.message}`)
      }
      done.push({ key: a.key })
      console.log(`[permits-dma-copies] removed ${a.holds}${a.list ? ` (SharePoint ${a.list} ${a.itemId})` : ''}`)
    } catch (e) {
      failed.push({ key: a.key, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { done, failed, skipped, remaining: runnable.slice(max), backup }
}

// ─── PRMT census (read-only) ──────────────────────────────────────────────────
//
// Every SharePoint item and every Polaris permit carrying a DMA "PRMT…" number,
// grouped by number, so the clean-up can be planned per permit: which item in the
// DMA list is the real one, and every copy elsewhere with what its Polaris row holds
// (document, notes, emails). Reads only.

export type PrmtCensusEntry = {
  number: string
  items: Array<{
    list: string
    itemId: string
    holder: string
    vessel: string
    issue: string
    expiry: string
    attachments: boolean
    created: string | null
    modified: string | null
    /** The Polaris permit linked to this item, if any. */
    polaris: { id: string; type: string; document: string | null; notes: boolean; emailed: boolean; createdBy: boolean } | null
  }>
  /** Polaris permits with this number that no current SharePoint item is linked to. */
  unlinked: Array<{ id: string; type: string; list: string | null; itemId: string | null; document: string | null; emailed: boolean; createdBy: boolean }>
}

export async function prmtCensus(): Promise<{ numbers: PrmtCensusEntry[]; checkedAt: string }> {
  const { lists } = await loadPermitListsForRepair()
  const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const isPrmt = (n: string) => /^prmt\d{6,}$/.test(n)

  const rows: Record<string, any>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (supabaseAdmin as any).from('permits')
      .select('id, permit_type, permit_number, document_url, notes, email_sent_at, created_by, sharepoint_list_name, sharepoint_item_id')
      .ilike('permit_number', '%prmt%').order('id').range(from, from + 999)
    if (error) throw new Error(`read permits → ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const rowByItem = new Map<string, Record<string, any>>()
  for (const r of rows) if (r.sharepoint_list_name && r.sharepoint_item_id) rowByItem.set(`${r.sharepoint_list_name}#${r.sharepoint_item_id}`, r)

  const out = new Map<string, PrmtCensusEntry>()
  const entry = (n: string) => out.get(n) ?? out.set(n, { number: n.toUpperCase(), items: [], unlinked: [] }).get(n)!
  const seen = new Set<string>()
  const day = (v: unknown) => String(v ?? '').slice(0, 10)
  for (const l of lists) {
    const col = (db: string) => fieldOf(l.fieldMapping, db)
    for (const i of l.items) {
      const f = i.fields ?? {}
      const n = permitItemSignature(f, l.fieldMapping).number
      if (!isPrmt(n)) continue
      const k = `${l.listName}#${i.id}`
      const r = rowByItem.get(k)
      if (r) seen.add(String(r.id))
      entry(n).items.push({
        list: l.listName,
        itemId: String(i.id),
        holder: String(f[col('holder_name') ?? ''] ?? ''),
        vessel: String(f[col('vessel_name') ?? ''] ?? ''),
        issue: day(f[col('issue_date') ?? '']),
        expiry: day(f[col('expiry_date') ?? '']),
        attachments: f.Attachments === true,
        created: i.createdDateTime ?? null,
        modified: i.lastModifiedDateTime ?? null,
        polaris: r ? {
          id: String(r.id), type: String(r.permit_type), document: r.document_url ?? null,
          notes: !!String(r.notes ?? '').trim(), emailed: !!r.email_sent_at, createdBy: !!r.created_by,
        } : null,
      })
    }
  }
  for (const r of rows) {
    const n = norm(r.permit_number)
    if (!isPrmt(n) || seen.has(String(r.id))) continue
    entry(n).unlinked.push({
      id: String(r.id), type: String(r.permit_type), list: r.sharepoint_list_name ?? null, itemId: r.sharepoint_item_id ? String(r.sharepoint_item_id) : null,
      document: r.document_url ?? null, emailed: !!r.email_sent_at, createdBy: !!r.created_by,
    })
  }
  const numbers = [...out.values()].sort((a, b) => a.number.localeCompare(b.number))
  for (const e of numbers) e.items.sort((a, b) => a.list.localeCompare(b.list) || Number(a.itemId) - Number(b.itemId))
  return { numbers, checkedAt: new Date().toISOString() }
}
