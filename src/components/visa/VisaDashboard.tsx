import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/lib/auth'
import { fetchAllRows } from '@/lib/fetch-all'
import { COLORS, FONTS } from '@/lib/tokens'
import { COUNTRY_CONFIGS } from '@/lib/visa/countryConfig'
import ComplianceAlertBanner from './ComplianceAlertBanner'
import { VisaReportView } from './VisaReportView'

// ── Types ────────────────────────────────────────────────────────────────────

interface VisaApplication {
  id: string
  crew_member_id: string | null
  yacht_id: string | null
  vessel_name: string | null
  country_code: string | null
  status: string
  visa_document_url?: string | null
  passport_number: string | null
  given_name: string | null
  surname: string | null
  nationality: string | null
  visa_number: string | null
  visa_expiry: string | null
  sign_on_date: string | null
  submitted_at: string | null
  application_notes: string | null
  created_at: string
  crew_members: {
    full_name: string | null
    first_name: string | null
    last_name: string | null
  } | null
  yachts: { vessel_name: string } | null
}

interface ComplianceAlert {
  id: string
  crew_id: string
  alert_type: string
  severity: 'warn' | 'critical'
  message: string
  due_date: string | null
  resolved: boolean
}

// ── Status config (covers EVERY status in the table) ───────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  draft:        { label: 'Draft',        bg: COLORS.steel,  text: COLORS.frost },
  pending_docs: { label: 'Pending Docs', bg: '#3a2a00',     text: COLORS.leoAmber },
  need_to_apply:{ label: 'Need to Apply',bg: '#3a2a00',     text: COLORS.leoAmber },
  submitted:    { label: 'Submitted',    bg: '#003a3c',     text: COLORS.signal },
  in_review:    { label: 'In Review',    bg: '#2a2a00',     text: COLORS.leoAmber },
  processing:   { label: 'Processing',   bg: '#1a1a3a',     text: '#8a8aff' },
  approved:     { label: 'Approved',     bg: '#003a1a',     text: '#30D060' },
  completed:    { label: 'Completed',    bg: '#003a2a',     text: '#30D060' },
  rejected:     { label: 'Rejected',     bg: '#3a1500',     text: COLORS.warn },
  cancelled:    { label: 'Cancelled',    bg: '#2a2a2a',     text: '#9aa5b1' },
}

// Order shown in the pipeline filter strip
const PIPELINE: string[] = ['draft', 'pending_docs', 'submitted', 'approved', 'cancelled', 'rejected']

function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s ? s.replace(/_/g, ' ') : '—', bg: COLORS.steel, text: COLORS.frost }
}

// Lifecycle progress (battery) per application status.
function statusProgress(s: string): { pct: number; color: string } {
  const green = '#30D060', amber = COLORS.leoAmber, red = COLORS.warn, grey = '#9aa5b1'
  switch (s) {
    case 'draft':         return { pct: 12,  color: amber }
    case 'pending_docs':
    case 'need_to_apply': return { pct: 28,  color: amber }
    case 'submitted':     return { pct: 50,  color: COLORS.signal }
    case 'in_review':     return { pct: 65,  color: COLORS.signal }
    case 'processing':    return { pct: 80,  color: COLORS.signal }
    case 'approved':      return { pct: 92,  color: green }
    case 'completed':     return { pct: 100, color: green }
    case 'rejected':      return { pct: 100, color: red }
    case 'cancelled':     return { pct: 100, color: grey }
    default:              return { pct: 8,   color: COLORS.muted }
  }
}

function getCrewName(app: VisaApplication): string {
  if (app.given_name || app.surname) return `${app.given_name ?? ''} ${app.surname ?? ''}`.trim()
  if (app.crew_members?.full_name) return app.crew_members.full_name
  const first = app.crew_members?.first_name ?? ''
  const last  = app.crew_members?.last_name  ?? ''
  const joined = `${first} ${last}`.trim()
  if (joined) return joined
  if (app.application_notes) return app.application_notes.split('\n')[0]
  return '—'
}

function getCountryInfo(code: string | null): { flag: string; name: string } {
  if (!code) return { flag: '🌐', name: '—' }
  const cfg = (COUNTRY_CONFIGS as any)[code]
  if (cfg) return { flag: cfg.flag, name: cfg.countryName }
  return { flag: '🌐', name: code }
}

