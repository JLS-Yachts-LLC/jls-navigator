const EVENT_TYPES = ['', 'AUTH', 'PERM', 'DATA', 'EXPORT', 'SEC', 'ADMIN', 'SYSTEM']
const RESULTS     = ['', 'success', 'blocked', 'pending', 'failed']

export interface AuditFilterState {
  event_type: string
  result:     string
  actor:      string
  from:       string
  to:         string
}

interface Props {
  filters:  AuditFilterState
  onChange: (f: AuditFilterState) => void
}

export function AuditFilters({ filters, onChange }: Props) {
  function set(key: keyof AuditFilterState, value: string) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-white/[0.05]">
      <select
        value={filters.event_type}
        onChange={e => set('event_type', e.target.value)}
        className="rounded-md border border-white/10 bg-input px-2.5 py-1.5
                   text-[11px] text-white focus:outline-none"
      >
        {EVENT_TYPES.map(t => (
          <option key={t} value={t}>{t || 'All types'}</option>
        ))}
      </select>

      <select
        value={filters.result}
        onChange={e => set('result', e.target.value)}
        className="rounded-md border border-white/10 bg-input px-2.5 py-1.5
                   text-[11px] text-white focus:outline-none"
      >
        {RESULTS.map(r => (
          <option key={r} value={r}>{r || 'All results'}</option>
        ))}
      </select>

      <input
        placeholder="Filter by actor email…"
        value={filters.actor}
        onChange={e => set('actor', e.target.value)}
        className="rounded-md border border-white/10 bg-input px-2.5 py-1.5
                   text-[11px] text-white placeholder:text-white/25
                   focus:outline-none focus:ring-1 focus:ring-cyan-500/30 w-44"
      />

      <input
        type="date"
        value={filters.from}
        onChange={e => set('from', e.target.value)}
        className="rounded-md border border-white/10 bg-input px-2.5 py-1.5
                   text-[11px] text-white focus:outline-none"
      />

      <span className="text-[10px] text-white/25">→</span>

      <input
        type="date"
        value={filters.to}
        onChange={e => set('to', e.target.value)}
        className="rounded-md border border-white/10 bg-input px-2.5 py-1.5
                   text-[11px] text-white focus:outline-none"
      />
    </div>
  )
}
