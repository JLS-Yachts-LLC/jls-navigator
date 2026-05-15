import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect, useCallback } from 'react'
import {
  Users, Shield, Plus, RotateCcw, Trash2, ChevronDown,
  CheckCircle2, XCircle, Loader2, Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

// ─── Types ───────────────────────────────────────────────────────────────────

type AppRole = 'admin' | 'manager' | 'user'

type UserRecord = {
  id: string
  email: string
  displayName: string | null
  role: AppRole
  mfaEnabled: boolean
  invited: boolean
  lastSignIn: string | null
  createdAt: string
  factorIds: string[]
}

type DeptPerm = {
  department: string
  module: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
}

// ─── Server functions ─────────────────────────────────────────────────────────

const getUsers = createServerFn({ method: 'GET' }).handler(async (): Promise<UserRecord[]> => {
  const [{ data: auth, error }, { data: roles }, { data: profiles }] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    supabaseAdmin.from('user_roles').select('user_id, role'),
    supabaseAdmin.from('profiles').select('id, display_name'),
  ])
  if (error) throw new Error(error.message)
  return (auth?.users ?? []).map((u: any) => ({
    id: u.id,
    email: u.email ?? '',
    displayName: profiles?.find((p: any) => p.id === u.id)?.display_name ?? null,
    role: (roles?.find((r: any) => r.user_id === u.id)?.role ?? 'user') as AppRole,
    mfaEnabled: (u.factors?.length ?? 0) > 0,
    invited: !u.last_sign_in_at,
    lastSignIn: u.last_sign_in_at ?? null,
    createdAt: u.created_at,
    factorIds: (u.factors ?? []).map((f: any) => f.id),
  }))
})

const doInviteUser = createServerFn({ method: 'POST' })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email)
    if (error) throw new Error(error.message)
  })

const doResetPassword = createServerFn({ method: 'POST' })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email)
    if (error) throw new Error(error.message)
  })

const doSetRole = createServerFn({ method: 'POST' })
  .validator((d: { userId: string; role: AppRole }) => d)
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from('user_roles').select('id').eq('user_id', data.userId).maybeSingle()
    const { error } = existing
      ? await supabaseAdmin.from('user_roles').update({ role: data.role }).eq('user_id', data.userId)
      : await supabaseAdmin.from('user_roles').insert({ user_id: data.userId, role: data.role })
    if (error) throw new Error(error.message)
  })

const doDeleteUser = createServerFn({ method: 'POST' })
  .validator((d: { userId: string }) => d)
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId)
    if (error) throw new Error(error.message)
  })

const doDisableMFA = createServerFn({ method: 'POST' })
  .validator((d: { userId: string; factorIds: string[] }) => d)
  .handler(async ({ data }) => {
    for (const factorId of data.factorIds) {
      const res = await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/admin/users/${data.userId}/factors/${factorId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
          },
        },
      )
      if (!res.ok) throw new Error(`Failed to remove MFA factor: ${res.statusText}`)
    }
  })

const getPerms = createServerFn({ method: 'GET' }).handler(async (): Promise<DeptPerm[]> => {
  const { data } = await (supabaseAdmin as any)
    .from('department_permissions')
    .select('department, module, can_view, can_create, can_edit')
  return data ?? []
})

const savePerms = createServerFn({ method: 'POST' })
  .validator((d: DeptPerm[]) => d)
  .handler(async ({ data }) => {
    const { error } = await (supabaseAdmin as any)
      .from('department_permissions')
      .upsert(data, { onConflict: 'department,module' })
    if (error) throw new Error(error.message)
  })

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
})

const DEPARTMENTS = [
  'Port & Operations',
  'Logistics',
  'Crew Cab',
  'Orbit',
  'Accounts',
  'Marketing',
  'Packages & Deliveries',
  'Director',
  'Management',
]

const MODULES = [
  'Yachts',
  'Permits',
  'Small Boat Registration',
  'Orbit',
  'Crew Cab',
  'Packages & Deliveries',
  'Director',
]

