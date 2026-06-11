import { Link, useLocation } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { DEVELOPER_EMAILS } from '@/lib/leo-access'
import {
  ShieldCheck, Users, Building2, Lock, ScrollText,
} from 'lucide-react'

const ADMIN_NAV = [
  { href: '/admin',               label: 'Admin Panel',   icon: ShieldCheck },
  { href: '/admin/users',         label: 'Users & Roles', icon: Users       },
  { href: '/admin/organisations', label: 'Organisations', icon: Building2   },
  { href: '/admin/permissions',   label: 'Permissions',   icon: Lock        },
  { href: '/admin/audit',         label: 'Audit Log',     icon: ScrollText  },
]

export function AdminSidebarSection() {
  const { user } = useAuth()
  const location = useLocation()

  const email = user?.email?.toLowerCase() ?? ''
  const role: string =
    (user as any)?.app_metadata?.role ??
    (DEVELOPER_EMAILS.includes(email) ? 'global_admin' : '')

  // In dev mode, all authenticated users can access admin UI
  // (API routes still enforce role checks server-side)
  const isDev = import.meta.env.DEV
  if (!isDev && !['global_admin', 'org_admin'].includes(role)) return null

  return (
    <div
      style={{
        margin:       '6px 8px',
        borderRadius: 8,
        border:       '1px solid rgba(232,160,32,0.18)',
        background:   'rgba(232,160,32,0.055)',
        overflow:     'hidden',
      }}
    >
      {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
        const active =
          location.pathname === href ||
          (href !== '/admin' && location.pathname.startsWith(href))

        return (
          <Link
            key={href}
            to={href}
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            8,
              padding:        '6px 10px',
              fontSize:       11,
              color:          active ? '#E8A020' : 'rgba(232,160,32,0.65)',
              background:     active ? 'rgba(232,160,32,0.12)' : 'transparent',
              fontWeight:     active ? 600 : 400,
              fontFamily:     "'Space Grotesk', sans-serif",
              textDecoration: 'none',
              transition:     'background 120ms, color 120ms',
            }}
          >
            <Icon size={13} />
            <span style={{ flex: 1 }}>{label}</span>
            {label === 'Admin Panel' && (
              <span
                style={{
                  fontSize:      8,
                  fontWeight:    700,
                  letterSpacing: '0.15em',
                  background:    'rgba(232,160,32,0.18)',
                  color:         '#E8A020',
                  padding:       '2px 6px',
                  borderRadius:  20,
                }}
              >
                {role === 'global_admin' ? 'GLOBAL' : 'ORG'}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
