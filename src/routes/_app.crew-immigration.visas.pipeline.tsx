/**
 * UAE Visa Pipeline — Ticket #184
 * Route: /crew-immigration/visas/pipeline  (adapted from spec's /dashboard/visa/pipeline)
 *
 * All UAE visa applications across all vessels. Crew & Agency team only (the
 * /api/visa/reports/pipeline route enforces crew_immigration access). Filter by
 * status / expiry band; CSV export. Read + action only — no delete.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { useAuth } from '@/lib/auth'
import { useColumnFilters, type FilterColumn } from '@/components/ui/column-filter'
import { triggerBlobDownload } from '@/lib/visa/documentExport'

export const Route = createFileRoute('/_app/crew-immigration/visas/pipeline')({
  component: VisaPipelinePage,
  head: () => ({ meta: [{ title: 'UAE Visa Pipeline — Polaris' }] }),
})

// Real columns: `visa_expiry` / `visa_issuance_date`. The expiry-flag system
// (migrations 038/039) is deployed; this list shows days-to-expiry for an at-a-glance
// view, while the flag engine drives working-day thresholds + notifications.
interface PipelineRow {
  id: string
  status: string
  visa_issuance_date: string | null
  visa_expiry: string | null
  vessel_name: string | null
  crew_members: { full_name: string | null } | null
  yachts: { vessel_name: string | null } | null
}

/** dd/mm/yyyy — immigration display format. */
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const date = new Date(d.length <= 10 ? d + 'T00:00:00' : d)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function daysLeft(expiry: string | null): string {
  if (!expiry) return '—'
  const exp = new Date(expiry + 'T00:00:00').getTime()
  const base = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00').getTime()
  const d = Math.round((exp - base) / 86_400_000)
  return Number.isNaN(d) ? '—' : d < 0 ? `${-d}d overdue` : `${d}d`
}

const STATUSES = ['', 'submitted', 'in_review', 'approved', 'rejected', 'amendment_required']
const EXPIRY_BANDS = [
  { value: '', label: 'Any expiry' },
  { value: '30d', label: '30 days' },
  { value: '10wd', label: '10 working days' },
  { value: '5wd', label: '5 working days' },
]

function VisaPipelinePage() {
  const { session } = useAuth()
  const token = session?.access_token ?? ''
  const [rows, setRows] = useState<PipelineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [expiry, setExpiry] = useState('')

  function queryString() {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (expiry) p.set('expiry', expiry)
    return p.toString()
  }

  useEffect(() => {
    if (!token) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status, expiry])

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/visa/reports/pipeline?${queryString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load pipeline')
      setRows(data.applications ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pipeline')
    } finally {
      setLoading(false)
    }
  }

  async function exportFile(format: 'csv' | 'pdf') {
    if (format === 'csv') {
      // Exactly what's on screen: column filters and sort included.
      const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
      const out = [['Crew member', 'Vessel', 'Status', 'Issue date', 'Expiry date', 'Days left'],
        ...cf.rows.map((r) => [r.crew_members?.full_name ?? '', r.yachts?.vessel_name ?? r.vessel_name ?? '', r.status,
          r.visa_issuance_date ?? '', r.visa_expiry ?? '', daysLeft(r.visa_expiry)])]
      triggerBlobDownload(new Blob([out.map((l) => l.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'uae-visa-pipeline.csv')
      return
    }
    const res = await fetch(`/api/visa/reports/pipeline?format=${format}&${queryString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `uae-visa-pipeline.${format}`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const STATUS_LABEL: Record<string, string> = {
    submitted: 'Submitted', in_review: 'In Review', approved: 'Approved',
    rejected: 'Rejected', amendment_required: 'Amendment Required',
    draft: 'Draft', pending_docs: 'Pending Docs', cancelled: 'Cancelled', expired: 'Expired',
  }

  // Excel-style sort + value filter on each column title. Dates filter by month.
  const columns = useMemo<FilterColumn<PipelineRow>[]>(() => [
    { key: 'crew', label: 'Crew member', value: (r) => r.crew_members?.full_name },
    { key: 'vessel', label: 'Vessel', value: (r) => r.yachts?.vessel_name ?? r.vessel_name },
    { key: 'status', label: 'Status', value: (r) => STATUS_LABEL[r.status] ?? r.status },
    { key: 'expiry', label: 'Expiry', value: (r) => r.visa_expiry?.slice(0, 7), sortValue: (r) => r.visa_expiry },
    { key: 'left', label: 'Days left', value: (r) => daysLeft(r.visa_expiry), sortValue: (r) => r.visa_expiry },
  ], []) // eslint-disable-line react-hooks/exhaustive-deps
  const cf = useColumnFilters(rows, columns)

  const select: React.CSSProperties = {
    background: COLORS.void, border: `1px solid var(--border)`, borderRadius: 8,
    padding: '7px 10px', fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost,
  }
  // Header row stays in view while the page scrolls; solid background so rows don't show through.
  const th: React.CSSProperties = {
    textAlign: 'left', fontFamily: FONTS.display, fontSize: 10, fontWeight: 700,
    letterSpacing: '0.14em', textTransform: 'uppercase', color: COLORS.steel,
    padding: '8px 12px', position: 'sticky', top: 0, zIndex: 10, background: COLORS.abyss,
    boxShadow: 'inset 0 -1px 0 0 var(--border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost, padding: '10px 12px',
    borderBottom: `1px solid var(--border)`,
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px', fontFamily: FONTS.display }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.frost, margin: 0 }}>UAE Visa Pipeline</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => exportFile('csv')} style={{ ...select, cursor: 'pointer', color: COLORS.signal, fontWeight: 600 }}>
            Export CSV
          </button>
          <button onClick={() => exportFile('pdf')} style={{ ...select, cursor: 'pointer', color: COLORS.signal, fontWeight: 600 }}>
            Export PDF
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={select}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? STATUS_LABEL[s] : 'All statuses'}</option>)}
        </select>
        <select value={expiry} onChange={(e) => setExpiry(e.target.value)} style={select}>
          {EXPIRY_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        {(status || expiry || cf.activeCount > 0) && (
          <button onClick={() => { setStatus(''); setExpiry(''); cf.clearAll() }} style={{ ...select, cursor: 'pointer', color: COLORS.muted }}>
            Clear filters
          </button>
        )}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: COLORS.muted }}>
          {cf.rows.length !== rows.length ? `${cf.rows.length} of ${rows.length}` : rows.length} record{rows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: `${COLORS.warn}14`, border: `1px solid ${COLORS.warn}40`, fontSize: 12, color: COLORS.warn }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: COLORS.muted, fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: COLORS.muted, fontSize: 13 }}>No applications match these filters.</div>
      ) : (
        // No overflow wrapper: it would stop the header row sticking.
        <div style={{ background: COLORS.abyss, border: `1px solid var(--border)`, borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {columns.map((c) => <th key={c.key} style={th}>{cf.header(c.key)}</th>)}
              </tr>
            </thead>
            <tbody>
              {cf.rows.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: COLORS.muted }}>
                  No applications match the column filters · <button onClick={cf.clearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.signal, textDecoration: 'underline' }}>Clear column filters</button>
                </td></tr>
              )}
              {cf.rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.crew_members?.full_name ?? '—'}</td>
                  <td style={td}>{r.yachts?.vessel_name ?? r.vessel_name ?? '—'}</td>
                  <td style={td}>{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td style={td}>{fmtDate(r.visa_expiry)}</td>
                  <td style={td}>{daysLeft(r.visa_expiry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
