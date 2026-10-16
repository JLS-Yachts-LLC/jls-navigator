/**
 * ShipSync charts — the time axis for the Daily / Weekly / Monthly views.
 *
 * Every period is a fixed window ending today so the axis doesn't jump about, with empty days, weeks and months shown as zero
 * rather than skipped. Dates are read in the viewer's own time zone, as the rest of the boards do.
 */
export type Period = 'daily' | 'weekly' | 'monthly'

export const PERIODS: { key: Period; label: string; window: string }[] = [
  { key: 'daily', label: 'Daily', window: 'last 30 days' },
  { key: 'weekly', label: 'Weekly', window: 'last 12 weeks' },
  { key: 'monthly', label: 'Monthly', window: 'last 12 months' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Monday of the week containing `d`. */
function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7))
  return out
}

/** The bucket a moment falls in: the day, the Monday of its week, or its month. */
export function bucketKey(period: Period, d: Date): string {
  if (period === 'daily') return ymd(d)
  if (period === 'weekly') return ymd(weekStart(d))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** Every bucket in the window, oldest first. */
export function bucketRange(period: Period, now: Date): string[] {
  const keys: string[] = []
  if (period === 'daily') {
    for (let i = 29; i >= 0; i--) keys.push(ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)))
  } else if (period === 'weekly') {
    const start = weekStart(now)
    for (let i = 11; i >= 0; i--) keys.push(ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() - i * 7)))
  } else {
    for (let i = 11; i >= 0; i--) keys.push(bucketKey('monthly', new Date(now.getFullYear(), now.getMonth() - i, 1)))
  }
  return keys
}

export function bucketLabel(period: Period, key: string): string {
  if (period === 'monthly') {
    const [y, m] = key.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  }
  const [y, m, d] = key.split('-').map(Number)
  const label = new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return period === 'weekly' ? `w/c ${label}` : label
}

export interface SeriesRow { received_at: string | null; boat_name: string | null; num_packages: number | null }

/**
 * Quantity per bucket, split by client. `names` are the clients shown (anyone else is added to "Other" when it is among the
 * names); rows with no received date, or outside the window, are left out.
 */
export function timeSeries(
  rows: SeriesRow[], period: Period, now: Date, names: string[],
): Record<string, number | string>[] {
  const keys = bucketRange(period, now)
  const byKey = new Map<string, Record<string, number>>(keys.map((k) => [k, {}]))
  const shown = new Set(names)
  for (const p of rows) {
    if (!p.received_at) continue
    const when = new Date(p.received_at)
    if (Number.isNaN(when.getTime())) continue
    const bucket = byKey.get(bucketKey(period, when))
    if (!bucket) continue
    const boat = p.boat_name?.trim() || 'Unassigned'
    const name = shown.has(boat) ? boat : 'Other'
    bucket[name] = (bucket[name] ?? 0) + (p.num_packages ?? 1)
  }
  return keys.map((k) => ({ label: bucketLabel(period, k), ...byKey.get(k)! }))
}
