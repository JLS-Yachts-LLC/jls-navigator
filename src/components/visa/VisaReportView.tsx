import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { downloadVisaExport, emailVisaExport } from '@/lib/visa/export-client'
import { triggerBlobDownload } from '@/lib/visa/documentExport'
import { useColumnFilters, type FilterColumn } from '@/components/ui/column-filter'
import { supabase } from '@/integrations/supabase/client'
import { fetchAllRows } from '@/lib/fetch-all'

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
  cancelled_on?: string | null
  cancelled_on_estimated?: boolean | null
  submitted_at: string | null
  created_at: string
  application_notes?: string | null
  yachts?: { vessel_name: string } | null
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', pending_docs: 'Pending Docs', submitted: 'Submitted', in_review: 'In Review',
  processing: 'Processing', approved: 'Approved', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled',
}
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const name = (r: Row) => `${r.given_name ?? ''} ${r.surname ?? ''}`.trim() || '—'
const effDate = (r: Row) => r.submitted_at ?? r.visa_issuance_date ?? r.created_at

const CSV_HEADERS = ['Vessel', 'Given Name', 'Surname', 'Nationality', 'Passport No.', 'Visa Ref', 'Visa Issuance', 'Visa Expiry', 'Cancelled On', 'Sign On', 'Sign Off', 'Crew Changes', 'Status', 'Notes']
// Every sign on / sign off made under a visa, oldest first (crew_signon_events.visa_id).
type Move = { event_type: string; event_date: string }
const short = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
const movesText = (ms: Move[] | undefined) => (ms ?? []).map(m => `${m.event_type === 'sign_on' ? 'On' : 'Off'} ${short(m.event_date)}`).join(' · ')
const cancelledText = (r: Row) => r.cancelled_on ? fmt(r.cancelled_on) + (r.cancelled_on_estimated ? ' (marked)' : '') : (r.status === 'cancelled' ? 'Not recorded' : '—')
const notes = (r: Row) => (r.application_notes ?? '').replace(/\s+/g, ' ').trim()
// Solid background: a sticky header cell over a translucent one lets rows show through.
const TH = 'sticky top-0 z-10 bg-card px-3 py-2.5 font-semibold text-muted-foreground/80 whitespace-nowrap shadow-[inset_0_-1px_0_0_var(--border)]'
const fileSafe = (s: string) => s.replace(/[^a-zA-Z0-9.\-]/g, '-')
const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

