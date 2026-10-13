import { Link, useLocation } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { DEVELOPER_EMAILS } from '@/lib/leo-access'
import { useState } from 'react'
import {
  ShieldCheck, Users, Building2, Lock, ScrollText, ChevronRight, GitCompare, ImageDown,
} from 'lucide-react'

const ADMIN_NAV = [
  { href: '/admin',               label: 'Admin Panel',   icon: ShieldCheck },
  { href: '/admin/users',         label: 'Users & Roles', icon: Users       },
  { href: '/admin/organisations', label: 'Organisations', icon: Building2   },
  { href: '/admin/permissions',   label: 'Permissions',   icon: Lock        },
  { href: '/admin/audit',         label: 'Audit Log',     icon: ScrollText  },
  { href: '/admin/shipsync-compare', label: 'Power App vs Polaris', icon: GitCompare },
  { href: '/admin/shrink-photos',    label: 'Shrink Old Photos',    icon: ImageDown  },
]

export function AdminSidebarSection() {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const email = user?.email?.toLowerCase() ?? ''
  const role: string =
    (user as any)?.app_metadata?.role ??
    (DEVELOPER_EMAILS.includes(email) ? 'global_admin' : '')

  const isDev = import.meta.env.DEV
  if (!isDev && !['global_admin', 'org_admin'].includes(role)) return null

  const anyActive = ADMIN_NAV.some(({ href }) =>
    location.pathname === href ||
    (href !== '/admin' && location.pathname.startsWith(href))
  )

  return (
    <div
      style={{
        margin:       '6px 8px',
        borderRadius: 8,
        border:       '1px solid rgba(232,160,32,0.18)',
        background:   'rgba(232,160,32,0.055)',
      }}
    >
      {/* Header row — always visible, click to toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display:         'flex',
          alignItems:      'center',
          gap:             8,
          width:           '100%',
          padding:         '6px 10px',
          fontSize:        11,
          fontWeight:      700,
          fontFamily:      "'Space Grotesk', sans-serif",
          color:           anyActive || open ? '#E8A020' : 'rgba(232,160,32,0.65)',
          background:      'transparent',
          border:          'none',
          cursor:          'pointer',
          textAlign:       'left',
          transition:      'color 120ms',
        }}
      >
        <ShieldCheck size={13} />
        <span style={{ flex: 1 }}>Admin Panel</span>
        <span
          style={{
            fontSize:      8,
            fontWeight:    700,
            letterSpacing: '0.15em',
            background:    'rgba(232,160,32,0.18)',
            color:         '#E8A020',
            padding:       '2px 6px',
            borderRadius:  20,
            marginRight:   4,
          }}
        >
          {role === 'global_admin' ? 'GLOBAL' : 'ORG'}
        </span>
        <ChevronRight
          size={12}
          style={{
            opacity:    0.5,
            transform:  open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 180ms ease',
          }}
        />
      </button>

      {/* Collapsible nav items */}
      <div
        style={{
          display:        'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition:     'grid-template-rows 180ms ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          {ADMIN_NAV.slice(1).map(({ href, label, icon: Icon }) => {
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
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
