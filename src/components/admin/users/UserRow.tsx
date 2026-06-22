import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { RoleBadge } from './RoleBadge'
import { EditRoleModal } from './EditRoleModal'
import type { UserRole, RoleOption } from '@/lib/admin/types'

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 60)   return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

interface Props {
  userRole: UserRole
  roles: RoleOption[]
  onRefresh: () => void
}

const STATUS_META: Record<string, { dot: string; label: string; text: string }> = {
  active:    { dot: 'bg-emerald-500', label: 'active',    text: 'text-muted-foreground' },
  invited:   { dot: 'bg-amber-500',   label: 'invited',   text: 'text-amber-600 dark:text-amber-400' },
  suspended: { dot: 'bg-red-500',     label: 'suspended', text: 'text-muted-foreground' },
}

export function UserRow({ userRole, roles, onRefresh }: Props) {
  const { session } = useAuth()
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState('')

  const email      = (userRole as any).user?.email ?? userRole.user_id
  const lastSeen   = (userRole as any).user?.last_sign_in_at ?? null
  const hasMFA     = ((userRole as any).mfa_factors ?? []).some((f: any) => f.status === 'verified')
  const status     = userRole.status ?? (userRole.is_active ? 'active' : 'suspended')
  const statusMeta = STATUS_META[status] ?? STATUS_META.active
  const scopeLabel = userRole.vessel_id
    ? 'vessel-scoped'
    : userRole.org_id
    ? 'org-scoped'
    : 'global'

  async function act(action: 'suspend' | 'unsuspend' | 'reset_password' | 'resend_invite', okMsg?: string) {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(`/api/admin/users/${userRole.id}`, {
        method:  'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${(session as any)?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(j.error ?? 'Failed'); return }
      if (okMsg) { setMsg(okMsg); setTimeout(() => setMsg(''), 4000) }
      if (action === 'suspend' || action === 'unsuspend') onRefresh()
    } catch {
      setMsg('Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/40 transition-colors">
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                            bg-muted text-[9px] font-bold text-muted-foreground">
              {email.slice(0, 2).toUpperCase()}
            </div>
            <span className="truncate text-[11px] text-foreground">{email}</span>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <RoleBadge role={userRole.role} />
        </td>
        <td className="px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">{scopeLabel}</span>
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 ${statusMeta.dot}`} />
          <span className={`text-[10px] ${statusMeta.text}`}>{statusMeta.label}</span>
        </td>
        <td className="px-3 py-2.5 text-center">
          {hasMFA ? (
            <span className="text-[10px] text-emerald-400">✓</span>
          ) : (
            <span className="text-[10px] text-red-400">✗</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">{relativeTime(lastSeen)}</span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => setEditOpen(true)}
              className="rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:text-amber-500
                         hover:bg-amber-500/10 transition-colors"
            >
              Role
            </button>
            {status === 'invited' && (
              <button
                onClick={() => act('resend_invite', 'Invite re-sent')}
                disabled={busy}
                className="rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:text-cyan-500
                           hover:bg-cyan-500/10 transition-colors disabled:opacity-30"
              >
                Resend invite
              </button>
            )}
            <button
              onClick={() => act('reset_password', 'Reset email sent')}
              disabled={busy}
              className="rounded px-1.5 py-0.5 text-[9px] text-white/40 hover:text-cyan-400
                         hover:bg-cyan-500/10 transition-colors disabled:opacity-30"
            >
              Reset password
            </button>
            <button
              onClick={() => act(userRole.is_active ? 'suspend' : 'unsuspend')}
              disabled={busy}
              className="rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:text-red-500
                         hover:bg-red-500/10 transition-colors disabled:opacity-30"
            >
              {userRole.is_active ? 'Suspend' : 'Restore'}
            </button>
            {msg && <span className="text-[9px] text-cyan-600 dark:text-cyan-400">{msg}</span>}
          </div>
        </td>
      </tr>

      {editOpen && (
        <EditRoleModal
          userRole={userRole}
          roles={roles}
          onClose={() => setEditOpen(false)}
          onSuccess={onRefresh}
        />
      )}
    </>
  )
}
