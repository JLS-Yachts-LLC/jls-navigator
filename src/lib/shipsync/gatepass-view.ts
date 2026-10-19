/**
 * ShipSync Gate Pass board — what to show from the stored rows, and how an edit made on the board is written back to a row.
 *
 * The board's columns and groups were discovered from Monday (extra.monday_columns, extra.monday_group_order), so nothing here
 * knows a column by name except the item-name column: Monday's first column, which holds the item's own name (the gate pass
 * reference number) rather than a value in extra.monday. Its title is whatever the board calls it (extra.monday_name_column;
 * rows synced before that was recorded fall back to the first column).
 */
import type { ShipSyncPackage } from './model'

/** What the item-name column is called when nothing says otherwise. */
export const DEFAULT_NAME_COLUMN = 'Gate Pass Reference Number'

const extraOf = (p: ShipSyncPackage): Record<string, any> => (p.extra as any) ?? {}
const mondayOf = (p: ShipSyncPackage): Record<string, string> => extraOf(p).monday ?? {}
export const gatePassName = (p: ShipSyncPackage) => String(extraOf(p).monday_item_name ?? p.barcode ?? '')

/** The title of the column that holds the item's own name (the reference number). */
export function gatePassNameColumn(rows: ShipSyncPackage[]): string {
  for (const p of rows) { const t = extraOf(p).monday_name_column; if (t) return String(t) }
  for (const p of rows) { const first = (extraOf(p).monday_columns ?? [])[0]; if (first) return String(first) }
  return DEFAULT_NAME_COLUMN
}

/** One cell's text: the item name for the item-name column, otherwise what the row has for that column title. */
export function gatePassCell(p: ShipSyncPackage, column: string, nameColumn: string): string {
  return column === nameColumn ? gatePassName(p) : (mondayOf(p)[column] ?? '')
}

/** Every text on the row, lower-cased, for the search box. */
export const gatePassSearchText = (p: ShipSyncPackage) => [gatePassName(p), ...Object.values(mondayOf(p))].join(' ').toLowerCase()

/** Monday-only column types that hold nothing you can type into; left out unless a row actually has something in them. */
const SYSTEM_COLUMN = /^(subitems|mirror)$/i

/**
 * The columns to show, in Monday's order: the board's own list (stored on each row at sync time), item-name column first. Every
 * column shows even when it is empty everywhere, so it can be filled in here — except Monday's Subitems / Mirror.
 */
export function gatePassColumns(rows: ShipSyncPackage[]): string[] {
  const nameColumn = gatePassNameColumn(rows)
  const ordered: string[] = []
  for (const p of rows) for (const c of (extraOf(p).monday_columns ?? []) as string[]) if (c && !ordered.includes(c)) ordered.push(c)
  // A column a row holds but no row's list has (synced before the column existed) still shows.
  for (const p of rows) for (const c of Object.keys(mondayOf(p))) if (!ordered.includes(c)) ordered.push(c)
  const withName = [nameColumn, ...ordered.filter((c) => c !== nameColumn)]
  return withName.filter((c) => !SYSTEM_COLUMN.test(c) || rows.some((p) => gatePassCell(p, c, nameColumn).trim() !== ''))
}

/** A column whose values are dates (Gate Pass Date, Date Requested, Invoice Date) — edited with a date picker. */
export const isDateColumn = (column: string) => /\bdate\b/i.test(column)

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

export function pick(row: Record<string, string>, ...keywords: string[]): string | null {
  const entries = Object.entries(row)
  for (const kw of keywords) {
    const hit = entries.find(([title]) => title.toLowerCase().includes(kw))
    if (hit && hit[1]) return hit[1]
  }
  return null
}

function toDate(v: string | null): string | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** The few things lifted from the columns onto the row's own, for searching, the client filter and the date filter. Everything
 *  else is read straight from extra.monday. */
export function deriveFields(row: Record<string, string>, itemName: string): Record<string, unknown> {
  return {
    barcode: itemName,
    boat_name: (pick(row, 'client', 'yacht', 'vessel', 'boat') ?? null)?.toUpperCase() ?? null,
    received_at: toDate(pick(row, 'issue date', 'date')),
  }
}

/**
 * The patch for typing `value` into one cell: the item-name column sets the item name, any other column its value in
 * extra.monday, and the lifted fields follow. extra.edited_at marks the row as changed here, so the Monday sync never prunes it.
 */
export function gatePassEdit(p: ShipSyncPackage, column: string, nameColumn: string, value: string): Partial<ShipSyncPackage> {
  const extra = extraOf(p)
  const monday = { ...mondayOf(p) }
  let itemName = gatePassName(p)
  if (column === nameColumn) itemName = value
  else if (value === '') delete monday[column]
  else monday[column] = value
  return {
    ...deriveFields(monday, itemName),
    extra: { ...extra, monday_item_name: itemName, monday, edited_at: new Date().toISOString() },
  } as Partial<ShipSyncPackage>
}

/** A new, empty gate pass in `group`, carrying the board's column list so it shows the same columns as every other row. */
export function newGatePass(rows: ShipSyncPackage[], group: string, reference: string): Partial<ShipSyncPackage> {
  const sample = rows.find((p) => (extraOf(p).monday_columns ?? []).length > 0)
  const se = sample ? extraOf(sample) : {}
  const now = new Date().toISOString()
  return {
    barcode: reference || null,
    num_packages: 1,
    local_import: 'Gate Pass',
    status: 'completed',
    received_at: null,
    extra: {
      monday_item_name: reference,
      monday_name_column: gatePassNameColumn(rows),
      monday_columns: se.monday_columns ?? [DEFAULT_NAME_COLUMN],
      monday_group_order: se.monday_group_order ?? [group],
      monday_group_title: group,
      monday: {},
      created_here_at: now,
      edited_at: now,
    },
  } as unknown as Partial<ShipSyncPackage>
}
