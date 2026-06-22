import { useState } from 'react'
import { UserRow } from './UserRow'
import { InviteUserModal } from './InviteUserModal'
import type { UserRole, RoleOption } from '@/lib/admin/types'

interface Props {
  users: UserRole[]
  total: number
  roles: RoleOption[]
  onRefresh: () => void
}

export function UserTable({ users, total, roles, onRefresh }: Props) {
  const [inviteOpen,  setInviteOpen]  = useState(false)
  const [search,      setSearch]      = useState('')
  const [roleFilter,  setRoleFilter]  = useState('')

  const roleOptions = [{ value: '', label: 'All roles' },
    ...roles.map(r => ({ value: r.name, label: r.display_name }))]

  const filtered = users.filter(u => {
    const email = ((u as any).user?.email ?? u.user_id ?? '').toLowerCase()
    if (search && !email.includes(search.toLowerCase())) return false
    if (roleFilter && u.role !== roleFilter) return false
    return true
  })

  return (
    <div>
      <div className="flex items-center gap-3 p-3 border-b border-border">
        <input
          placeholder="Search by email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5
                     text-xs text-foreground placeholder:text-muted-foreground/60
                     focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5
                     text-xs text-foreground focus:outline-none"
        >
          {roleOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={() => setInviteOpen(true)}
          className="rounded-md bg-cyan-500/10 border border-cyan-500/25 text-cyan-600 dark:text-cyan-400
                     text-xs px-3 py-1.5 hover:bg-cyan-500/20 transition-colors whitespace-nowrap"
        >
          + Invite user
        </button>
      </div>

      <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr className="bg-muted text-muted-foreground text-[9px] font-semibold tracking-wider">
            <th className="text-left px-3 py-2 w-52">User</th>
            <th className="text-left px-3 py-2 w-28">Role</th>
            <th className="text-left px-3 py-2 w-28">Scope</th>
            <th className="text-left px-3 py-2 w-20">Status</th>
            <th className="text-center px-3 py-2 w-12">MFA</th>
            <th className="text-left px-3 py-2 w-24">Last seen</th>
            <th className="text-left px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                {search || roleFilter ? 'No users match the current filter.' : 'No users yet.'}
              </td>
            </tr>
          ) : (
            filtered.map(u => (
              <UserRow key={u.id} userRole={u} roles={roles} onRefresh={onRefresh} />
            ))
          )}
        </tbody>
      </table>

      <div className="px-3 py-2 border-t border-border">
        <span className="text-[10px] text-muted-foreground">{total} total users</span>
      </div>

      {inviteOpen && (
        <InviteUserModal
          roles={roles}
          onClose={() => setInviteOpen(false)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  )
}