function effectiveDate(app: VisaApplication): string {
  return app.submitted_at ?? app.created_at
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const GRID = '1.6fr 1.3fr 1.2fr 120px 1.3fr 110px 96px'

// ── Main Component ───────────────────────────────────────────────────────────

export default function VisaDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [applications, setApplications] = useState<VisaApplication[]>([])
  const [alerts, setAlerts]             = useState<ComplianceAlert[]>([])
  const [loading, setLoading]           = useState(true)
  const [alertsOpen, setAlertsOpen]     = useState(false)
  const [emailing, setEmailing]         = useState(false)
  const [showReport, setShowReport]     = useState(false)

  const [cancelling, setCancelling] = useState<string | null>(null)
  const [attaching, setAttaching]   = useState<string | null>(null)

  // Quick-attach the issued visa document, which moves the application to Approved.
  async function attachVisa(app: VisaApplication, file: File | null) {
    if (!file) return
    setAttaching(app.id)
    try {
      const ext  = file.name.split('.').pop() || 'pdf'
      const path = `visa/${app.id}/visa-document.${ext}`
      const { error: upErr } = await supabase.storage.from('permit-documents').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const url = supabase.storage.from('permit-documents').getPublicUrl(path).data.publicUrl
      const { error } = await (supabase as any).from('visa_applications').update({
        visa_document_url: url, status: 'approved',
        approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', app.id)
      if (error) throw error
      setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'approved', visa_document_url: url } : a))
      toast.success('Visa attached — application moved to Approved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not attach the visa')
    } finally {
      setAttaching(null)
    }
  }

  async function cancelOrDelete(app: VisaApplication) {
    if (!window.confirm(
      app.status === 'draft'
        ? `Delete this draft application for ${app.crew_members?.full_name ?? 'this crew member'}? This cannot be undone.`
        : `Cancel this application for ${app.crew_members?.full_name ?? 'this crew member'}? Status will be set to Cancelled.`
    )) return

    setCancelling(app.id)
    const db = supabase as any
    if (app.status === 'draft') {
      await db.from('visa_applications').delete().eq('id', app.id)
    } else {
      await db.from('visa_applications').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', app.id)
    }
    setApplications(prev => app.status === 'draft'
      ? prev.filter(a => a.id !== app.id)
      : prev.map(a => a.id === app.id ? { ...a, status: 'cancelled' } : a)
    )
    setCancelling(null)
  }

  // Filters
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [search, setSearch]   = useState('')
  const [vessel, setVessel]   = useState('all')
  const [year, setYear]       = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [appsRes, alertsRes] = await Promise.all([
        fetchAllRows(() => (supabase as any)
          .from('visa_applications')
          .select('*, crew_members(full_name, first_name, last_name), yachts(vessel_name)')
          .order('created_at', { ascending: false })),
        (supabase as any)
          .from('compliance_alerts')
          .select('*')
          .eq('resolved', false)
          .in('severity', ['warn', 'critical'])
          .order('due_date', { ascending: true })
          .limit(5),
      ])
      setApplications((appsRes.data ?? []) as VisaApplication[])
      setAlerts((alertsRes.data ?? []) as ComplianceAlert[])
      setLoading(false)
    }
    load()
  }, [])

  // ── Derived: vessels & years present in the data ────────────────────────────

  const vessels = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of applications) {
      if (a.yacht_id) m.set(a.yacht_id, a.yachts?.vessel_name ?? a.yacht_id)
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [applications])

  const years = useMemo(() => {
    const s = new Set<string>()
    for (const a of applications) s.add(new Date(effectiveDate(a)).getFullYear().toString())
    return [...s].sort((a, b) => b.localeCompare(a))
  }, [applications])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of applications) c[a.status] = (c[a.status] ?? 0) + 1
    return c
  }, [applications])

  // ── Filtering ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => applications.filter(a => {
    if (activeStatus && a.status !== activeStatus) return false
    if (vessel !== 'all' && a.yacht_id !== vessel) return false
    const d = effectiveDate(a)
    if (year !== 'all' && new Date(d).getFullYear().toString() !== year) return false
    const day = d.slice(0, 10)
    if (dateFrom && day < dateFrom) return false
    if (dateTo && day > dateTo) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const hay = [
        getCrewName(a), a.passport_number, a.visa_number, a.nationality,
        a.yachts?.vessel_name, getCountryInfo(a.country_code).name,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [applications, activeStatus, vessel, year, dateFrom, dateTo, search])

  const hasFilters = !!activeStatus || vessel !== 'all' || year !== 'all' || !!dateFrom || !!dateTo || !!search.trim()

  function clearFilters() {
    setActiveStatus(null); setVessel('all'); setYear('all'); setDateFrom(''); setDateTo(''); setSearch('')
  }

  // ── Exports (reuse /api/visa/export — requires a single vessel) ───────────────

  function exportUrl(format: 'pdf' | 'csv') {
    return `/api/visa/export?yacht_id=${vessel}&format=${format}`
  }
  async function emailReport() {
    if (vessel === 'all') { toast.error('Select a vessel to email its report'); return }
    if (!user?.email) { toast.error('No email address on your account'); return }
    setEmailing(true)
    try {
      const res = await fetch('/api/visa/export/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yacht_id: vessel, to_email: user.email }),
      })
      const json = await res.json()
      if (json.ok) toast.success(`Report emailed to ${user.email}`)
      else toast.error(`Email failed: ${json.error}`)
    } catch (e: any) {
      toast.error(`Email error: ${e.message}`)
    } finally { setEmailing(false) }
  }

  // ── Reusable control styles ───────────────────────────────────────────────────

  const ctl: React.CSSProperties = {
    height: 34, background: COLORS.abyss, border: `1px solid ${COLORS.deep}`,
    borderRadius: 8, color: COLORS.frost, fontFamily: FONTS.display, fontSize: 12.5,
    padding: '0 10px', outline: 'none',
  }
  const btn = (active: boolean): React.CSSProperties => ({
    height: 34, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${active ? COLORS.signal : COLORS.deep}`,
    background: active ? 'rgba(0,196,204,0.08)' : COLORS.abyss,
    color: active ? COLORS.signal : COLORS.muted, fontFamily: FONTS.display,
    fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
  })

  // ── Render ─────────────────────────────────────────────────────────────────

  if (showReport) {
    return <VisaReportView applications={applications as any} vessels={vessels} onClose={() => setShowReport(false)} />
  }

  return (
    <div style={{ fontFamily: FONTS.display, color: COLORS.frost, minHeight: '100vh', padding: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, color: COLORS.frost, margin: 0 }}>
            Visa Applications
          </h1>
          <p style={{ fontFamily: FONTS.body, color: COLORS.muted, fontSize: 13, margin: '4px 0 0' }}>
            Crew immigration pipeline · {applications.length} total
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setShowReport(true)}
            style={{
              background: 'transparent', color: COLORS.frost, fontFamily: FONTS.display,
              fontWeight: 600, fontSize: 13, padding: '9px 16px', borderRadius: 8,
              border: `1px solid ${COLORS.deep}`, cursor: 'pointer',
            }}
          >
            ▤ Reports
          </button>
          <button
            onClick={() => navigate({ to: '/crew-immigration/visas/new' })}
            style={{
              background: COLORS.signal, color: COLORS.void, fontFamily: FONTS.display,
              fontWeight: 700, fontSize: 13, padding: '9px 18px', borderRadius: 8,
              border: 'none', cursor: 'pointer', letterSpacing: '0.02em',
            }}
          >
            + New Application
          </button>
        </div>
      </div>

      {/* Pipeline status filter strip */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {PIPELINE.map(status => {
          const isActive = activeStatus === status
          const m = statusMeta(status)
          return (
            <button
              key={status}
              onClick={() => setActiveStatus(isActive ? null : status)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                borderRadius: 8, border: `1px solid ${isActive ? m.text : COLORS.deep}`,
                background: isActive ? m.bg : COLORS.abyss, cursor: 'pointer',
                fontFamily: FONTS.display, fontSize: 13, fontWeight: isActive ? 700 : 500,
                color: isActive ? m.text : COLORS.muted, transition: 'all 0.15s ease',
              }}
            >
              <span>{m.label}</span>
              <span style={{
                background: isActive ? m.text : COLORS.ocean, color: isActive ? COLORS.void : COLORS.frost,
                fontWeight: 700, fontSize: 11, borderRadius: 20, padding: '1px 8px',
                minWidth: 22, textAlign: 'center',
              }}>
                {counts[status] ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filter toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '0 1 300px', minWidth: 240 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: COLORS.signal, fontSize: 14, pointerEvents: 'none' }}>⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, passport, visa…"
            style={{
              ...ctl, width: '100%', height: 38, paddingLeft: 30,
              border: `1.5px solid ${COLORS.signal}`, background: 'color-mix(in oklab, var(--muted) 50%, transparent)',
              boxShadow: `0 0 0 3px color-mix(in oklab, ${COLORS.signal} 12%, transparent)`,
            }}
          />
        </div>
        <select value={vessel} onChange={e => setVessel(e.target.value)} style={{ ...ctl, cursor: 'pointer' }}>
          <option value="all">All Vessels</option>
          {vessels.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)} style={{ ...ctl, cursor: 'pointer' }}>
          <option value="all">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLORS.muted, fontSize: 12 }}>
          From <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...ctl }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLORS.muted, fontSize: 12 }}>
          To <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...ctl }} />
        </label>
        {hasFilters && (
          <button onClick={clearFilters} style={btn(false)}>Clear ×</button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <a href={vessel === 'all' ? undefined : exportUrl('csv')}
             onClick={e => { if (vessel === 'all') { e.preventDefault(); toast.error('Select a vessel to export') } }}
             style={{ ...btn(false), textDecoration: 'none', opacity: vessel === 'all' ? 0.5 : 1 }}>
            ⬇ CSV
          </a>
          <a href={vessel === 'all' ? undefined : exportUrl('pdf')} target="_blank" rel="noreferrer"
             onClick={e => { if (vessel === 'all') { e.preventDefault(); toast.error('Select a vessel to export') } }}
             style={{ ...btn(false), textDecoration: 'none', opacity: vessel === 'all' ? 0.5 : 1 }}>
            ⬇ PDF
          </a>
          <button onClick={emailReport} disabled={emailing} style={{ ...btn(false), opacity: emailing ? 0.6 : 1 }}>
            {emailing ? 'Sending…' : '✉ Email'}
          </button>
        </div>
      </div>

      {/* Compliance Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setAlertsOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderRadius: alertsOpen ? '8px 8px 0 0' : 8,
              border: `1px solid ${COLORS.warn}44`, background: '#200e00', color: COLORS.warn,
              fontFamily: FONTS.display, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span>⚠ {alerts.length} compliance alert{alerts.length !== 1 ? 's' : ''} require attention</span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>{alertsOpen ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {alertsOpen && (
            <div style={{ border: `1px solid ${COLORS.warn}44`, borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#180a00', padding: 8 }}>
              {alerts.map((a, i) => (
                <ComplianceAlertBanner key={i} alert={a} onResolve={() => setAlerts(prev => prev.filter((_, j) => j !== i))} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Applications Table */}
      {loading ? (
        <div style={{ textAlign: 'center', color: COLORS.muted, fontFamily: FONTS.display, padding: '60px 0', fontSize: 14 }}>
          Loading applications…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: COLORS.abyss, borderRadius: 12, border: `1px solid ${COLORS.deep}` }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <p style={{ fontFamily: FONTS.display, color: COLORS.frost, fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>
            {hasFilters ? 'No applications match your filters' : 'No applications yet'}
          </p>
          <p style={{ fontFamily: FONTS.body, color: COLORS.muted, fontSize: 13, margin: 0 }}>
            {hasFilters ? 'Adjust or clear the filters above.' : 'Create your first visa application using the button above.'}
          </p>
        </div>
      ) : (
        <div style={{ background: COLORS.abyss, borderRadius: 12, border: `1px solid ${COLORS.deep}`, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '10px 16px', background: COLORS.ocean, borderBottom: `1px solid ${COLORS.deep}` }}>
            {['Crew', 'Vessel', 'Country', 'Status', 'Passport', 'Applied', 'Actions'].map(col => (
              <span key={col} style={{ fontFamily: FONTS.display, fontSize: 11, fontWeight: 700, color: COLORS.frost, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {col}
              </span>
            ))}
          </div>

          {/* Rows */}
          {filtered.map((app, idx) => {
            const m = statusMeta(app.status)
            const country = getCountryInfo(app.country_code)
            return (
              <div
                key={app.id}
                style={{
                  display: 'grid', gridTemplateColumns: GRID, padding: '12px 16px', alignItems: 'center',
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${COLORS.deep}` : 'none',
                  background: idx % 2 === 1 ? `color-mix(in oklab, ${COLORS.deep} 25%, transparent)` : 'transparent',
                }}
              >
                {/* Crew */}
                <span style={{ fontFamily: FONTS.display, fontSize: 13, fontWeight: 600, color: COLORS.frost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                  {getCrewName(app)}
                </span>

                {/* Vessel */}
                <span style={{ fontFamily: FONTS.display, fontSize: 12.5, color: COLORS.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                  {app.vessel_name ?? app.yachts?.vessel_name ?? '—'}
                </span>

                {/* Country — aligned: fixed-width flag + name */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost }}>
                  <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{country.flag}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{country.name}</span>
                </span>

                {/* Status pill + progress battery */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20,
                    background: m.bg, color: m.text, fontFamily: FONTS.display, fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.04em', width: 'fit-content',
                  }}>
                    {m.label}
                  </span>
                  {(() => {
                    const p = statusProgress(app.status)
                    return (
                      <div title={`${p.pct}% through the pipeline`} style={{ width: 88, height: 5, borderRadius: 4, background: COLORS.void, border: `1px solid ${COLORS.deep}`, overflow: 'hidden' }}>
                        <div style={{ width: `${p.pct}%`, height: '100%', background: p.color }} />
                      </div>
                    )
                  })()}
                </div>

                {/* Passport */}
                <span style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.muted }}>
                  {app.passport_number ?? '—'}
                </span>

                {/* Applied date */}
                <span style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.muted }}>
                  {formatDate(effectiveDate(app))}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(app.status === 'submitted' || app.status === 'pending_docs') && (
                    <>
                      <input
                        id={`attach-${app.id}`} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                        onChange={e => attachVisa(app, e.target.files?.[0] ?? null)}
                      />
                      <button
                        onClick={() => document.getElementById(`attach-${app.id}`)?.click()}
                        disabled={attaching === app.id}
                        title="Upload the issued visa — moves this application to Approved"
                        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: COLORS.signal, color: COLORS.void, fontFamily: FONTS.display, fontSize: 11, fontWeight: 700, cursor: attaching === app.id ? 'wait' : 'pointer', opacity: attaching === app.id ? 0.6 : 1 }}
                      >
                        {attaching === app.id ? 'Attaching…' : 'Attach Visa'}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => navigate({ to: `/crew-immigration/visas/${app.id}` as any })}
                    style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${COLORS.ocean}`, background: 'transparent', color: COLORS.signal, fontFamily: FONTS.display, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => navigate({ to: app.status === 'draft' ? `/crew-immigration/visas/new?draft=${app.id}` as any : `/crew-immigration/visas/${app.id}` as any })}
                    style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${COLORS.ocean}`, background: 'transparent', color: app.status === 'draft' ? COLORS.signal : COLORS.muted, fontFamily: FONTS.display, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {app.status === 'draft' ? 'Resume' : 'Edit'}
                  </button>
                  {!['cancelled', 'rejected', 'expired', 'approved'].includes(app.status) && (
                    <button
                      onClick={() => cancelOrDelete(app)}
                      disabled={cancelling === app.id}
                      style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${COLORS.error}44`, background: 'transparent', color: cancelling === app.id ? COLORS.steel : COLORS.error, fontFamily: FONTS.display, fontSize: 11, fontWeight: 600, cursor: cancelling === app.id ? 'not-allowed' : 'pointer', opacity: cancelling === app.id ? 0.5 : 1 }}
                    >
                      {app.status === 'draft' ? 'Delete' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
