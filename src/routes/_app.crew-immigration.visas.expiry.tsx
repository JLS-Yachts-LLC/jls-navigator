/**
 * Expiring UAE Visas — Ticket #185
 * Route: /crew-immigration/visas/expiry  (adapted from spec's /dashboard/visa/expiry)
 *
 * All crew with approved UAE visas expiring inside the selected window
 * (30 / 60 / 90 days), sorted most-urgent first. CSV export. Crew & Agency only.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { useAuth } from '@/lib/auth'
import { useColumnFilters, type FilterColumn } from '@/components/ui/column-filter'
import { triggerBlobDownload } from '@/lib/visa/documentExport'

export const Route = createFileRoute('/_app/crew-immigration/visas/expiry')({
  component: VisaExpiryReportPage,
  head: () => ({ meta: [{ title: 'Expiring UAE Visas — Polaris' }] }),
})

// The real expiry column is `visa_expiry`; the flag system (migration 038) is not
// deployed to this project, so urgency is derived from days-to-expiry here.
interface ExpiryRow {
  id: string
  visa_expiry: string | null
  vessel_name: string | null
  crew_members: { full_name: string | null } | null
  yachts: { vessel_name: string | null } | null
}

const WINDOWS = [30, 60, 90]

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

function VisaExpiryReportPage() {
  const { session } = useAuth()
  const token = session?.access_token ?? ''
  const [rows, setRows] = useState<ExpiryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(90)

  useEffect(() => {
    if (!token) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, days])

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/visa/reports/expiry?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load expiry report')
      setRows(data.expiring ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load expiry report')
    } finally {
      setLoading(false)
    }
  }

  // Excel-style sort + value filter on each column title. Dates filter by month.
  const columns = useMemo<FilterColumn<ExpiryRow>[]>(() => [
    { key: 'crew', label: 'Crew member', value: (r) => r.crew_members?.full_name },
    { key: 'vessel', label: 'Vessel', value: (r) => r.yachts?.vessel_name ?? r.vessel_name },
    { key: 'expiry', label: 'Expiry', value: (r) => r.visa_expiry?.slice(0, 7), sortValue: (r) => r.visa_expiry },
    { key: 'left', label: 'Days left', value: (r) => daysLeft(r.visa_expiry), sortValue: (r) => r.visa_expiry },
  ], [])
  const cf = useColumnFilters(rows, columns)

  async function exportFile(format: 'csv' | 'pdf') {
    if (format === 'csv') {
      // Exactly what's on screen: column filters and sort included.
      const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
      const out = [['Crew member', 'Vessel', 'Expiry date', 'Days left'],
        ...cf.rows.map((r) => [r.crew_members?.full_name ?? '', r.yachts?.vessel_name ?? r.vessel_name ?? '', r.visa_expiry ?? '', daysLeft(r.visa_expiry)])]
      triggerBlobDownload(new Blob([out.map((l) => l.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'uae-visa-expiry.csv')
      return
    }
    const res = await fetch(`/api/visa/reports/expiry?days=${days}&format=${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `uae-visa-expiry.${format}`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const btn = (active: boolean): React.CSSProperties => ({
    background: active ? COLORS.signal : COLORS.void,
    border: `1px solid ${active ? COLORS.signal : 'var(--border)'}`,
    borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
    fontFamily: FONTS.display, fontSize: 13, fontWeight: 600,
    color: active ? COLORS.void : COLORS.muted,
  })
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
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.frost, margin: 0 }}>Expiring UAE Visas</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {WINDOWS.map((w) => (
            <button key={w} onClick={() => setDays(w)} style={btn(days === w)}>{w}d</button>
          ))}
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            {cf.rows.length !== rows.length ? `${cf.rows.length} of ${rows.length}` : rows.length} record{rows.length !== 1 ? 's' : ''}
          </span>
          <button onClick={() => exportFile('csv')} style={{ ...btn(false), color: COLORS.signal }}>Export CSV</button>
          <button onClick={() => exportFile('pdf')} style={{ ...btn(false), color: COLORS.signal }}>Export PDF</button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: `${COLORS.warn}14`, border: `1px solid ${COLORS.warn}40`, fontSize: 12, color: COLORS.warn }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: COLORS.muted, fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: COLORS.muted, fontSize: 13 }}>No UAE visas expiring within {days} days.</div>
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
                <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: COLORS.muted }}>
                  No visas match the column filters · <button onClick={cf.clearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.signal, textDecoration: 'underline' }}>Clear column filters</button>
                </td></tr>
              )}
              {cf.rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.crew_members?.full_name ?? '—'}</td>
                  <td style={td}>{r.yachts?.vessel_name ?? r.vessel_name ?? '—'}</td>
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
