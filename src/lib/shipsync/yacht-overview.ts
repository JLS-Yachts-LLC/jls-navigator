/**
 * ShipSync Overview — the yachts themselves being shipped, from the Yacht Shipments board (a Monday mirror, table yacht_shipments).
 *
 * Both directions share one set of columns. The single date is the ETA on an import and the loading date (ETD) on an export:
 * the sync stores either in `eta`. Shipments that are complete or cancelled are not "coming up", so they are left out.
 */
export interface YachtShipmentRow {
  direction: string | null
  yacht_name: string | null
  loa: string | null
  pol: string | null
  arrival_port: string | null
  eta: string | null
  status: string | null
}

export interface YachtOverviewRow {
  client: string
  loa: string
  pol: string
  pod: string
  /** ETA for an import, ETD (loading date) for an export. */
  date: string | null
  status: string
}

/** Some rows carry Monday's internal status key ("new_lead") rather than its label ("New Lead"): show the label. */
const prettyStatus = (s: string) => (/^[a-z0-9_]+$/.test(s) ? s.split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : s)

/** Complete or cancelled shipments are done with. */
export const isFinishedYachtStatus = (status: string | null | undefined) => /complete|done|cancel/i.test(status ?? '')

/** The not-yet-finished shipments of one direction, soonest date first and those with no date last. */
export function yachtOverviewRows(rows: YachtShipmentRow[], direction: 'import' | 'export'): YachtOverviewRow[] {
  return rows
    .filter((r) => (r.direction ?? 'import') === direction && !isFinishedYachtStatus(r.status))
    .map((r) => ({
      client: (r.yacht_name ?? '').trim() || '—',
      loa: (r.loa ?? '').trim(),
      pol: (r.pol ?? '').trim(),
      pod: (r.arrival_port ?? '').trim(),
      date: r.eta ?? null,
      status: prettyStatus((r.status ?? '').trim()),
    }))
    .sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date) || a.client.localeCompare(b.client)
      if (a.date) return -1
      if (b.date) return 1
      return a.client.localeCompare(b.client)
    })
}
