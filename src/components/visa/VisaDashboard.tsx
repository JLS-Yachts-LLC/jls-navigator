import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '@/integrations/supabase/client'
import { COLORS, FONTS } from '@/lib/tokens'
import { COUNTRY_CONFIGS } from '@/lib/visa/countryConfig'
import ComplianceAlertBanner from './ComplianceAlertBanner'

// ── Types ────────────────────────────────────────────────────────────────────

type ApplicationStatus = 'draft' | 'pending_docs' | 'submitted' | 'approved' | 'rejected'

interface VisaApplication {
  id: string
  crew_id: string
  country_code: string
  status: ApplicationStatus
  passport_number: string | null
  applied_date: string | null
  created_at: string
  crew_members: {
    full_name: string | null
    first_name: string | null
    last_name: string | null
  } | null
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft:        'Draft',
  pending_docs: 'Pending Docs',
  submitted:    'Submitted',
  approved:     'Approved',
  rejected:     'Rejected',
}

const STATUS_COLORS: Record<ApplicationStatus, { bg: string; text: string }> = {
  draft:        { bg: COLORS.steel,    text: COLORS.frost },
  pending_docs: { bg: '#3a2a00',       text: COLORS.leoAmber },
  submitted:    { bg: '#003a3c',       text: COLORS.signal },
  approved:     { bg: '#003a1a',       text: '#30D060' },
  rejected:     { bg: '#3a1500',       text: COLORS.warn },
}

const ALL_STATUSES: ApplicationStatus[] = ['draft', 'pending_docs', 'submitted', 'approved', 'rejected']

function getCrewName(app: VisaApplication): string {
  if (app.crew_members?.full_name) return app.crew_members.full_name
  const first = app.crew_members?.first_name ?? ''
  const last  = app.crew_members?.last_name  ?? ''
  return `${first} ${last}`.trim() || '—'
}

