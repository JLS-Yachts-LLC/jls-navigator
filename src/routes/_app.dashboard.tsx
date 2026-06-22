import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { getAccessLevel, ACCESS_LABELS } from '@/lib/leo-access'
import { LeoPanel } from '@/components/leo/LeoPanel'
import { LeoChat } from '@/components/leo/LeoChat'
import { COLORS } from '@/lib/tokens'
import { createClient } from '@supabase/supabase-js'
import { Ship, AlertTriangle, ClipboardList, FileSignature } from 'lucide-react'

export const Route = createFileRoute('/_app/dashboard')({
  component: DashboardPage,
  head: () => ({ meta: [{ title: 'Dashboard — Polaris' }] }),
})

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
    const url = import.meta.env.VITE_SUPABASE_URL
    const key  = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) return

    const sb    = createClient(url, key)
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
