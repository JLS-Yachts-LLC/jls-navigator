import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { getAccessLevel, ACCESS_LABELS } from '@/lib/leo-access'
import { LeoPanel } from '@/components/leo/LeoPanel'
import { LeoChat } from '@/components/leo/LeoChat'
import { COLORS } from '@/lib/tokens'
import { supabase } from '@/integrations/supabase/client'
import { useFlagMap } from '@/lib/release-flags'
import { useDevAccess } from '@/lib/dev-access'
import { DASHBOARD_WIDGETS } from '@/components/dashboard/DashboardWidgets'
import { Ship, AlertTriangle, ClipboardList, FileSignature, LayoutGrid, Check } from 'lucide-react'

export const Route = createFileRoute('/_app/dashboard')({
  // The legacy dashboard is retired — /dashboard lands on the Polaris home.
  component: () => <Navigate to="/polaris-redesign" replace />,
  head: () => ({ meta: [{ title: 'Dashboard — Polaris' }] }),
})

// The legacy dashboard component below is kept for reference but no longer routed.
void DashboardPage

// ── Quick-stats types ──────────────────────────────────────────────────────
interface Stats {
  activeVessels:    number
  criticalPermits:  number
  openTasks:        number
  pendingEsign:     number
}

function useDashboardStats(token: string): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    if (!token) return

    // Reuse the shared singleton — a second browser client clashes on the auth
    // storage key (the "Multiple GoTrueClient" warning + auth-session churn).
    const sb    = supabase
    const today = new Date().toISOString().split('T')[0]
    const in14  = new Date(Date.now() + 14 * 864e5).toISOString().split('T')[0]

    Promise.all([
      (sb as any).from('yachts').select('id', { count: 'exact', head: true }).eq('status', 'Active').eq('archive', false),
      (sb as any).from('permits').select('id', { count: 'exact', head: true }).gte('expiry_date', today).lte('expiry_date', in14).neq('status', 'cancelled'),
      (sb as any).from('orbit_tasks').select('id', { count: 'exact', head: true }).in('status', ['todo', 'in_progress']),
      (sb as any).from('esign_documents').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
    ]).then(([vessels, permits, tasks, esign]) => {
      setStats({
        activeVessels:   vessels.count ?? 0,
        criticalPermits: permits.count ?? 0,
        openTasks:       tasks.count   ?? 0,
        pendingEsign:    esign.count   ?? 0,
      })
    }).catch(() => {})
  }, [token])

  return stats
}

// ── Dashboard page ──────────────────────────────────────────────────────────
function DashboardPage() {
  const { user, session } = useAuth()
  const [briefingText, setBriefingText] = useState<string | null>(null)

  const token       = (session as any)?.access_token ?? ''
  const userEmail   = user?.email ?? ''
  const accessLevel = getAccessLevel(userEmail)
  const stats       = useDashboardStats(token)

  // Optional department widgets — only offered for modules this user can access
  // (same gate as the sidebar: beta/live for everyone, dev for dev access).
  const { map: flagMap } = useFlagMap()
  const devAccess = useDevAccess()
  const canSeeModule = (flagKey: string) => {
    const stage = flagMap.get(flagKey)?.stage ?? 'dev'
    return stage !== 'dev' || devAccess
  }
  const availableWidgets = DASHBOARD_WIDGETS.filter(w => canSeeModule(w.flagKey))

  // Per-user choice of which widgets are shown, persisted locally.
  const storeKey = `polaris.dashboardWidgets.${user?.id ?? 'anon'}`
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([])
  useEffect(() => {
    try { const raw = localStorage.getItem(storeKey); setSelectedWidgets(raw ? JSON.parse(raw) : []) }
    catch { setSelectedWidgets([]) }
  }, [storeKey])
  function toggleWidget(key: string) {
    setSelectedWidgets(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      try { localStorage.setItem(storeKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  const shownWidgets = availableWidgets.filter(w => selectedWidgets.includes(w.key))

  const rawFirst    = (user as any)?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]?.split('.')[0]
    ?? 'there'
  const displayName = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1)

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'

  return (
    <div style={{ background: COLORS.void, minHeight: '100%', paddingBottom: 48 }}>

      {/* ── Top bar ───────────────────────────────────────────── */}
      <div
        style={{
          borderBottom:   `1px solid ${COLORS.deep}`,
          padding:        '18px 28px 14px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily:    "'Space Grotesk', sans-serif",
              fontSize:      22,
              fontWeight:    700,
              color:         COLORS.frost,
              margin:        0,
              letterSpacing: '-0.02em',
            }}
          >
            {greeting}, {displayName}
          </h1>
          <p
            style={{
              fontFamily:    "'Space Grotesk', sans-serif",
              fontSize:      14,
              color:         COLORS.steel,
              margin:        '3px 0 0',
              letterSpacing: '0.06em',
            }}
          >
            {ACCESS_LABELS[accessLevel]} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {availableWidgets.length > 0 && (
          <DashboardCustomiser
            available={availableWidgets}
            selected={selectedWidgets}
            onToggle={toggleWidget}
          />
        )}
      </div>

      <div
        style={{
          maxWidth:      920,
          margin:        '0 auto',
          padding:       '22px 28px 0',
          display:       'flex',
          flexDirection: 'column' as const,
          gap:           18,
        }}
      >
        {/* ── Quick stats ───────────────────────────────────── */}
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap:                 12,
          }}
        >
          <StatCard
            icon={<Ship size={14} />}
            label="Active Vessels"
            value={stats?.activeVessels}
            to="/yachts"
            color={COLORS.signal}
          />
          <StatCard
            icon={<AlertTriangle size={14} />}
            label="Critical Permits"
            value={stats?.criticalPermits}
            to="/permits/command-centre"
            color={stats?.criticalPermits ? COLORS.warn : COLORS.signal}
            urgent={!!stats?.criticalPermits}
          />
          <StatCard
            icon={<ClipboardList size={14} />}
            label="Open Tasks"
            value={stats?.openTasks}
            to="/orbit"
            color={COLORS.signal}
          />
          <StatCard
            icon={<FileSignature size={14} />}
            label="Awaiting Signature"
            value={stats?.pendingEsign}
            to="/esign"
            color={stats?.pendingEsign ? COLORS.leoAmber : COLORS.signal}
          />
        </div>

        {/* ── Optional department widgets ───────────────────── */}
        {shownWidgets.map(w => (
          <w.Component key={w.key} />
        ))}

        {/* ── Leo briefing ──────────────────────────────────── */}
        {token && (
          <LeoPanel
            token={token}
            userName={displayName}
            onReady={(text) => setBriefingText(text)}
          />
        )}

        {/* ── Chat (appears after briefing) ─────────────────── */}
        {briefingText !== null && token && (
          <LeoChat
            token={token}
            userName={displayName}
            briefingText={briefingText}
          />
        )}
      </div>
    </div>
  )
}

