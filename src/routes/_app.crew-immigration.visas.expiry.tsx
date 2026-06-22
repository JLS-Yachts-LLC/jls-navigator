/**
 * Expiring UAE Visas — Ticket #185
 * Route: /crew-immigration/visas/expiry  (adapted from spec's /dashboard/visa/expiry)
 *
 * All crew with approved UAE visas expiring inside the selected window
 * (30 / 60 / 90 days), sorted most-urgent first. CSV export. Crew & Agency only.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { useAuth } from '@/lib/auth'
import { ExpiryFlagBadge } from '@/components/visa/ExpiryFlagBadge'

export const Route = createFileRoute('/_app/crew-immigration/visas/expiry')({
  component: VisaExpiryReportPage,
  head: () => ({ meta: [{ title: 'Expiring UAE Visas — Polaris' }] }),
})

interface ExpiryRow {
  id: string
  visa_expiry_date: string | null
  visa_renewed: boolean
  expiry_flags_sent: Record<string, string | null> | null
  vessel_name: string | null
  crew_members: { full_name: string | null } | null
  yachts: { vessel_name: string | null } | null
}

const WINDOWS = [30, 60, 90]

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

  async function exportCsv() {
    const res = await fetch(`/api/visa/reports/expiry?days=${days}&format=csv`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'uae-visa-expiry.csv'
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
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.frost, margin: 0 }}>Expiring UAE Visas</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {WINDOWS.map((w) => (
            <button key={w} onClick={() => setDays(w)} style={btn(days === w)}>{w}d</button>
          ))}
          <button onClick={exportCsv} style={{ ...btn(false), color: COLORS.signal }}>Export CSV</button>
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
        <div style={{ overflowX: 'auto', background: COLORS.abyss, border: `1px solid var(--border)`, borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Crew member</th><th style={th}>Vessel</th><th style={th}>Expiry</th><th style={th}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.crew_members?.full_name ?? '—'}</td>
                  <td style={td}>{r.yachts?.vessel_name ?? r.vessel_name ?? '—'}</td>
                  <td style={td}>{r.visa_expiry_date ?? '—'}</td>
                  <td style={td}><ExpiryFlagBadge visaRenewed={r.visa_renewed} expiryFlagsSent={r.expiry_flags_sent} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
