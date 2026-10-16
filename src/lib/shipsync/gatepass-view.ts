/**
 * ShipSync Gate Pass board — what to show from the rows the Monday sync stored. The board's columns and groups are discovered at
 * sync time (extra.monday_columns, extra.monday_group_order), so nothing here knows a column by name except "Name".
 */
import type { ShipSyncPackage } from './model'

export const NAME_COLUMN = 'Name'

const extraOf = (p: ShipSyncPackage): Record<string, any> => (p.extra as any) ?? {}
const mondayOf = (p: ShipSyncPackage): Record<string, string> => extraOf(p).monday ?? {}
export const gatePassName = (p: ShipSyncPackage) => String(extraOf(p).monday_item_name ?? p.barcode ?? '')

/** One cell's text: the item name for the Name column, otherwise what Monday has for that column title. */
export function gatePassCell(p: ShipSyncPackage, column: string): string {
  return column === NAME_COLUMN ? gatePassName(p) : (mondayOf(p)[column] ?? '')
}

/** Every text on the row, lower-cased, for the search box. */
export const gatePassSearchText = (p: ShipSyncPackage) => [gatePassName(p), ...Object.values(mondayOf(p))].join(' ').toLowerCase()

/**
 * The columns to show, in Monday's order: the board's own list (stored on each row at sync time), without any column that is
 * empty on every row (Subitems, a linked-board Mirror). Name is always first.
 */
export function gatePassColumns(rows: ShipSyncPackage[]): string[] {
  const ordered: string[] = []
  for (const p of rows) for (const c of (extraOf(p).monday_columns ?? []) as string[]) if (c && !ordered.includes(c)) ordered.push(c)
  // A row with no recorded column list (never synced) still shows what it has.
  for (const p of rows) for (const c of Object.keys(mondayOf(p))) if (!ordered.includes(c)) ordered.push(c)
  const withName = [NAME_COLUMN, ...ordered.filter((c) => c !== NAME_COLUMN)]
  return withName.filter((c) => c === NAME_COLUMN || rows.some((p) => gatePassCell(p, c).trim() !== ''))
}

/** Rows grouped as Monday groups them, in Monday's order; anything with no group last. */
export function gatePassGroups(rows: ShipSyncPackage[]): { title: string; rows: ShipSyncPackage[] }[] {
  const order: string[] = []
  for (const p of rows) for (const g of (extraOf(p).monday_group_order ?? []) as string[]) if (g && !order.includes(g)) order.push(g)
  const byTitle = new Map<string, ShipSyncPackage[]>()
  for (const p of rows) {
    const title = String(extraOf(p).monday_group_title ?? '').trim() || 'Not on Monday'
    if (!byTitle.has(title)) byTitle.set(title, [])
    byTitle.get(title)!.push(p)
  }
  const rank = (t: string) => { const i = order.indexOf(t); return i === -1 ? Number.MAX_SAFE_INTEGER : i }
  return [...byTitle.entries()].map(([title, r]) => ({ title, rows: r })).sort((a, b) => rank(a.title) - rank(b.title) || a.title.localeCompare(b.title))
}
