import { AuditRow } from './AuditRow'
import { AuditFilters, type AuditFilterState } from './AuditFilters'
import { AuditExportButton } from './AuditExportButton'
import type { AuditEvent } from '@/lib/admin/types'

interface Props {
  events:         AuditEvent[]
  total:          number
  filters:        AuditFilterState
  onFilterChange: (f: AuditFilterState) => void
}

export function AuditTable({ events, total, filters, onFilterChange }: Props) {
  return (
    <div>
      <AuditFilters filters={filters} onChange={onFilterChange} />

      <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr className="bg-muted text-white/35 text-[9px] font-semibold tracking-wider">
            <th className="text-left px-3 py-2 w-28">Timestamp</th>
            <th className="text-left px-3 py-2 w-16">Type</th>
            <th className="text-left px-3 py-2 w-36">Actor</th>
            <th className="text-left px-3 py-2">Detail</th>
            <th className="text-left px-3 py-2 w-24">IP</th>
            <th className="text-left px-3 py-2 w-16">Result</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-[11px] text-white/25">
                No audit events match the current filters.
              </td>
            </tr>
          ) : (
            events.map(e => <AuditRow key={e.id} event={e} />)
          )}
        </tbody>
      </table>

      <div className="flex items-center justify-between px-3 py-2 border-t border-white/[0.05]">
        <span className="text-[10px] text-white/25">{total.toLocaleString()} events</span>
        <AuditExportButton filters={filters} />
      </div>
    </div>
  )
}
