/**
 * UAE Visa Pipeline — Ticket #184
 * Route: /crew-immigration/visas/pipeline  (adapted from spec's /dashboard/visa/pipeline)
 *
 * All UAE visa applications across all vessels. Crew & Agency team only (the
 * /api/visa/reports/pipeline route enforces crew_immigration access). Filter by
 * status / expiry band; CSV export. Read + action only — no delete.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { useAuth } from '@/lib/auth'

export const Route = createFileRoute('/_app/crew-immigration/visas/pipeline')({
  component: VisaPipelinePage,
  head: () => ({ meta: [{ title: 'UAE Visa Pipeline — Polaris' }] }),
})

// Real columns: `visa_expiry` / `visa_issuance_date`. The flag system (migration
// 038) is not deployed to this project, so urgency is days-to-expiry derived.
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

  const select: React.CSSProperties = {
    background: COLORS.void, border: `1px solid var(--border)`, borderRadius: 8,
    padding: '7px 10px', fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost,
  }
  const th: React.CSSProperties = {
    textAlign: 'left', fontFamily: FONTS.display, fontSize: 10, fontWeight: 700,
    letterSpacing: '0.14em', textTransform: 'uppercase', color: COLORS.steel,
    padding: '8px 12px', borderBottom: `1px solid var(--border)`,
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
        {(status || expiry) && (
          <button onClick={() => { setStatus(''); setExpiry('') }} style={{ ...select, cursor: 'pointer', color: COLORS.muted }}>
            Clear filters
          </button>
        )}
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
        <div style={{ overflowX: 'auto', background: COLORS.abyss, border: `1px solid var(--border)`, borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Crew member</th><th style={th}>Vessel</th><th style={th}>Status</th>
                <th style={th}>Expiry</th><th style={th}>Days left</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
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