function getCountryInfo(code: string): { flag: string; name: string } {
  const cfg = (COUNTRY_CONFIGS as any)[code]
  if (cfg) return { flag: cfg.flag, name: cfg.countryName }
  return { flag: '🌐', name: code }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function VisaDashboard() {
  const navigate = useNavigate()

  const [applications, setApplications] = useState<VisaApplication[]>([])
  const [alerts, setAlerts]             = useState<ComplianceAlert[]>([])
  const [loading, setLoading]           = useState(true)
  const [activeFilter, setActiveFilter] = useState<ApplicationStatus | null>(null)
  const [alertsOpen, setAlertsOpen]     = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const [appsRes, alertsRes] = await Promise.all([
        (supabase as any)
          .from('visa_applications')
          .select('*, crew_members(full_name, first_name, last_name)')
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('compliance_alerts')
          .select('*')
          .eq('resolved', false)
          .in('severity', ['warn', 'critical'])
          .order('due_date', { ascending: true })
          .limit(5),
      ])

      setApplications(appsRes.data ?? [])
      setAlerts(alertsRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────

  const counts = ALL_STATUSES.reduce<Record<ApplicationStatus, number>>((acc, s) => {
    acc[s] = applications.filter(a => a.status === s).length
    return acc
  }, {} as Record<ApplicationStatus, number>)

  const filtered = activeFilter
    ? applications.filter(a => a.status === activeFilter)
    : applications

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      fontFamily: FONTS.display,
      color: COLORS.frost,
      minHeight: '100vh',
      padding: '24px',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontFamily: FONTS.display, fontSize: '22px', fontWeight: 700, color: COLORS.frost, margin: 0 }}>
            Visa Applications
          </h1>
          <p style={{ fontFamily: FONTS.body, color: COLORS.muted, fontSize: '13px', margin: '4px 0 0' }}>
            Crew immigration pipeline
          </p>
        </div>
        <button
          onClick={() => navigate({ to: '/crew-immigration/visas/new' })}
          style={{
            background: COLORS.signal,
            color: COLORS.void,
            fontFamily: FONTS.display,
            fontWeight: 700,
            fontSize: '13px',
            padding: '8px 18px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          + New Application
        </button>
      </div>

      {/* Pipeline Status Bar */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        flexWrap: 'wrap',
      }}>
        {ALL_STATUSES.map(status => {
          const isActive = activeFilter === status
          const sc = STATUS_COLORS[status]
          return (
            <button
              key={status}
              onClick={() => setActiveFilter(isActive ? null : status)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${isActive ? sc.text : COLORS.deep}`,
                background: isActive ? sc.bg : COLORS.abyss,
                cursor: 'pointer',
                fontFamily: FONTS.display,
                fontSize: '13px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? sc.text : COLORS.muted,
                transition: 'all 0.15s ease',
              }}
            >
              <span>{STATUS_LABELS[status]}</span>
              <span style={{
                background: isActive ? sc.text : COLORS.ocean,
                color: isActive ? COLORS.void : COLORS.frost,
                fontWeight: 700,
                fontSize: '11px',
                borderRadius: '20px',
                padding: '1px 8px',
                minWidth: '22px',
                textAlign: 'center',
              }}>
                {counts[status]}
              </span>
            </button>
          )
        })}
        {activeFilter && (
          <button
            onClick={() => setActiveFilter(null)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: `1px solid ${COLORS.deep}`,
              background: 'transparent',
              color: COLORS.muted,
              fontFamily: FONTS.display,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Clear filter ×
          </button>
        )}
      </div>

      {/* Compliance Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => setAlertsOpen(o => !o)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderRadius: alertsOpen ? '8px 8px 0 0' : '8px',
              border: `1px solid ${COLORS.warn}44`,
              background: '#200e00',
              color: COLORS.warn,
              fontFamily: FONTS.display,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span>⚠ {alerts.length} compliance alert{alerts.length !== 1 ? 's' : ''} require attention</span>
            <span style={{ fontSize: '11px', opacity: 0.7 }}>{alertsOpen ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {alertsOpen && (
            <div style={{
              border: `1px solid ${COLORS.warn}44`,
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              background: '#180a00',
              padding: '8px',
            }}>
              {alerts.map((a, i) => (
                <ComplianceAlertBanner
                  key={i}
                  alert={a}
                  onResolve={() => setAlerts(prev => prev.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Applications Table */}
      {loading ? (
        <div style={{
          textAlign: 'center',
          color: COLORS.muted,
          fontFamily: FONTS.display,
          padding: '60px 0',
          fontSize: '14px',
        }}>
          Loading applications…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 24px',
          background: COLORS.abyss,
          borderRadius: '12px',
          border: `1px solid ${COLORS.deep}`,
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
          <p style={{ fontFamily: FONTS.display, color: COLORS.frost, fontSize: '15px', fontWeight: 600, margin: '0 0 6px' }}>
            {activeFilter ? `No ${STATUS_LABELS[activeFilter]} applications` : 'No applications yet'}
          </p>
          <p style={{ fontFamily: FONTS.body, color: COLORS.muted, fontSize: '13px', margin: 0 }}>
            {activeFilter
              ? 'Try a different filter or clear to see all applications.'
              : 'Create your first visa application using the button above.'}
          </p>
        </div>
      ) : (
        <div style={{
          background: COLORS.abyss,
          borderRadius: '12px',
          border: `1px solid ${COLORS.deep}`,
          overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 120px 1.5fr 120px 100px',
            padding: '10px 16px',
            background: COLORS.ocean,
            borderBottom: `1px solid ${COLORS.deep}`,
          }}>
            {['Crew', 'Country', 'Status', 'Passport', 'Applied', 'Actions'].map(col => (
              <span key={col} style={{
                fontFamily: FONTS.display,
                fontSize: '11px',
                fontWeight: 700,
                color: COLORS.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {col}
              </span>
            ))}
          </div>

          {/* Rows */}
          {filtered.map((app, idx) => {
            const sc = STATUS_COLORS[app.status] ?? STATUS_COLORS.draft
            const country = getCountryInfo(app.country_code)
            return (
              <div
                key={app.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.5fr 120px 1.5fr 120px 100px',
                  padding: '12px 16px',
                  alignItems: 'center',
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${COLORS.deep}` : 'none',
                  background: idx % 2 === 1 ? `${COLORS.deep}40` : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                {/* Crew */}
                <span style={{ fontFamily: FONTS.display, fontSize: '13px', fontWeight: 600, color: COLORS.frost }}>
                  {getCrewName(app)}
                </span>

                {/* Country */}
                <span style={{ fontFamily: FONTS.display, fontSize: '13px', color: COLORS.frost, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '18px' }}>{country.flag}</span>
                  {country.name}
                </span>

                {/* Status pill */}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  background: sc.bg,
                  color: sc.text,
                  fontFamily: FONTS.display,
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  width: 'fit-content',
                }}>
                  {STATUS_LABELS[app.status]}
                </span>

                {/* Passport */}
                <span style={{ fontFamily: FONTS.body, fontSize: '12px', color: COLORS.muted }}>
                  {app.passport_number ?? '—'}
                </span>

                {/* Applied date */}
                <span style={{ fontFamily: FONTS.body, fontSize: '12px', color: COLORS.muted }}>
                  {formatDate(app.applied_date ?? app.created_at)}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => navigate({ to: `/crew-immigration/visas/${app.id}` as any })}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: `1px solid ${COLORS.ocean}`,
                      background: 'transparent',
                      color: COLORS.signal,
                      fontFamily: FONTS.display,
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => navigate({ to: `/crew-immigration/visas/${app.id}/edit` as any })}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: `1px solid ${COLORS.ocean}`,
                      background: 'transparent',
                      color: COLORS.muted,
                      fontFamily: FONTS.display,
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
