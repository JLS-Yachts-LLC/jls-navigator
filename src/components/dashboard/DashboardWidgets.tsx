/**
 * Optional department dashboard widgets shown on the main dashboard.
 *
 * Each widget declares the feature-flag key of the module it represents, so the
 * dashboard only offers a widget to users who can actually see that module
 * (same gate as the sidebar: beta/live → everyone, dev → dev access only).
 */
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { FileText, LogIn } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { COLORS } from '@/lib/tokens'

const font = "'Space Grotesk', sans-serif"

export interface DashboardWidgetDef {
  key: string
  label: string
  flagKey: string
  Component: React.FC
}

// ── Shared shell ────────────────────────────────────────────────────────────
function WidgetCard({ title, to, icon, children }: { title: string; to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.signal }}>
          {icon}
          <span style={{ fontFamily: font, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.frost }}>{title}</span>
        </div>
        <Link to={to as any} style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: COLORS.signal, textDecoration: 'none' }}>View all →</Link>
      </div>
      {children}
    </div>
  )
}

function Tile({ label, value, color }: { label: string; value: number | null; color?: string }) {
  return (
    <div style={{ background: COLORS.void, border: `1px solid ${COLORS.deep}`, borderRadius: 7, padding: '10px 12px', flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: font, fontSize: 22, fontWeight: 700, color: color ?? COLORS.frost, lineHeight: 1 }}>
        {value ?? <span style={{ fontSize: 13, color: COLORS.steel }}>—</span>}
      </div>
      <div style={{ fontFamily: font, fontSize: 11, color: COLORS.steel, marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    </div>
  )
}

// ── Visa widget ─────────────────────────────────────────────────────────────
function VisaWidget() {
  const [c, setC] = useState<{ total: number; draft: number; submitted: number; approved: number } | null>(null)
  useEffect(() => {
    const db = supabase as any
    const head = (q: any) => q.select('id', { count: 'exact', head: true })
    Promise.all([
      head(db.from('visa_applications')),
      head(db.from('visa_applications')).eq('status', 'draft'),
      head(db.from('visa_applications')).eq('status', 'submitted'),
      head(db.from('visa_applications')).eq('status', 'approved'),
    ]).then(([t, d, s, a]) => setC({
      total: t.count ?? 0, draft: d.count ?? 0, submitted: s.count ?? 0, approved: a.count ?? 0,
    })).catch(() => {})
  }, [])
  return (
    <WidgetCard title="Visa Applications" to="/crew-immigration/visas" icon={<FileText size={14} />}>
      <div style={{ display: 'flex', gap: 10 }}>
        <Tile label="Total" value={c?.total ?? null} />
        <Tile label="Drafts" value={c?.draft ?? null} />
        <Tile label="Submitted" value={c?.submitted ?? null} color={COLORS.signal} />
        <Tile label="Approved" value={c?.approved ?? null} color="#22c55e" />
      </div>
    </WidgetCard>
  )
}

// ── Sign On / Off (SOSO) widget ──────────────────────────────────────────────
function SosoWidget() {
  const [c, setC] = useState<{ onboard: number; signOn30: number; signOff30: number } | null>(null)
  useEffect(() => {
    const db = supabase as any
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
    const head = (q: any) => q.select('id', { count: 'exact', head: true })
    Promise.all([
      head(db.from('crew_signon_events')).eq('event_type', 'sign_on').gte('event_date', since),
      head(db.from('crew_signon_events')).eq('event_type', 'sign_off').gte('event_date', since),
    ]).then(([on, off]) => setC({
      onboard: (on.count ?? 0) - (off.count ?? 0),
      signOn30: on.count ?? 0,
      signOff30: off.count ?? 0,
    })).catch(() => {})
  }, [])
  return (
    <WidgetCard title="Sign On / Off" to="/crew-immigration/sign-on-off" icon={<LogIn size={14} />}>
      <div style={{ display: 'flex', gap: 10 }}>
        <Tile label="Net onboard (30d)" value={c?.onboard ?? null} color={COLORS.signal} />
        <Tile label="Sign-ons (30d)" value={c?.signOn30 ?? null} color="#22c55e" />
        <Tile label="Sign-offs (30d)" value={c?.signOff30 ?? null} color={COLORS.leoAmber} />
      </div>
    </WidgetCard>
  )
}

// ── Registry ──────────────────────────────────────────────────────────────────
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  { key: 'visa', label: 'Visa Applications', flagKey: 'crew-visas',  Component: VisaWidget },
  { key: 'soso', label: 'Sign On / Off',     flagKey: 'crew-signon', Component: SosoWidget },
]
