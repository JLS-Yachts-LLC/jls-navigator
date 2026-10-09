import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { downloadVisaExport, emailVisaExport } from '@/lib/visa/export-client'

// A visa row as loaded by VisaDashboard (subset we need here).
type Row = {
  id: string
  yacht_id: string | null
  status: string
  given_name: string | null
  surname: string | null
  nationality: string | null
  passport_number: string | null
  visa_number: string | null
  visa_issuance_date: string | null
  visa_expiry: string | null
  sign_on_date: string | null
  sign_off_date: string | null
  submitted_at: string | null
  created_at: string
  yachts?: { vessel_name: string } | null
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', pending_docs: 'Pending Docs', submitted: 'Submitted', in_review: 'In Review',
  processing: 'Processing', approved: 'Approved', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled',
}
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const name = (r: Row) => `${r.given_name ?? ''} ${r.surname ?? ''}`.trim() || '—'
const effDate = (r: Row) => r.submitted_at ?? r.visa_issuance_date ?? r.created_at

export function VisaReportView({ applications, vessels, onClose }: {
  applications: Row[]
  vessels: [string, string][]
  onClose: () => void
}) {
  const { user } = useAuth()
  const [tab, setTab] = useState<'immigration' | 'visa'>('immigration')
  const [vessel, setVessel] = useState('all')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [emailing, setEmailing] = useState(false)

  const vesselName = (id: string | null) => vessels.find(v => v[0] === id)?.[1] ?? 'Unassigned'

  const filtered = useMemo(() => applications.filter(r => {
    if (vessel !== 'all' && r.yacht_id !== vessel) return false
    if (status !== 'all' && r.status !== status) return false
    const d = (effDate(r) ?? '').slice(0, 10)
    if (from && d && d < from) return false
    if (to && d && d > to) return false
    return true
  }), [applications, vessel, status, from, to])

  const summary = useMemo(() => {
    const g: Record<string, { vessel: string; total: number; approved: number; cancelled: number; rejected: number }> = {}
    for (const r of filtered) {
      const k = r.yacht_id ?? 'unknown'
      if (!g[k]) g[k] = { vessel: r.yachts?.vessel_name ?? vesselName(r.yacht_id), total: 0, approved: 0, cancelled: 0, rejected: 0 }
      g[k].total++
      if (r.status === 'approved' || r.status === 'completed') g[k].approved++
      else if (r.status === 'cancelled') g[k].cancelled++
      else if (r.status === 'rejected') g[k].rejected++
    }
    return Object.entries(g).map(([id, v]) => ({ id, ...v })).sort((a, b) => a.vessel.localeCompare(b.vessel))
  }, [filtered, vessels])

  const totals = useMemo(() => ({
    total: filtered.length,
    approved: filtered.filter(r => r.status === 'approved' || r.status === 'completed').length,
    cancelled: filtered.filter(r => r.status === 'cancelled').length,
    rejected: filtered.filter(r => r.status === 'rejected').length,
  }), [filtered])

  function exportCsv() {
    const headers = ['Vessel', 'Given Name', 'Surname', 'Nationality', 'Passport No.', 'Visa Ref', 'Visa Issuance', 'Visa Expiry', 'Sign On', 'Sign Off', 'Status']
    const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    const lines = [headers.join(','), ...filtered.map(r => [
      r.yachts?.vessel_name ?? vesselName(r.yacht_id), r.given_name ?? '', r.surname ?? '', r.nationality ?? '',
      r.passport_number ?? '', r.visa_number ?? '', fmt(r.visa_issuance_date), fmt(r.visa_expiry),
      fmt(r.sign_on_date), fmt(r.sign_off_date), STATUS_LABEL[r.status] ?? r.status,
    ].map(x => esc(String(x))).join(','))]
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `Visa-Report-${vessel === 'all' ? 'All' : vesselName(vessel)}.csv`.replace(/[^a-zA-Z0-9.\-]/g, '-'); a.click()
  }

  async function emailVessel(yachtId: string) {
    if (!user?.email) { toast.error('No email on your account'); return }
    setEmailing(true)
    try {
      const j = await emailVisaExport(yachtId)
      if (j.ok) toast.success(`Emailed to ${user.email}`); else toast.error(`Email failed: ${j.error}`)
    } catch (e: any) { toast.error(e.message) } finally { setEmailing(false) }
  }

  const statuses = useMemo(() => [...new Set(applications.map(a => a.status))].sort(), [applications])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border/70 bg-card/80 px-6 py-3 backdrop-blur">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Crew & Immigration</div>
          <h1 className="mt-0.5 font-display text-[1.15rem] font-semibold">Visa &amp; Immigration Reports</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border/60 text-xs">
            <button onClick={() => setTab('immigration')} className={cn('px-3 py-1.5 font-medium transition', tab === 'immigration' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground')}>Immigration Summary</button>
            <button onClick={() => setTab('visa')} className={cn('px-3 py-1.5 font-medium transition', tab === 'visa' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground')}>Visa Detail</button>
          </div>
          <button onClick={onClose} className="rounded-md border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Close ✕</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-muted/10 px-6 py-2.5 text-xs">
        <select value={vessel} onChange={e => setVessel(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2">
          <option value="all">All Vessels</option>
          {vessels.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2">
          <option value="all">All Status</option>
          {statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-muted-foreground">From <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2" /></label>
        <label className="flex items-center gap-1.5 text-muted-foreground">To <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2" /></label>
        <span className="ml-auto font-medium text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        <button onClick={exportCsv} disabled={!filtered.length} className="h-8 rounded-md border border-border px-3 font-medium hover:bg-accent/40 disabled:opacity-50">⬇ Export CSV</button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab === 'immigration' ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: 'Total', v: totals.total, c: 'text-foreground' },
                { label: 'Approved / Completed', v: totals.approved, c: 'text-emerald-400' },
                { label: 'Cancelled', v: totals.cancelled, c: 'text-slate-400' },
                { label: 'Rejected / Denied', v: totals.rejected, c: 'text-red-400' },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-border bg-card/60 p-4 text-center">
                  <div className={cn('font-display text-2xl font-bold', s.c)}>{s.v}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground/80">Vessel</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground/80">Total</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-emerald-400/80">Approved</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-slate-400/80">Cancelled</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-red-400/80">Rejected/Denied</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground/80">Export</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-muted-foreground/50">No data for these filters</td></tr>
                  ) : summary.map((g, i) => (
                    <tr key={g.id} className={cn('border-b border-border/40', i % 2 ? 'bg-muted/10' : '')}>
                      <td className="px-4 py-2.5 font-medium">{g.vessel}</td>
                      <td className="px-3 py-2.5 text-center font-bold">{g.total}</td>
                      <td className="px-3 py-2.5 text-center font-semibold text-emerald-400">{g.approved}</td>
                      <td className="px-3 py-2.5 text-center font-semibold text-slate-400">{g.cancelled}</td>
                      <td className="px-3 py-2.5 text-center font-semibold text-red-400">{g.rejected}</td>
                      <td className="px-4 py-2">
                        {g.id !== 'unknown' && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => downloadVisaExport(`/api/visa/export?yacht_id=${g.id}&format=pdf`).catch((e) => toast.error(e.message))} className="rounded bg-muted/40 px-2 py-1 text-[10.5px] font-medium hover:bg-muted/70">PDF</button>
                            <button onClick={() => emailVessel(g.id)} disabled={emailing} className="rounded bg-primary/10 px-2 py-1 text-[10.5px] font-medium text-primary hover:bg-primary/20">{emailing ? '…' : 'Email'}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-muted/30">
                <tr>{['Vessel', 'Given Name', 'Surname', 'Nationality', 'Passport No.', 'Visa Ref', 'Visa Issuance', 'Visa Expiry', 'Sign On', 'Sign Off', 'Status'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground/80 whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="py-10 text-center text-muted-foreground/50">No records match the filters</td></tr>
                ) : filtered.map((r, i) => (
                  <tr key={r.id} className={cn('border-b border-border/40', i % 2 ? 'bg-muted/10' : '')}>
                    <td className="px-3 py-2 font-medium">{r.yachts?.vessel_name ?? vesselName(r.yacht_id)}</td>
                    <td className="px-3 py-2">{r.given_name ?? '—'}</td>
                    <td className="px-3 py-2 font-medium">{r.surname ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.nationality ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[10.5px]">{r.passport_number ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[10.5px]">{r.visa_number ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmt(r.visa_issuance_date)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmt(r.visa_expiry)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmt(r.sign_on_date)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmt(r.sign_off_date)}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[r.status] ?? r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