export function VisaReportView({ applications, vessels, initialVessel, onClose }: {
  applications: Row[]
  vessels: [string, string][]
  /** The vessel picked on the dashboard, if any — the report starts on it. */
  initialVessel?: string | null
  onClose: () => void
}) {
  const { user } = useAuth()
  const [tab, setTab] = useState<'immigration' | 'visa'>('immigration')
  // Several vessels can be picked at once; none picked = every vessel (SD-0061).
  const [picked, setPicked] = useState<string[]>(initialVessel ? [initialVessel] : [])
  const [vesselSearch, setVesselSearch] = useState('')
  const [downloading, setDownloading] = useState<'csv' | 'pdf' | null>(null)
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [emailing, setEmailing] = useState(false)

  const vesselName = (id: string | null) => vessels.find(v => v[0] === id)?.[1] ?? 'Unassigned'

  // Crew changes per visa — a multiple-entry visa can carry several sign ons and offs.
  const [moves, setMoves] = useState<Record<string, Move[]>>({})
  useEffect(() => {
    void (async () => {
      const { data } = await fetchAllRows<Move & { visa_id: string }>(() => (supabase as any)
        .from('crew_signon_events').select('visa_id, event_type, event_date')
        .not('visa_id', 'is', null).neq('status', 'cancelled')
        .order('event_date', { ascending: true }).order('id', { ascending: true }))
      const by: Record<string, Move[]> = {}
      for (const m of data ?? []) (by[m.visa_id] ??= []).push(m)
      setMoves(by)
    })()
  }, [])

  const pickedSet = useMemo(() => new Set(picked), [picked])
  const filtered = useMemo(() => applications.filter(r => {
    if (pickedSet.size && !pickedSet.has(r.yacht_id ?? '')) return false
    if (status !== 'all' && r.status !== status) return false
    const d = (effDate(r) ?? '').slice(0, 10)
    if (from && d && d < from) return false
    if (to && d && d > to) return false
    return true
  }), [applications, pickedSet, status, from, to])

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

  function csvBlob(rows: Row[]): Blob {
    const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    const lines = [CSV_HEADERS.join(','), ...rows.map(r => [
      r.yachts?.vessel_name ?? vesselName(r.yacht_id), r.given_name ?? '', r.surname ?? '', r.nationality ?? '',
      r.passport_number ?? '', r.visa_number ?? '', fmt(r.visa_issuance_date), fmt(r.visa_expiry), cancelledText(r),
      fmt(r.sign_on_date), fmt(r.sign_off_date), movesText(moves[r.id]), STATUS_LABEL[r.status] ?? r.status, notes(r),
    ].map(x => esc(String(x))).join(','))]
    return new Blob([lines.join('\r\n')], { type: 'text/csv' })
  }

  // Visa Detail: Excel-style sort and value filter on every column header.
  const detailColumns = useMemo<FilterColumn<Row>[]>(() => [
    { key: 'vessel', label: 'Vessel', value: r => r.yachts?.vessel_name ?? vesselName(r.yacht_id) },
    { key: 'given', label: 'Given Name', value: r => r.given_name },
    { key: 'surname', label: 'Surname', value: r => r.surname },
    { key: 'nationality', label: 'Nationality', value: r => r.nationality },
    { key: 'passport', label: 'Passport No.', value: r => r.passport_number },
    { key: 'visa', label: 'Visa Ref', value: r => r.visa_number },
    { key: 'issued', label: 'Visa Issuance', value: r => r.visa_issuance_date?.slice(0, 7), sortValue: r => r.visa_issuance_date },
    { key: 'expiry', label: 'Visa Expiry', value: r => r.visa_expiry?.slice(0, 7), sortValue: r => r.visa_expiry },
    { key: 'cancelled', label: 'Cancelled On', value: r => r.cancelled_on?.slice(0, 7), sortValue: r => r.cancelled_on },
    { key: 'signon', label: 'Sign On', value: r => r.sign_on_date?.slice(0, 7), sortValue: r => r.sign_on_date },
    { key: 'signoff', label: 'Sign Off', value: r => r.sign_off_date?.slice(0, 7), sortValue: r => r.sign_off_date },
    { key: 'moves', label: 'Crew Changes', value: r => { const n = moves[r.id]?.length ?? 0; return n ? `${n} movement${n !== 1 ? 's' : ''}` : null }, sortValue: r => moves[r.id]?.length ?? 0 },
    { key: 'status', label: 'Status', value: r => STATUS_LABEL[r.status] ?? r.status },
    { key: 'notes', label: 'Notes', value: r => notes(r).slice(0, 80) },
  ], [vessels, moves]) // eslint-disable-line react-hooks/exhaustive-deps
  const cf = useColumnFilters(filtered, detailColumns)

  function exportCsv() {
    const label = picked.length === 1 ? vesselName(picked[0]) : picked.length ? `${picked.length}-vessels` : 'All'
    // On Visa Detail the file carries exactly the rows on screen, column filters and sort included.
    triggerBlobDownload(csvBlob(tab === 'visa' ? cf.rows : filtered), fileSafe(`Visa-Report-${label}.csv`))
  }

  /** One vessel's file, carrying exactly the records on screen for it. The server
   *  defaults to this year's active visas, so ask for everything and then name
   *  the records — whichever list is shorter, as the export review dialog does. */
  async function downloadVessel(yachtId: string, format: 'csv' | 'pdf') {
    const shown = filtered.filter(r => r.yacht_id === yachtId)
    if (format === 'csv') { triggerBlobDownload(csvBlob(shown), fileSafe(`Visa-Report-${vesselName(yachtId)}.csv`)); return }
    const keep = new Set(shown.map(r => r.id))
    const hidden = applications.filter(r => r.yacht_id === yachtId && !keep.has(r.id)).map(r => r.id)
    const selection = !hidden.length ? ''
      : hidden.length <= keep.size ? `&exclude=${hidden.join(',')}` : `&include=${[...keep].join(',')}`
    await downloadVisaExport(`/api/visa/export?yacht_id=${yachtId}&format=pdf&visa=all&year=all${selection}`)
  }

  /** A separate file for each picked vessel (SD-0061). */
  async function downloadEach(format: 'csv' | 'pdf') {
    const ids = summary.map(g => g.id).filter(id => id !== 'unknown')
    if (!ids.length) { toast.error('No records for the picked vessels'); return }
    setDownloading(format)
    let failed = 0
    try {
      for (const id of ids) {
        try { await downloadVessel(id, format) } catch (e: any) { failed++; toast.error(`${vesselName(id)}: ${e.message}`) }
        // Browsers drop rapid back-to-back downloads; a short gap keeps every file.
        await pause(400)
      }
    } finally { setDownloading(null) }
    const done = ids.length - failed
    if (done) toast.success(`Downloaded ${done} vessel report${done !== 1 ? 's' : ''}`)
  }

  function togglePicked(id: string) {
    setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }
  const vesselOptions = useMemo(() => {
    const q = vesselSearch.trim().toLowerCase()
    return q ? vessels.filter(([, n]) => n.toLowerCase().includes(q)) : vessels
  }, [vessels, vesselSearch])
  const pickedLabel = !picked.length ? 'All Vessels' : picked.length === 1 ? vesselName(picked[0]) : `${picked.length} vessels`

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
        <Popover onOpenChange={o => { if (!o) setVesselSearch('') }}>
          <PopoverTrigger asChild>
            <button className="flex h-8 max-w-[220px] items-center gap-2 rounded-md border border-border bg-background px-2">
              <span className="truncate">{pickedLabel}</span><span className="text-muted-foreground">▾</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0 text-xs">
            <div className="border-b border-border p-2">
              <input autoFocus value={vesselSearch} onChange={e => setVesselSearch(e.target.value)} placeholder="Search vessels…"
                className="h-7 w-full rounded-md border border-border bg-background px-2" />
            </div>
            <div className="max-h-72 overflow-auto py-1">
              {vesselOptions.length === 0 ? (
                <div className="px-3 py-2 text-muted-foreground">No vessels match</div>
              ) : vesselOptions.map(([id, n]) => (
                <label key={id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-accent/40">
                  <input type="checkbox" checked={pickedSet.has(id)} onChange={() => togglePicked(id)} className="accent-primary" />
                  <span className="truncate">{n}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-muted-foreground">
              <span>{picked.length ? `${picked.length} picked` : 'Showing all vessels'}</span>
              {picked.length > 0 && <button onClick={() => setPicked([])} className="font-medium text-primary hover:underline">Clear</button>}
            </div>
          </PopoverContent>
        </Popover>
        <select value={status} onChange={e => setStatus(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2">
          <option value="all">All Status</option>
          {statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-muted-foreground">From <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2" /></label>
        <label className="flex items-center gap-1.5 text-muted-foreground">To <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2" /></label>
        <span className="ml-auto font-medium text-muted-foreground">
          {tab === 'visa' && cf.rows.length !== filtered.length ? `${cf.rows.length} of ${filtered.length}` : filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </span>
        <button onClick={exportCsv} disabled={!filtered.length} className="h-8 rounded-md border border-border px-3 font-medium hover:bg-accent/40 disabled:opacity-50">⬇ Export CSV</button>
        {/* One file per picked vessel. Needs a pick: with nothing picked it would
            be a file for every vessel in the fleet. */}
        <div className="flex items-center overflow-hidden rounded-md border border-border"
             title={picked.length ? 'Download a separate report for each picked vessel' : 'Pick vessels in the vessel filter first'}>
          <span className="px-2 text-muted-foreground">Each vessel:</span>
          {(['csv', 'pdf'] as const).map(f => (
            <button key={f} onClick={() => downloadEach(f)} disabled={!picked.length || !filtered.length || !!downloading}
              className="h-8 border-l border-border px-3 font-medium uppercase hover:bg-accent/40 disabled:opacity-50">
              {downloading === f ? '…' : `⬇ ${f}`}
            </button>
          ))}
        </div>
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
            {/* No overflow-hidden wrapper: it would stop the header row sticking. */}
            <div className="rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={cn(TH, 'px-4 text-left')}>Vessel</th>
                    <th className={cn(TH, 'text-center')}>Total</th>
                    <th className={cn(TH, 'text-center text-emerald-400/80')}>Approved</th>
                    <th className={cn(TH, 'text-center text-slate-400/80')}>Cancelled</th>
                    <th className={cn(TH, 'text-center text-red-400/80')}>Rejected/Denied</th>
                    <th className={cn(TH, 'px-4 text-left')}>Export</th>
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
                            <button onClick={() => downloadVessel(g.id, 'csv')} className="rounded bg-muted/40 px-2 py-1 text-[10.5px] font-medium hover:bg-muted/70">CSV</button>
                            <button onClick={() => downloadVessel(g.id, 'pdf').catch((e) => toast.error(e.message))} className="rounded bg-muted/40 px-2 py-1 text-[10.5px] font-medium hover:bg-muted/70">PDF</button>
                            <button onClick={() => emailVessel(g.id)} disabled={emailing} className="rounded bg-primary/10 px-2 py-1 text-[10.5px] font-medium text-primary hover:bg-primary/20">{emailing ? '…' : 'Email'}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {summary.length > 1 && (
                  // The consolidated line: every vessel in the report added together.
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                      <td className="px-4 py-2.5">{picked.length ? `All ${summary.length} vessels shown` : 'All vessels'}</td>
                      <td className="px-3 py-2.5 text-center font-bold">{totals.total}</td>
                      <td className="px-3 py-2.5 text-center text-emerald-400">{totals.approved}</td>
                      <td className="px-3 py-2.5 text-center text-slate-400">{totals.cancelled}</td>
                      <td className="px-3 py-2.5 text-center text-red-400">{totals.rejected}</td>
                      <td className="px-4 py-2 text-[10.5px] font-normal text-muted-foreground">Export CSV (top right) = every record</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr>{detailColumns.map(c => (
                  <th key={c.key} className={cn(TH, 'text-left')}>{cf.header(c.key)}</th>
                ))}</tr>
              </thead>
              <tbody>
                {cf.rows.length === 0 ? (
                  <tr><td colSpan={14} className="py-10 text-center text-muted-foreground/50">
                    No records match the filters
                    {cf.activeCount > 0 && <> · <button onClick={cf.clearAll} className="text-primary hover:underline">Clear column filters</button></>}
                  </td></tr>
                ) : cf.rows.map((r, i) => (
                  <tr key={r.id} className={cn('border-b border-border/40', i % 2 ? 'bg-muted/10' : '')}>
                    <td className="px-3 py-2 font-medium">{r.yachts?.vessel_name ?? vesselName(r.yacht_id)}</td>
                    <td className="px-3 py-2">{r.given_name ?? '—'}</td>
                    <td className="px-3 py-2 font-medium">{r.surname ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.nationality ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[10.5px]">{r.passport_number ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[10.5px]">{r.visa_number ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmt(r.visa_issuance_date)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmt(r.visa_expiry)}</td>
                    <td className="px-3 py-2 text-muted-foreground" title={r.cancelled_on_estimated ? 'No date was entered — this is the day it was marked Cancelled in Polaris' : undefined}>
                      {r.cancelled_on ? <>{fmt(r.cancelled_on)}{r.cancelled_on_estimated && <span className="text-amber-500"> *</span>}</> : r.status === 'cancelled' ? <span className="text-amber-500">Not recorded</span> : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{fmt(r.sign_on_date)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmt(r.sign_off_date)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[10.5px] text-muted-foreground">
                      {moves[r.id]?.length
                        ? moves[r.id].map((m, k) => (
                            <span key={k} className={cn('mr-1 inline-block rounded px-1 py-px', m.event_type === 'sign_on' ? 'bg-teal-500/10 text-teal-500' : 'bg-slate-500/10 text-slate-400')}>
                              {m.event_type === 'sign_on' ? 'On' : 'Off'} {short(m.event_date)}
                            </span>
                          ))
                        : '—'}
                    </td>
                    <td className="px-3 py-2">{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className="max-w-[18rem] truncate px-3 py-2 text-muted-foreground" title={r.application_notes ?? undefined}>{notes(r) || '—'}</td>
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