// ── Dashboard customiser dropdown ───────────────────────────────────────────
function DashboardCustomiser({
  available, selected, onToggle,
}: {
  available: { key: string; label: string }[]
  selected: string[]
  onToggle: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 8,
          color: COLORS.frost, fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600,
          padding: '8px 14px', cursor: 'pointer',
        }}
      >
        <LayoutGrid size={15} /> Customise
        {selected.length > 0 && (
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, color: COLORS.signal, background: `${COLORS.signal}1a`, borderRadius: 10, padding: '1px 7px' }}>{selected.length}</span>
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40, width: 260,
          background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 10,
          boxShadow: '0 10px 34px -10px rgba(0,0,0,0.6)', padding: 8,
        }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLORS.steel, padding: '6px 8px 8px' }}>
            Show dashboards
          </div>
          {available.map(w => {
            const on = selected.includes(w.key)
            return (
              <button
                key={w.key}
                type="button"
                onClick={() => onToggle(w.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '8px 8px', borderRadius: 7, color: COLORS.frost,
                  fontFamily: "'Space Grotesk', sans-serif", fontSize: 13,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = `${COLORS.signal}12`)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: on ? COLORS.signal : 'transparent',
                  border: `1.5px solid ${on ? COLORS.signal : COLORS.steel}`,
                  color: COLORS.void,
                }}>{on && <Check size={12} strokeWidth={3} />}</span>
                {w.label}
              </button>
            )
          })}
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: COLORS.steel, padding: '8px 8px 4px', lineHeight: 1.5 }}>
            Only dashboards you have access to are listed.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, to, color, urgent,
}: {
  icon:    React.ReactNode
  label:   string
  value?:  number
  to:      string
  color:   string
  urgent?: boolean
}) {
  return (
    <Link
      to={to}
      style={{
        background:   COLORS.abyss,
        border:       urgent
          ? `1px solid rgba(232,112,32,0.40)`
          : `1px solid ${COLORS.deep}`,
        borderRadius: 7,
        padding:      '12px 14px',
        display:      'flex',
        flexDirection:'column' as const,
        gap:          8,
        textDecoration: 'none',
        transition:   'border-color 150ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color }}>
        {icon}
        <span
          style={{
            fontFamily:    "'Space Grotesk', sans-serif",
            fontSize:      14,
            fontWeight:    700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            color:         COLORS.steel,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize:   28,
          fontWeight: 700,
          color:      urgent ? COLORS.warn : COLORS.frost,
          lineHeight: 1,
        }}
      >
        {value ?? (
          <span style={{ fontSize: 14, color: COLORS.steel }}>—</span>
        )}
      </div>
    </Link>
  )
}
