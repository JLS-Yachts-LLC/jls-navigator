import { createFileRoute, redirect, Outlet, useLocation } from '@tanstack/react-router'
import { supabase } from '@/integrations/supabase/client'
import { DEVELOPER_EMAILS } from '@/lib/leo-access'
import { COLORS } from '@/lib/tokens'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/admin')({
  beforeLoad: async () => {
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
]

function AdminLayout() {
  const location = useLocation()

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
          {ADMIN_NAV.map(({ to, label }) => {
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
