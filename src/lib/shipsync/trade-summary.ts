/**
 * ShipSync — what the Import/Transit and Export boards hold, summarised for the Dashboard, the Routing board and the charts.
 *
 * A Monday-linked shipment's own `status` can lag the board (hundreds of Import shipments Monday calls Completed still read
 * "in office" here), so "not yet delivered" is decided the way the Import board's own Pending / Delivered / Complete lists are:
 * by Monday's group when there is one, and only otherwise by the status the app recorded.
 */
import type { ShipSyncPackage } from './model'

export type TradeRow = Pick<ShipSyncPackage, 'id' | 'status' | 'local_import' | 'num_packages' | 'boat_name' | 'barcode' | 'received_at' | 'extra'> & {
  eta?: string | null
  etd?: string | null
}

const mondayOf = (p: TradeRow): Record<string, string> => ((p.extra as any)?.monday ?? {}) as Record<string, string>
const groupOf = (p: TradeRow) => String((p.extra as any)?.monday_group_title ?? '').trim().toLowerCase()
const mondayStatusOf = (p: TradeRow) => String(mondayOf(p).STATUS ?? '').trim().toLowerCase()

export type Progress = 'pending' | 'delivered' | 'cancelled'

export function isCancelled(p: TradeRow): boolean {
  const g = groupOf(p)
  return g === 'cancelled' || g === 'canceled' || /cancel/.test(mondayStatusOf(p))
}

/** Finished: Monday's Delivered / Completed groups, or — with no group — a delivered or completed status. */
export function isFinished(p: TradeRow): boolean {
  const g = groupOf(p)
  if (g) return g === 'completed' || g === 'complete' || g.startsWith('delivered')
  return ['delivered', 'delivered_tbi', 'collected', 'completed'].includes(p.status)
}

export const progressOf = (p: TradeRow): Progress => (isCancelled(p) ? 'cancelled' : isFinished(p) ? 'delivered' : 'pending')

export type TradeKind = 'Import' | 'Transit'

/** Transit when tagged so, sitting in Monday's TRANSIT group, or typed "Transit Shipment"; everything else on that board is Import. */
export function tradeKind(p: TradeRow): TradeKind {
  if (p.local_import === 'Transit' || groupOf(p) === 'transit' || /transit/i.test(mondayOf(p)['Shipment Type'] ?? '')) return 'Transit'
  return 'Import'
}

const qtyOf = (p: TradeRow) => p.num_packages ?? 1

export interface Tally { shipments: number; qty: number }
const empty = (): Tally => ({ shipments: 0, qty: 0 })
const add = (t: Tally, p: TradeRow) => { t.shipments += 1; t.qty += qtyOf(p) }

export interface TradeTotals {
  Import: { pending: Tally; delivered: Tally }
  Transit: { pending: Tally; delivered: Tally }
}

/** Import and Transit shipments, split into not yet delivered and delivered (cancelled ones are left out). */
export function tradeTotals(rows: TradeRow[]): TradeTotals {
  const out: TradeTotals = { Import: { pending: empty(), delivered: empty() }, Transit: { pending: empty(), delivered: empty() } }
  for (const p of rows) {
    const progress = progressOf(p)
    if (progress === 'cancelled') continue
    add(out[tradeKind(p)][progress], p)
  }
  return out
}

/** A shipment's air waybill: the barcode on the Import board, Monday's own AWB column on the Export board (where the barcode is the quotation number). */
export function awbOf(p: TradeRow, board: 'import' | 'export'): string {
  return board === 'import' ? (p.barcode ?? '') : (mondayOf(p)['Air WayBill/Tracking Number'] ?? '')
}

/** Earliest date first; shipments with none go last, newest-received first among themselves. */
function byDate(a: { date: string | null; received: string }, b: { date: string | null; received: string }): number {
  if (a.date && b.date) return a.date.localeCompare(b.date)
  if (a.date) return -1
  if (b.date) return 1
  return b.received.localeCompare(a.received)
}

export interface IncomingRow { id: string; client: string; kind: TradeKind; awb: string; eta: string | null; status: string }

/** Import and Transit shipments not yet delivered, soonest ETA first — the "incoming" list. */
export function incomingShipments(rows: TradeRow[]): IncomingRow[] {
  return rows
    .filter((p) => progressOf(p) === 'pending')
    .map((p) => ({
      id: p.id, client: (p.boat_name ?? '').trim() || '—', kind: tradeKind(p), awb: awbOf(p, 'import'), eta: p.eta ?? null,
      status: mondayOf(p).STATUS ?? '', received: p.received_at ?? '',
    }))
    .sort((a, b) => byDate({ date: a.eta, received: a.received }, { date: b.eta, received: b.received }))
    .map(({ received: _r, ...rest }) => rest)
}

/** Not yet arrived: Monday's status is "Incoming". Once a shipment is in the Warehouse or the Office it has arrived. */
export const isIncomingStatus = (status: string | null | undefined) => /^incoming$/i.test((status ?? '').trim())

/** The shipments still on their way here — the "Incoming" list on the Overview and the Dashboard. */
export function arrivingShipments(rows: TradeRow[]): IncomingRow[] {
  return incomingShipments(rows).filter((r) => isIncomingStatus(r.status))
}

export interface ExportTotals { total: number; open: number; completed: number; qty: number; openQty: number }

/** Export shipments: all of them (cancelled ones aside), and how many are still open or already completed. */
export function exportTotals(rows: TradeRow[]): ExportTotals {
  const out: ExportTotals = { total: 0, open: 0, completed: 0, qty: 0, openQty: 0 }
  for (const p of rows) {
    const progress = progressOf(p)
    if (progress === 'cancelled') continue
    out.total += 1
    out.qty += qtyOf(p)
    if (progress === 'pending') { out.open += 1; out.openQty += qtyOf(p) } else out.completed += 1
  }
  return out
}

export interface UpcomingExport { id: string; client: string; awb: string; etd: string | null; status: string }

/** Export shipments still open, soonest ETD first. */
export function upcomingExports(rows: TradeRow[]): UpcomingExport[] {
  return rows
    .filter((p) => progressOf(p) === 'pending')
    .map((p) => ({
      id: p.id, client: (p.boat_name ?? '').trim() || '—', awb: awbOf(p, 'export'), etd: p.etd ?? null,
      status: mondayOf(p).STATUS ?? '', received: p.received_at ?? '',
    }))
    .sort((a, b) => byDate({ date: a.etd, received: a.received }, { date: b.etd, received: b.received }))
    .map(({ received: _r, ...rest }) => rest)
}

/**
 * Can the Routing board plan this one? In the office or the warehouse, on no delivery note, not stock in the warehouse module.
 * Local parcels go as they are. Import and Transit ones only while Monday doesn't say they are finished or cancelled — their
 * own status can still read "in office" long after delivery. Export and EDAS shipments leave by freight, not on a van.
 */
export function isRoutable(p: TradeRow & { delivery_note_id?: string | null }): boolean {
  if (p.delivery_note_id) return false
  if ((p.extra as { warehouse_ref?: string } | null)?.warehouse_ref) return false
  if (p.status !== 'in_office' && p.status !== 'in_storage') return false
  const trade = p.local_import
  if (!trade || trade === 'Local') return true
  if (trade === 'Import' || trade === 'Transit') return progressOf(p) === 'pending'
  return false
}