function SettingsPage() {
  const [tab, setTab] = useState<'users' | 'permissions'>('users')

  return (
    <div className="flex h-full">
      <nav className="w-52 shrink-0 border-r border-border bg-muted/30 p-4 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-2">
          Settings
        </p>
        {([
          { key: 'users', label: 'Users', Icon: Users },
          { key: 'permissions', label: 'Permissions', Icon: Shield },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 w-full rounded-md px-2.5 py-2 text-sm transition ${
              tab === key
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-foreground/70 hover:bg-accent'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto">
        {tab === 'users' ? <UsersPanel /> : <PermissionsPanel />}
      </div>
    </div>
  )
}

// ─── Users Panel ──────────────────────────────────────────────────────────────

function UsersPanel() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setUsers(await getUsers())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    try {
      setInviting(true)
      await doInviteUser({ data: { email: inviteEmail.trim() } })
      setInviteEmail('')
      setShowInvite(false)
      await loadUsers()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setInviting(false)
    }
  }

  const handleResetPassword = async (email: string) => {
    if (!confirm(`Send password reset email to ${email}?`)) return
    try {
      setActionLoading('reset-' + email)
      await doResetPassword({ data: { email } })
      alert('Password reset email sent.')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to send reset')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRoleChange = async (userId: string, role: AppRole) => {
    try {
      setActionLoading('role-' + userId)
      await doSetRole({ data: { userId, role } })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update role')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDisableMFA = async (user: UserRecord) => {
    if (!confirm(`Disable MFA for ${user.email}?`)) return
    try {
      setActionLoading('mfa-' + user.id)
      await doDisableMFA({ data: { userId: user.id, factorIds: user.factorIds } })
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, mfaEnabled: false, factorIds: [] } : u))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to disable MFA')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemove = async (user: UserRecord) => {
    if (!confirm(`Permanently remove ${user.email}? This cannot be undone.`)) return
    try {
      setActionLoading('del-' + user.id)
      await doDeleteUser({ data: { userId: user.id } })
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to remove user')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage access, invitations and security</p>
        </div>
        <Button size="sm" onClick={() => setShowInvite(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Invite User
        </Button>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Invite User</h2>
            <p className="text-sm text-muted-foreground">
              An invitation email will be sent. The user must accept to gain access.
            </p>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              placeholder="user@example.com"
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => { setShowInvite(false); setInviteEmail('') }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Send Invite
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">MFA</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last seen</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              )}
              {users.map(user => (
                <UserRow
                  key={user.id}
                  user={user}
                  isLoading={
                    actionLoading === 'role-' + user.id ||
                    actionLoading === 'mfa-' + user.id ||
                    actionLoading === 'del-' + user.id ||
                    actionLoading === 'reset-' + user.email
                  }
                  onResetPassword={() => handleResetPassword(user.email)}
                  onRoleChange={role => handleRoleChange(user.id, role)}
                  onDisableMFA={() => handleDisableMFA(user)}
                  onRemove={() => handleRemove(user)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const ROLE_STYLES: Record<AppRole, string> = {
  admin: 'bg-red-500/15 text-red-400 border-red-500/20',
  manager: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  user: 'bg-muted text-muted-foreground border-border',
}

function UserRow({
  user, isLoading, onResetPassword, onRoleChange, onDisableMFA, onRemove,
}: {
  user: UserRecord
  isLoading: boolean
  onResetPassword: () => void
  onRoleChange: (r: AppRole) => void
  onDisableMFA: () => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const initials = (user.displayName ?? user.email).slice(0, 2).toUpperCase()

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{user.displayName ?? user.email}</div>
            {user.displayName && (
              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${ROLE_STYLES[user.role]}`}>
          {user.role}
        </span>
      </td>
      <td className="px-4 py-3">
        {user.mfaEnabled ? (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> On
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <XCircle className="h-3.5 w-3.5" /> Off
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {user.invited ? (
          <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
            Invited
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
            Active
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {user.lastSignIn ? new Date(user.lastSignIn).toLocaleDateString() : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="relative flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setOpen(v => !v)}
            disabled={isLoading}
          >
            {isLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-8 z-20 w-52 rounded-lg border border-border bg-popover shadow-xl py-1">
                <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Change Role
                </p>
                {(['admin', 'manager', 'user'] as AppRole[]).map(role => (
                  <button
                    key={role}
                    onClick={() => { onRoleChange(role); setOpen(false) }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent capitalize ${user.role === role ? 'text-primary font-medium' : ''}`}
                  >
                    {role}
                    {user.role === role && <CheckCircle2 className="h-3.5 w-3.5 ml-auto" />}
                  </button>
                ))}

                <div className="my-1 border-t border-border" />

                <button
                  onClick={() => { onResetPassword(); setOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Send Password Reset
                </button>

                {user.mfaEnabled && (
                  <button
                    onClick={() => { onDisableMFA(); setOpen(false) }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    <Lock className="h-3.5 w-3.5" /> Disable MFA
                  </button>
                )}

                <div className="my-1 border-t border-border" />

                <button
                  onClick={() => { onRemove(); setOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove User
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Permissions Panel ────────────────────────────────────────────────────────

function PermissionsPanel() {
  const [perms, setPerms] = useState<DeptPerm[]>([])
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getPerms()
      .then(setPerms)
      .finally(() => setLoading(false))
  }, [])

  const getPerm = (dept: string, mod: string): DeptPerm =>
    perms.find(p => p.department === dept && p.module === mod) ?? {
      department: dept, module: mod, can_view: false, can_create: false, can_edit: false,
    }

  const toggle = (dept: string, mod: string, field: keyof Pick<DeptPerm, 'can_view' | 'can_create' | 'can_edit'>) => {
    setPerms(prev => {
      const idx = prev.findIndex(p => p.department === dept && p.module === mod)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], [field]: !next[idx][field] }
        return next
      }
      return [...prev, { department: dept, module: mod, can_view: false, can_create: false, can_edit: false, [field]: true }]
    })
    setSaved(false)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const allPerms = DEPARTMENTS.flatMap(dept => MODULES.map(mod => getPerm(dept, mod)))
      await savePerms({ data: allPerms })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Department Permissions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control which modules each department can access
          </p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="min-w-[110px]">
          {saving
            ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            : saved
              ? <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-400" />
              : null}
          {saved ? 'Saved' : 'Save Changes'}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex gap-5 h-[calc(100vh-200px)]">
          {/* Department list */}
          <div className="w-52 shrink-0 rounded-xl border border-border overflow-auto">
            {DEPARTMENTS.map((dept, i) => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`w-full text-left px-3.5 py-2.5 text-sm transition ${
                  i < DEPARTMENTS.length - 1 ? 'border-b border-border' : ''
                } ${
                  selectedDept === dept
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'hover:bg-muted/50 text-foreground/80'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>

          {/* Module permission grid */}
          <div className="flex-1 rounded-xl border border-border overflow-auto">
            <div className="grid grid-cols-4 gap-4 bg-muted/40 border-b border-border px-5 py-3 sticky top-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Module</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">View</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Create</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Edit</span>
            </div>

            {MODULES.map((mod, i) => {
              const perm = getPerm(selectedDept, mod)
              return (
                <div
                  key={mod}
                  className={`grid grid-cols-4 gap-4 items-center px-5 py-3.5 border-b border-border last:border-0 ${
                    i % 2 === 1 ? 'bg-muted/20' : ''
                  }`}
                >
                  <span className="text-sm font-medium">{mod}</span>
                  {(['can_view', 'can_create', 'can_edit'] as const).map(field => (
                    <div key={field} className="flex justify-center">
                      <button
                        onClick={() => toggle(selectedDept, mod, field)}
                        className={`h-5 w-5 rounded border transition-all ${
                          perm[field]
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-border bg-background hover:border-primary/50'
                        }`}
                        aria-label={`${field} for ${mod}`}
                      >
                        {perm[field] && (
                          <svg viewBox="0 0 12 12" fill="none" className="h-full w-full p-0.5">
                            <path
                              d="M2 6l3 3 5-5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
