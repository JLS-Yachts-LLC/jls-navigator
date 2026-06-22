/**
 * VisaAdminActionPanel — Ticket #183
 *
 * Back-office panel for a single visa application. Shows status + expiry flag,
 * status-transition buttons, request-amendment, and record-renewal. Calls the
 * Phase-3 API routes with the caller's bearer token.
 *
 * Adapted to the app's inline-token style + bearer-auth fetch pattern.
 */

import { useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { ExpiryFlagBadge } from './ExpiryFlagBadge'

const GREEN = '#1D9E75'
const RED = '#E0524F'

interface Props {
  applicationId: string
  currentStatus: string
  visaRenewed: boolean
  expiryFlagsSent: Record<string, string | null> | null
  visaExpiryDate: string | null
  authToken: string
  onActionComplete: () => void
}

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted', in_review: 'In Review', approved: 'Approved',
  rejected: 'Rejected', amendment_required: 'Amendment Required',
  draft: 'Draft', pending_docs: 'Pending Docs', cancelled: 'Cancelled', expired: 'Expired',
}

const NEXT_ACTIONS: Record<string, { label: string; status: string; color: string }[]> = {
  submitted:          [{ label: 'Begin Review', status: 'in_review', color: COLORS.signal }],
  in_review:          [
    { label: 'Approve', status: 'approved', color: GREEN },
    { label: 'Reject', status: 'rejected', color: RED },
    { label: 'Request Amendment', status: 'amendment_required', color: COLORS.leoAmber },
  ],
  amendment_required: [{ label: 'Resume Review', status: 'in_review', color: COLORS.signal }],
}

export function VisaAdminActionPanel({
  applicationId, currentStatus, visaRenewed, expiryFlagsSent, visaExpiryDate, authToken, onActionComplete,
}: Props) {
  const [note, setNote] = useState('')
  const [amendReason, setAmendReason] = useState('')
  const [renewalIssue, setRenewalIssue] = useState('')
  const [renewalExpiry, setRenewalExpiry] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }
  const nextActions = NEXT_ACTIONS[currentStatus] ?? []

  async function call(path: string, method: string, body: unknown) {
    setLoading(true); setError(null)
    try {
      const res = await fetch(path, { method, headers, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      onActionComplete()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
      return false
    } finally {
      setLoading(false)
    }
  }

  async function handleStatus(status: string) {
    if (status === 'amendment_required') {
      if (!amendReason.trim()) { setError('Enter an amendment reason first.'); return }
      const ok = await call(`/api/visa/applications/${applicationId}/amendment`, 'POST', { reason: amendReason.trim() })
      if (ok) setAmendReason('')
      return
    }
    const ok = await call(`/api/visa/applications/${applicationId}/status`, 'PATCH', { status, note: note.trim() || undefined })
    if (ok) setNote('')
  }

  async function handleRenewal() {
    if (!renewalIssue || !renewalExpiry) { setError('Both new issue and expiry dates are required.'); return }
    const ok = await call(`/api/visa/applications/${applicationId}/renewal`, 'POST', {
      new_visa_issue_date: renewalIssue, new_visa_expiry_date: renewalExpiry,
    })
    if (ok) { setRenewalIssue(''); setRenewalExpiry('') }
  }

  const card: React.CSSProperties = {
    background: COLORS.abyss, border: `1px solid var(--border)`, borderRadius: 12,
    padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONTS.display,
  }
  const lbl: React.CSSProperties = { fontSize: 11, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600 }
  const field: React.CSSProperties = {
    width: '100%', background: COLORS.void, border: `1px solid var(--border)`, borderRadius: 8,
    padding: '8px 10px', fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost,
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={lbl}>Status</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.frost }}>
            {STATUS_LABELS[currentStatus] ?? currentStatus}
          </span>
          <ExpiryFlagBadge visaRenewed={visaRenewed} expiryFlagsSent={expiryFlagsSent} />
        </div>
      </div>

      {visaExpiryDate && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: COLORS.muted }}>Visa expiry</span>
          <span style={{ color: COLORS.frost, fontWeight: 600 }}>{visaExpiryDate}</span>
        </div>
      )}

      {nextActions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={lbl}>Note (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="Visible in the action history…" style={{ ...field, resize: 'none' }} />
        </div>
      )}

      {currentStatus === 'in_review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={lbl}>Amendment reason</span>
          <textarea value={amendReason} onChange={(e) => setAmendReason(e.target.value)} rows={2}
            placeholder="Required to request an amendment…" style={{ ...field, resize: 'none' }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {nextActions.map((a) => (
          <button key={a.status} onClick={() => handleStatus(a.status)} disabled={loading}
            style={{
              width: '100%', padding: '10px 16px', borderRadius: 8, border: 'none',
              background: a.color, color: '#fff', fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.55 : 1,
            }}>
            {a.label}
          </button>
        ))}
      </div>

      {currentStatus === 'approved' && !visaRenewed && (
        <div style={{ borderTop: `1px solid var(--border)`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={lbl}>Record renewal</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>New issue date</div>
              <input type="date" value={renewalIssue} onChange={(e) => setRenewalIssue(e.target.value)} style={field} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>New expiry date</div>
              <input type="date" value={renewalExpiry} onChange={(e) => setRenewalExpiry(e.target.value)} style={field} />
            </div>
          </div>
          <button onClick={handleRenewal} disabled={loading}
            style={{
              width: '100%', padding: '10px 16px', borderRadius: 8, border: 'none', background: GREEN, color: '#fff',
              fontFamily: FONTS.display, fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.55 : 1,
            }}>
            Record Renewal
          </button>
        </div>
      )}

      {visaRenewed && (
        <div style={{ borderTop: `1px solid var(--border)`, paddingTop: 12, fontSize: 12, color: GREEN, fontWeight: 600 }}>
          Visa renewed — expiry flags cleared
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: RED, border: `1px solid ${RED}55`, background: `${RED}14`, borderRadius: 8, padding: '8px 10px' }}>
          {error}
        </div>
      )}
    </div>
  )
}
