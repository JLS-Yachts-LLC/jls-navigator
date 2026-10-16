import { createFileRoute, redirect, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/lib/auth'
import { DEVELOPER_EMAILS } from '@/lib/leo-access'
import { COLORS } from '@/lib/tokens'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/admin')({
  beforeLoad: async () => {
    // The sign-in lives in the browser, so the server (which renders a page that is opened directly) can't see it and
    // used to bounce every direct visit to the sign-in page, and from there to the home screen. The check is made here
    // in the browser, and AdminLayout below makes it again for a page that was opened directly.
    if (typeof window === 'undefined') return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: '/auth' })

    // In dev mode, any authenticated session can access admin
    if (import.meta.env.DEV) return

    const email = session.user.email?.toLowerCase() ?? ''
    const role  = session.user.app_metadata?.role ??
                  (DEVELOPER_EMAILS.includes(email) ? 'global_admin' : null)

    if (!['global_admin', 'org_admin'].includes(role)) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: AdminLayout,
})

const ADMIN_NAV = [
  { to: '/admin/users',         label: 'Users & Roles' },
  { to: '/admin/organisations', label: 'Organisations' },
  { to: '/admin/permissions',   label: 'Permissions' },
  { to: '/admin/audit',         label: 'Audit Log' },
  // Who is and isn't using Polaris — global admins only (the report refuses anyone else).
  { to: '/admin/usage',         label: 'Usage', globalOnly: true },
  { to: '/admin/shipsync-compare', label: 'Power App vs Polaris' },
  { to: '/admin/shrink-photos',   label: 'Shrink Old Photos' },
]

function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  // Same rule as beforeLoad: a global/org admin, or a developer account (or any signed-in user in dev mode).
  const email = user?.email?.toLowerCase() ?? ''
  const role: string | null = (user as any)?.app_metadata?.role ?? (DEVELOPER_EMAILS.includes(email) ? 'global_admin' : null)
  const allowed = import.meta.env.DEV ? !!user : !!user && !!role && ['global_admin', 'org_admin'].includes(role)

  useEffect(() => {
    if (loading) return
    if (!user) navigate({ to: '/auth' })
    else if (!allowed) navigate({ to: '/dashboard' })
  }, [loading, user, allowed, navigate])

  if (loading || !allowed) return <div style={{ background: COLORS.void, minHeight: '100%' }} />

  return (
    <div style={{ background: COLORS.void, minHeight: '100%' }}>
      {/* Admin topbar */}
      <div
        style={{
          borderBottom:   `1px solid ${COLORS.deep}`,
          padding:        '10px 24px',
          display:        'flex',
          alignItems:     'center',
          gap:            12,
          background:     COLORS.abyss,
        }}
      >
        <span style={{ color: COLORS.leoAmber, fontSize: 16, lineHeight: 1 }}>⬡</span>
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize:   14,
            fontWeight: 700,
            color:      COLORS.frost,
          }}
        >
          Admin Panel
        </span>

        {/* Sub-nav */}
        <nav style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
          {ADMIN_NAV.filter((n) => !('globalOnly' in n) || role === 'global_admin' || import.meta.env.DEV).map(({ to, label }) => {
            const isActive = location.pathname === to || location.pathname.startsWith(to + '/')
            return (
              <Link
                key={to}
                to={to as any}
                style={{ textDecoration: 'none' }}
              >
                <span
                  style={{
                    fontFamily:   "'Space Grotesk', sans-serif",
                    fontSize:     11,
                    fontWeight:   isActive ? 600 : 400,
                    color:        isActive ? COLORS.leoAmber : COLORS.muted,
                    padding:      '4px 10px',
                    borderRadius: 5,
                    background:   isActive ? 'rgba(232,160,32,0.10)' : 'transparent',
                    display:      'inline-block',
                    transition:   'all 120ms',
                  }}
                >
                  {label}
                </span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div style={{ padding: '20px 24px' }}>
        <Outlet />
      </div>
    </div>
  )
}
