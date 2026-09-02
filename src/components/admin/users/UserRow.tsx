import { useState } from 'react'
import { ModuleAccessModal } from './ModuleAccessModal'
import { useAuth } from '@/lib/auth'
import { RoleBadge } from './RoleBadge'
import { EditRoleModal } from './EditRoleModal'
import { EditNameModal } from './EditNameModal'
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
  departments?: { slug: string; name: string; description?: string | null }[]
  onRefresh: () => void
}

const STATUS_META: Record<string, { dot: string; label: string; text: string }> = {
  active:    { dot: 'bg-emerald-500', label: 'active',    text: 'text-muted-foreground' },
  invited:   { dot: 'bg-amber-500',   label: 'invited',   text: 'text-amber-600 dark:text-amber-400' },
  suspended: { dot: 'bg-red-500',     label: 'suspended', text: 'text-muted-foreground' },
}

export function UserRow({ userRole, roles, departments = [], onRefresh }: Props) {
  const { session } = useAuth()
  const [editOpen, setEditOpen] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)
  const [modulesOpen, setModulesOpen] = useState(false)
  // Department drives which modules the person sees (via department_permissions),
  // so it is set right here on the row rather than only at invite time.
  const [dept, setDept] = useState<string>((userRole as any).department ?? '')
  const [deptBusy, setDeptBusy] = useState(false)
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState('')

  const email      = (userRole as any).user?.email ?? userRole.user_id
  const firstName  = (userRole as any).first_name ?? null
  const lastName   = (userRole as any).last_name ?? null
  // The name we show: explicit display name, else first+last, else nothing (the
  // email carries the row on its own).
  const fullName   = [firstName, lastName].filter(Boolean).join(' ').trim()
  const displayName = ((userRole as any).display_name ?? '').trim() || fullName
  // Initials from a real name when we have one — "HA" beats "H." every time.
  const initials = firstName && lastName
    ? (firstName[0] + lastName[0]).toUpperCase()
    : displayName
      ? displayName.slice(0, 2).toUpperCase()
      : email.slice(0, 2).toUpperCase()
  const lastSeen   = (userRole as any).user?.last_sign_in_at ?? null
  const hasMFA     = ((userRole as any).mfa_factors ?? []).some((f: any) => f.status === 'verified')
  const status     = userRole.status ?? (userRole.is_active ? 'active' : 'suspended')
  const statusMeta = STATUS_META[status] ?? STATUS_META.active
  const scopeLabel = userRole.vessel_id
    ? 'vessel-scoped'
    : userRole.org_id
    ? 'org-scoped'
    : 'global'

  async function remove() {
    if (!confirm(`Delete ${email} permanently? Their login stops working immediately.`)) return
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(`/api/admin/users/${userRole.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${(session as any)?.access_token ?? ''}` },
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(j.error ?? 'Delete failed'); return }
      onRefresh()
    } catch {
      setMsg('Network error')
    } finally {
      setBusy(false)
    }
  }

  /** Move the person to another department — this changes which modules they
   *  can see, so the list is refreshed and their claims re-derive on next load. */
  async function changeDept(next: string) {
    const previous = dept
    setDept(next)
    setDeptBusy(true)
    setMsg('')
    try {
      const res = await fetch(`/api/admin/users/${userRole.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(session as any)?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action: 'department', department: next || null }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setDept(previous); setMsg(j.error ?? 'Could not change department'); return }
      setMsg(next ? 'Department updated' : 'Department cleared')
      setTimeout(() => setMsg(''), 3000)
      onRefresh()
    } catch {
      setDept(previous)
      setMsg('Network error')
    } finally {
      setDeptBusy(false)
    }
  }

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
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                            bg-muted text-[11.5px] font-bold text-muted-foreground">
              {initials}
            </div>
            <div className="min-w-0">
              {displayName ? (
                <>
                  <div className="truncate text-[13px] font-medium text-foreground">{displayName}</div>
                  <div className="truncate text-[11.5px] text-muted-foreground">{email}</div>
                </>
              ) : (
                <span className="truncate text-[13px] text-foreground">{email}</span>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <RoleBadge role={userRole.role} />
        </td>
        <td className="px-3 py-2.5">
          <select
            value={dept}
            disabled={deptBusy}
            onChange={(e) => void changeDept(e.target.value)}
            title="Department decides which modules this person can see"
            className="h-7 w-full max-w-[140px] rounded-md border border-border bg-background px-1.5 text-[12px] text-foreground disabled:opacity-50"
          >
            <option value="">— none —</option>
            {departments.map((d) => (
              <option key={d.slug} value={d.slug}>{d.name}</option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2.5">
          <span className="text-[12px] text-muted-foreground">{scopeLabel}</span>
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 ${statusMeta.dot}`} />
          <span className={`text-[12px] ${statusMeta.text}`}>{statusMeta.label}</span>
        </td>
        <td className="px-3 py-2.5 text-center">
          {hasMFA ? (
            <span className="text-[12px] text-emerald-400">✓</span>
          ) : (
            <span className="text-[12px] text-red-400">✗</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className="text-[12px] text-muted-foreground">{relativeTime(lastSeen)}</span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => setNameOpen(true)}
              title="Display name, first and last name"
              className="rounded px-2 py-1 text-[11.5px] text-muted-foreground hover:text-emerald-500
                         hover:bg-emerald-500/10 transition-colors"
            >
              Name
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className="rounded px-2 py-1 text-[11.5px] text-muted-foreground hover:text-amber-500
                         hover:bg-amber-500/10 transition-colors"
            >
              Role
            </button>
            <button
              onClick={() => setModulesOpen(true)}
              title="Which modules this person can see, overriding their department"
              className="rounded px-2 py-1 text-[11.5px] text-muted-foreground hover:text-cyan-500
                         hover:bg-cyan-500/10 transition-colors"
            >
              Modules
            </button>
            {status === 'invited' && (
              <button
                onClick={() => act('resend_invite', 'Invite re-sent')}
                disabled={busy}
                className="rounded px-2 py-1 text-[11.5px] text-muted-foreground hover:text-cyan-500
                           hover:bg-cyan-500/10 transition-colors disabled:opacity-30"
              >
                Resend invite
              </button>
            )}
            <button
              onClick={() => act('reset_password', 'Reset email sent')}
              disabled={busy}
              className="rounded px-2 py-1 text-[11.5px] text-white/40 hover:text-cyan-400
                         hover:bg-cyan-500/10 transition-colors disabled:opacity-30"
            >
              Reset password
            </button>
            <button
              onClick={() => act(userRole.is_active ? 'suspend' : 'unsuspend')}
              disabled={busy}
              className="rounded px-2 py-1 text-[11.5px] text-muted-foreground hover:text-red-500
                         hover:bg-red-500/10 transition-colors disabled:opacity-30"
            >
              {userRole.is_active ? 'Suspend' : 'Restore'}
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="rounded px-2 py-1 text-[11.5px] text-muted-foreground hover:text-red-500
                         hover:bg-red-500/10 transition-colors disabled:opacity-30"
            >
              Delete
            </button>
            {msg && <span className="text-[11.5px] text-cyan-600 dark:text-cyan-400">{msg}</span>}
          </div>
        </td>
      </tr>

      {nameOpen && (
        <EditNameModal
          userRole={userRole as any}
          onClose={() => setNameOpen(false)}
          onSuccess={onRefresh}
        />
      )}
      {editOpen && (
        <EditRoleModal
          userRole={userRole}
          roles={roles}
          onClose={() => setEditOpen(false)}
          onSuccess={onRefresh}
        />
      )}
      {modulesOpen && (
        <ModuleAccessModal
          userId={userRole.user_id}
          email={(userRole as any).user?.email ?? (userRole as any).email ?? userRole.user_id}
          onClose={() => { setModulesOpen(false); onRefresh() }}
        />
      )}
    </>
  )
}
