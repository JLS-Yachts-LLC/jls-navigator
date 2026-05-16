import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Users, Shield, Plus, RotateCcw, Trash2, ChevronDown,
  CheckCircle2, XCircle, Loader2, Lock, Plug, Mail, Pencil, Save, X, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/integrations/supabase/client'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { toast } from 'sonner'

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
  .handler(async (ctx: { data: { email: string } }) => {
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(ctx.data.email)
    if (error) throw new Error(error.message)
  })

const doResetPassword = createServerFn({ method: 'POST' })
  .handler(async (ctx: { data: { email: string } }) => {
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(ctx.data.email)
    if (error) throw new Error(error.message)
  })

const doSetRole = createServerFn({ method: 'POST' })
  .handler(async (ctx: { data: { userId: string; role: AppRole } }) => {
    const { userId, role } = ctx.data
    const { data: existing } = await supabaseAdmin
      .from('user_roles').select('id').eq('user_id', userId).maybeSingle()
    const { error } = existing
      ? await supabaseAdmin.from('user_roles').update({ role }).eq('user_id', userId)
      : await supabaseAdmin.from('user_roles').insert({ user_id: userId, role })
    if (error) throw new Error(error.message)
  })

const doDeleteUser = createServerFn({ method: 'POST' })
  .handler(async (ctx: { data: { userId: string } }) => {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(ctx.data.userId)
    if (error) throw new Error(error.message)
  })

const doDisableMFA = createServerFn({ method: 'POST' })
  .handler(async (ctx: { data: { userId: string; factorIds: string[] } }) => {
    const { userId, factorIds } = ctx.data
    for (const factorId of factorIds) {
      const res = await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/admin/users/${userId}/factors/${factorId}`,
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
  .handler(async (ctx: { data: DeptPerm[] }) => {
    const { error } = await (supabaseAdmin as any)
      .from('department_permissions')
      .upsert(ctx.data, { onConflict: 'department,module' })
    if (error) throw new Error(error.message)
  })

// ─── SharePoint server functions ─────────────────────────────────────────────

import {
  getGraphToken as _getGraphToken,
  resolveSpSite as _resolveSpSite,
  saveSpConfigPatch,
  syncFromSharePoint,
  registerSharePointWebhook,
  renewSharePointWebhook,
} from '@/lib/sharepoint-sync.server'

const doDiscoverSharePointColumns = createServerFn({ method: 'POST' })
  .handler(async (ctx: { data: { listName: string } }) => {
    const { data: row } = await (supabaseAdmin as any)
      .from('integration_settings')
      .select('config')
      .eq('integration_name', 'sharepoint')
      .maybeSingle()
    const cfg: Record<string, any> = row?.config ?? {}
    const { tenant_id, client_id, client_secret, tenant_url, site_url } = cfg
    if (!tenant_id || !client_id || !client_secret || !tenant_url || !site_url) {
      throw new Error('Complete the SharePoint credentials first (Tenant ID, Client ID, Secret, URLs).')
    }
    const token = await _getGraphToken(tenant_id, client_id, client_secret)
    const siteId = await _resolveSpSite(token, tenant_url, site_url)
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${ctx.data.listName}/columns`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json() as Record<string, any>
    if (!data.value) throw new Error(`Could not read list columns: ${data.error?.message ?? 'List not found'}`)
    return (data.value as any[])
      .filter((c: any) => !c.readOnly && c.name !== 'id')
      .map((c: any) => ({ name: c.name as string, displayName: c.displayName as string }))
  })

const doSyncSharePoint = createServerFn({ method: 'POST' })
  .handler(async (ctx: { data: { listName: string; fieldMapping: Record<string, string>; syncTarget: string } }) => {
    await saveSpConfigPatch({
      list_name: ctx.data.listName,
      field_mapping: ctx.data.fieldMapping,
      sync_target: ctx.data.syncTarget,
      delta_token: null,
    })
    const { synced, errors } = await syncFromSharePoint()
    return { synced, errors, total: synced + errors }
  })

const doRegisterWebhook = createServerFn({ method: 'POST' })
  .handler(async (ctx: { data: { appUrl: string } }) => {
    const notificationUrl = `${ctx.data.appUrl.replace(/\/$/, '')}/sp-hook`
    return registerSharePointWebhook(notificationUrl)
  })

const doRenewWebhook = createServerFn({ method: 'POST' })
  .handler(async () => {
    return renewSharePointWebhook()
  })

const doGetWebhookStatus = createServerFn({ method: 'GET' })
  .handler(async (): Promise<{ subscriptionId: string | null; expiresAt: string | null; daysLeft: number | null }> => {
    const { data: row } = await (supabaseAdmin as any)
      .from('integration_settings')
      .select('config')
      .eq('integration_name', 'sharepoint')
      .maybeSingle()
    const cfg = row?.config ?? {}
    const subId: string | null = cfg.webhook_subscription_id ?? null
    const expiresAt: string | null = cfg.webhook_expires_at ?? null
    let daysLeft: number | null = null
    if (expiresAt) {
      daysLeft = Math.round((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
    }
    return { subscriptionId: subId, expiresAt, daysLeft }
  })

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
  errorComponent: ({ error }) => (
    <div className="p-8 max-w-xl">
      <h2 className="text-lg font-semibold text-destructive mb-2">Settings failed to load</h2>
      <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto whitespace-pre-wrap text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </div>
  ),
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

type SettingsTab = 'users' | 'permissions' | 'integrations' | 'emailTemplates'

function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('users')

  return (
    <div className="flex h-full">
      <nav className="w-52 shrink-0 border-r border-border bg-muted/30 p-4 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-2">
          Settings
        </p>
        {([
          { key: 'users', label: 'Users', Icon: Users },
          { key: 'permissions', label: 'Permissions', Icon: Shield },
          { key: 'integrations', label: 'Integrations', Icon: Plug },
          { key: 'emailTemplates', label: 'Email Templates', Icon: Mail },
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
        {tab === 'users' && <UsersPanel />}
        {tab === 'permissions' && <PermissionsPanel />}
        {tab === 'integrations' && <IntegrationsPanel />}
        {tab === 'emailTemplates' && <EmailTemplatesPanel />}
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
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const initials = (user.displayName ?? user.email).slice(0, 2).toUpperCase()

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen(v => !v)
  }

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
        <div className="flex justify-end">
          <Button
            ref={btnRef}
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleOpen}
            disabled={isLoading}
          >
            {isLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>

          {open && createPortal(
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div
                className="fixed z-50 w-52 rounded-lg border border-border bg-popover shadow-xl py-1"
                style={{ top: pos.top, right: pos.right }}
              >
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
            </>,
            document.body
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

// ─── Integrations Panel ───────────────────────────────────────────────────────

type IntegrationConfig = Record<string, string>

type IntegrationSetting = {
  integration_name: string
  enabled: boolean
  config: IntegrationConfig
}

const INTEGRATIONS: {
  name: string
  key: string
  logo: string
  fields: { key: string; label: string; type?: string; placeholder?: string }[]
}[] = [
  {
    name: 'SharePoint',
    key: 'sharepoint',
    logo: '📁',
    fields: [
      { key: 'tenant_url', label: 'Tenant URL', placeholder: 'https://jlsyachts.sharepoint.com' },
      { key: 'site_url', label: 'Site URL', placeholder: '/sites/PortOperationsandAgency' },
      { key: 'tenant_id', label: 'Tenant ID', placeholder: 'Azure AD Tenant GUID (from portal.azure.com)' },
      { key: 'client_id', label: 'Client ID', placeholder: 'Azure App Registration Client ID' },
      { key: 'client_secret', label: 'Client Secret', type: 'password', placeholder: '••••••••' },
    ],
  },
  {
    name: 'Monday.com',
    key: 'monday',
    logo: '📋',
    fields: [
      { key: 'api_token', label: 'API Token', type: 'password', placeholder: '••••••••' },
      { key: 'board_id', label: 'Board ID', placeholder: 'e.g. 1234567890' },
      { key: 'workspace_id', label: 'Workspace ID', placeholder: 'e.g. 987654' },
    ],
  },
]

function IntegrationsPanel() {
  const [settings, setSettings] = useState<Record<string, IntegrationSetting>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('integration_settings' as never)
      .select('integration_name, enabled, config')
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, IntegrationSetting> = {}
        for (const row of data as IntegrationSetting[]) {
          map[row.integration_name] = row
        }
        setSettings(map)
      })
  }, [])

  function getSetting(key: string): IntegrationSetting {
    return settings[key] ?? { integration_name: key, enabled: false, config: {} }
  }

  function updateField(key: string, field: string, value: string) {
    setSettings(prev => {
      const cur = prev[key] ?? { integration_name: key, enabled: false, config: {} }
      return { ...prev, [key]: { ...cur, config: { ...cur.config, [field]: value } } }
    })
  }

  function toggleEnabled(key: string) {
    setSettings(prev => {
      const cur = prev[key] ?? { integration_name: key, enabled: false, config: {} }
      return { ...prev, [key]: { ...cur, enabled: !cur.enabled } }
    })
  }

  async function handleSave(key: string) {
    const s = getSetting(key)
    setSaving(key)
    const { error } = await (supabase as any)
      .from('integration_settings')
      .upsert(
        { integration_name: s.integration_name, enabled: s.enabled, config: s.config },
        { onConflict: 'integration_name' }
      )
    setSaving(null)
    if (error) { alert(error.message); return }
    setSaved(key)
    setTimeout(() => setSaved(null), 2000)
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Connect third-party services</p>
      </div>

      {INTEGRATIONS.map(({ name, key, logo, fields }) => {
        const s = getSetting(key)
        const isSaving = saving === key
        const isSaved = saved === key
        return (
          <div key={key} className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{logo}</span>
                <div>
                  <div className="font-semibold text-sm">{name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.enabled ? 'Connected' : 'Not connected'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => toggleEnabled(key)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  s.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    s.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {fields.map(f => (
                <div key={f.key} className="grid grid-cols-[140px_1fr] items-center gap-3">
                  <Label className="text-right text-xs">{f.label}</Label>
                  <Input
                    type={f.type ?? 'text'}
                    placeholder={f.placeholder}
                    value={s.config[f.key] ?? ''}
                    onChange={e => updateField(key, f.key, e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={() => handleSave(key)} disabled={isSaving} className="min-w-[80px]">
                  {isSaving
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : isSaved
                      ? <><CheckCircle2 className="h-4 w-4 mr-1.5" />Saved</>
                      : <><Save className="h-4 w-4 mr-1.5" />Save</>}
                </Button>
              </div>
              {key === 'sharepoint' && <SharePointSyncSection />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Email Templates Panel ────────────────────────────────────────────────────

type EmailTemplate = {
  id: string
  name: string
  permit_type: string | null
  subject: string
  body: string
}

const PERMIT_TYPE_OPTIONS = [
  { value: '__all', label: 'All permit types' },
  { value: 'sanitation', label: 'Sanitation' },
  { value: 'exit_entry', label: 'Exit & Entry' },
  { value: 'gate_pass', label: 'Gate Pass' },
  { value: 'cruising_mothership', label: 'Cruising — Mothership' },
  { value: 'cruising_tenders', label: 'Cruising — Tenders' },
  { value: 'navigation_license', label: 'Navigation License' },
  { value: 'tdra', label: 'TDRA' },
  { value: 'dma', label: 'DMA Permits' },
  { value: 'permit_to_work', label: 'Permit to Work' },
  { value: 'boat_registration_update', label: 'Boat Registration Update' },
]

const BOAT_REG_TABLE_HTML = `<table style="border:1px solid #b3adad;padding:8px;border-collapse:collapse;width:100%"><thead><tr><th style="border:1px solid #b3adad;padding:8px;background:#153d63;color:#fff">Phase</th><th style="border:1px solid #b3adad;padding:8px;background:#153d63;color:#fff">Status</th><th style="border:1px solid #b3adad;padding:8px;background:#153d63;color:#fff">Remarks</th></tr></thead><tbody><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Phase 1: Application</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Quotation</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Log-in Creation</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td colspan="3" style="border:1px solid #b3adad;padding:4px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Phase 2: Documents</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Collection</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Submission</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Approval</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td colspan="3" style="border:1px solid #b3adad;padding:4px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Phase 3: Technical Inspection</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Booking the inspection</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Inspection result</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td colspan="3" style="border:1px solid #b3adad;padding:4px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Phase 4: License &amp; Payment</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Marine Craft License</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr><tr><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7;color:#313030">Invoicing</td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td><td style="border:1px solid #b3adad;padding:8px;background:#dae9f7"></td></tr></tbody></table>`

const DEFAULT_TEMPLATES = [
  {
    name: 'Permit to Work',
    permit_type: 'permit_to_work',
    subject: '{{boat_name}} - Permit to Work',
    body: `Dear {{holder_name}},\n\nGreetings from JLS Yachts!\nPlease find the attached approved Permit to Work.\n\nYacht Name: {{boat_name}}\nPermit Duration: {{expiry_date}}\nType of Permit: {{authority}}\nWork Description: {{notes}}\nPermit No.: {{permit_number}}\nExpiry date: {{expiry_date}}\n\nBest Regards,\nJLS Yachts Team`,
  },
  {
    name: 'Boat Registration Update',
    permit_type: 'boat_registration_update',
    subject: '{{boat_name}} - Boat Registration Update',
    body: `Dear {{holder_name}},\n\nGreetings from JLS Yachts!\nPlease find below the current status of your boat registration.\n\nYacht Name: {{boat_name}}\nQuotation No.: {{quotation_number}}\n\n` + BOAT_REG_TABLE_HTML + `\n\nFor any queries please do not hesitate to contact us.\n\nBest Regards,\nJLS Yachts Team`,
  },
]

const MERGE_TAGS = [
  '{{boat_name}}', '{{holder_name}}', '{{expiry_date}}', '{{issue_date}}',
  '{{authority}}', '{{permit_number}}', '{{quotation_number}}', '{{preferred_inspection_date}}',
]

function EmailTemplatesPanel() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<EmailTemplate> | null>(null)
  const [saving, setSaving] = useState(false)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('email_templates' as never)
      .select('*')
      .order('name') as { data: EmailTemplate[] | null }
    setTemplates(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  function startNew() {
    setEditing({ name: '', permit_type: null, subject: '', body: '' })
  }

  async function seedDefaults() {
    for (const tpl of DEFAULT_TEMPLATES) {
      const existing = templates.find(t => t.name === tpl.name)
      if (!existing) {
        await (supabase as any).from('email_templates').insert([tpl])
      }
    }
    await loadTemplates()
    toast.success('Default templates added')
  }

  function startEdit(t: EmailTemplate) {
    setEditing({ ...t })
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return
    await (supabase as any).from('email_templates').delete().eq('id', id)
    await loadTemplates()
  }

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    const payload = {
      name: editing.name,
      permit_type: editing.permit_type === '__all' ? null : editing.permit_type ?? null,
      subject: editing.subject,
      body: editing.body,
    }
    if (editing.id) {
      await (supabase as any).from('email_templates').update(payload).eq('id', editing.id)
    } else {
      await (supabase as any).from('email_templates').insert([payload])
    }
    setSaving(false)
    setEditing(null)
    await loadTemplates()
  }

  const permitLabel = (type: string | null) =>
    PERMIT_TYPE_OPTIONS.find(o => o.value === (type ?? '__all'))?.label ?? type ?? 'All'

  if (editing !== null) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold">{editing.id ? 'Edit' : 'New'} Template</h1>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Template Name</Label>
              <Input
                value={editing.name ?? ''}
                onChange={e => setEditing(prev => ({ ...prev!, name: e.target.value }))}
                placeholder="e.g. Sanitation Pass"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Permit Type</Label>
              <Select
                value={editing.permit_type ?? '__all'}
                onValueChange={v => setEditing(prev => ({ ...prev!, permit_type: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERMIT_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input
              value={editing.subject ?? ''}
              onChange={e => setEditing(prev => ({ ...prev!, subject: e.target.value }))}
              placeholder="e.g. Sanitation Certificate — {{boat_name}}"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea
              rows={10}
              value={editing.body ?? ''}
              onChange={e => setEditing(prev => ({ ...prev!, body: e.target.value }))}
              placeholder="Dear {{holder_name}},&#10;&#10;Your sanitation certificate is attached..."
              className="font-mono text-sm"
            />
          </div>

          <div className="rounded-lg bg-muted/40 border border-border p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Available merge tags</p>
            <div className="flex flex-wrap gap-1.5">
              {MERGE_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setEditing(prev => ({ ...prev!, body: (prev?.body ?? '') + tag }))}
                  className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs text-primary font-mono hover:bg-primary/20 transition"
                >
                  {tag}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Click a tag to insert it at the end of the body.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !editing.name?.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Template
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Email Templates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Templates used when emailing permits. Use merge tags to personalise content.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={seedDefaults} className="gap-1.5">
            Seed Defaults
          </Button>
          <Button size="sm" onClick={startNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Template
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border text-center">
          <Mail className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="font-medium">No templates yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create a template to customise emails sent with permits.</p>
          <Button size="sm" onClick={startNew} className="mt-4 gap-1.5">
            <Plus className="h-4 w-4" /> New Template
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Permit Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subject</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.map(t => (
                <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {permitLabel(t.permit_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">{t.subject}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// --- SharePoint Sync Section ---

const YACHT_DB_FIELDS = [
  { value: '', label: '— Skip —' },
  { value: 'vessel_name', label: 'Vessel Name' },
  { value: 'vessel_type', label: 'Vessel Type' },
  { value: 'flag', label: 'Flag' },
  { value: 'imo_no', label: 'IMO No.' },
  { value: 'official_no', label: 'Official No.' },
  { value: 'port_of_registry', label: 'Port of Registry' },
  { value: 'built_year', label: 'Built Year' },
  { value: 'builders_name', label: 'Builders Name' },
  { value: 'built_place', label: 'Built Place' },
  { value: 'gross_tonnage', label: 'Gross Tonnage' },
  { value: 'net_tonnage', label: 'Net Tonnage' },
  { value: 'length_overall_m', label: 'LOA (m)' },
  { value: 'breadth_m', label: 'Breadth (m)' },
  { value: 'draught_m', label: 'Draught (m)' },
  { value: 'mmsi', label: 'MMSI' },
  { value: 'radio_call_sign', label: 'Radio Call Sign' },
  { value: 'owners_name', label: 'Owner Name' },
  { value: 'owners_nationality', label: 'Owner Nationality' },
  { value: 'company_name', label: 'Company' },
  { value: 'email_address', label: 'Email' },
  { value: 'contact_no', label: 'Contact No.' },
  { value: 'berth', label: 'Berth' },
  { value: 'status', label: 'Status' },
  { value: 'location', label: 'Location' },
  { value: 'eta', label: 'ETA' },
  { value: 'etd', label: 'ETD' },
  { value: 'air_draft_m', label: 'Air Draft (m)' },
  { value: 'max_crew', label: 'Max Crew' },
  { value: 'max_guests', label: 'Max Guests' },
  { value: 'engine', label: 'Engine' },
]

const PERMIT_DB_FIELDS = [
  { value: '', label: '— Skip —' },
  { value: 'permit_number', label: 'Permit Number (match)' },
  { value: 'holder_name', label: 'Holder / Visitor Name' },
  { value: 'contact_email', label: 'Contact Email' },
  { value: 'issuing_authority', label: 'Issuing Authority / Zone' },
  { value: 'issue_date', label: 'Issue / Entry Date' },
  { value: 'expiry_date', label: 'Expiry / Exit Date' },
  { value: 'status', label: 'Status' },
  { value: 'notes', label: 'Notes / Purpose' },
  { value: 'jls_quotation_number', label: 'Quotation Number' },
  { value: 'dma_phase', label: 'DMA Phase' },
  { value: 'license_no', label: 'License No.' },
  { value: 'requested_by', label: 'Requested By' },
  { value: 'preferred_inspection_date', label: 'Inspection Date' },
  { value: 'vessel_name', label: 'Linked Vessel Name' },
]

const SMALL_BOAT_DB_FIELDS = [
  { value: '', label: '— Skip —' },
  { value: 'boat_name', label: 'Boat Name' },
  { value: 'boat_type', label: 'Boat Type' },
  { value: 'reg_type', label: 'Registration Type' },
  { value: 'reg_no', label: 'Registration No.' },
  { value: 'hull_id', label: 'Hull ID' },
  { value: 'color', label: 'Color' },
  { value: 'length_m', label: 'Length (m)' },
  { value: 'engine_type', label: 'Engine Type' },
  { value: 'engine_power_hp', label: 'Engine Power (HP)' },
  { value: 'flag', label: 'Flag' },
  { value: 'port_of_registry', label: 'Port of Registry' },
  { value: 'owner_name', label: 'Owner Name' },
  { value: 'owner_nationality', label: 'Owner Nationality' },
  { value: 'client_email', label: 'Client Email' },
  { value: 'client_phone', label: 'Client Phone' },
  { value: 'status', label: 'Status' },
  { value: 'registration_expiry', label: 'Registration Expiry' },
  { value: 'insurance_expiry', label: 'Insurance Expiry' },
  { value: 'notes', label: 'Notes' },
]

/** Returns the correct App Field dropdown list for a given SharePoint list name */
function getFieldSetForList(listName: string): typeof YACHT_DB_FIELDS {
  const n = listName.toLowerCase().trim()
  if (n.includes('tdra') || n.includes('sanitation') || n.includes('gate') || n.includes('cruising') || n.includes('navigation') || n.includes('dma') || n.includes('permit') || n.includes('exit') || n.includes('entry')) {
    return PERMIT_DB_FIELDS
  }
  if (n.includes('small boat') || n.includes('smallboat') || n.includes('boat reg') || n.includes('boatreg')) {
    return SMALL_BOAT_DB_FIELDS
  }
  // Default: Yachts
  return YACHT_DB_FIELDS
}

/** Per-list auto-suggest for permit fields */
function autoSuggestPermit(displayName: string): string {
  const n = displayName.toLowerCase().replace(/[\s._\-()+#]/g, '')
  const map: Record<string, string> = {
    title: 'holder_name', vesselname: 'vessel_name', yacht: 'vessel_name', boatname: 'vessel_name',
    permitnumber: 'permit_number', permitno: 'permit_number',
    holdername: 'holder_name', visitorname: 'holder_name', name: 'holder_name',
    email: 'contact_email', contactemail: 'contact_email',
    issuingauthority: 'issuing_authority', authority: 'issuing_authority', zone: 'issuing_authority', accesszone: 'issuing_authority',
    issuedate: 'issue_date', dateapplied: 'issue_date', startdate: 'issue_date', entrydate: 'issue_date',
    expirydate: 'expiry_date', expiry: 'expiry_date', exitdate: 'expiry_date', enddate: 'expiry_date',
    status: 'status',
    notes: 'notes', purpose: 'notes', remarks: 'notes',
    quotation: 'jls_quotation_number', quotationno: 'jls_quotation_number', referenceno: 'jls_quotation_number',
    phase: 'dma_phase', dmaphase: 'dma_phase',
    licenseno: 'license_no', licenceno: 'license_no',
    requestedby: 'requested_by',
    inspectiondate: 'preferred_inspection_date', preferredinspectiondate: 'preferred_inspection_date',
  }
  return map[n] ?? ''
}

function autoSuggestSmallBoat(displayName: string): string {
  const n = displayName.toLowerCase().replace(/[\s._\-()+#]/g, '')
  const map: Record<string, string> = {
    title: 'boat_name', boatname: 'boat_name', name: 'boat_name',
    boattype: 'boat_type', type: 'boat_type', vesseltype: 'boat_type',
    regtype: 'reg_type', registrationtype: 'reg_type',
    regno: 'reg_no', registrationno: 'reg_no',
    hullid: 'hull_id', hull: 'hull_id',
    color: 'color', colour: 'color',
    length: 'length_m', lengthinmeters: 'length_m', loa: 'length_m',
    enginetype: 'engine_type', engine: 'engine_type',
    enginepower: 'engine_power_hp', hp: 'engine_power_hp',
    flag: 'flag',
    portofregistry: 'port_of_registry',
    ownername: 'owner_name', owner: 'owner_name',
    ownernationality: 'owner_nationality', nationality: 'owner_nationality',
    email: 'client_email', contactemail: 'client_email',
    phone: 'client_phone', contactno: 'client_phone',
    status: 'status',
    registrationexpiry: 'registration_expiry', regexpiry: 'registration_expiry',
    insuranceexpiry: 'insurance_expiry',
    notes: 'notes', remarks: 'notes',
  }
  return map[n] ?? ''
}

function autoSuggest(displayName: string): string {
  const n = displayName.toLowerCase().replace(/[\s._\-()+#]/g, '')
  const map: Record<string, string> = {
    title: 'vessel_name', vesselname: 'vessel_name',
    vesseltype: 'vessel_type',
    flag: 'flag',
    imono: 'imo_no', imonumber: 'imo_no', imo: 'imo_no',
    officialno: 'official_no', officialnumber: 'official_no',
    portofregistry: 'port_of_registry', registry: 'port_of_registry',
    builtyear: 'built_year', yearbuilt: 'built_year',
    buildersname: 'builders_name', builder: 'builders_name',
    builtplace: 'built_place',
    grosstonnage: 'gross_tonnage', gt: 'gross_tonnage',
    nettonnage: 'net_tonnage', nt: 'net_tonnage',
    loa: 'length_overall_m', lengthoverall: 'length_overall_m',
    lengthoveral: 'length_overall_m', lengthoverallinmeters: 'length_overall_m',
    breadth: 'breadth_m', beam: 'breadth_m', breadthinmeters: 'breadth_m',
    draught: 'draught_m', draft: 'draught_m', draughtinmeters: 'draught_m', draftinmeters: 'draught_m',
    airdraft: 'air_draft_m', airdraftinmeters: 'air_draft_m', airdraftm: 'air_draft_m',
    mmsi: 'mmsi',
    radiocallsign: 'radio_call_sign', callsign: 'radio_call_sign',
    ownersname: 'owners_name', ownername: 'owners_name', owner: 'owners_name',
    ownersnationality: 'owners_nationality',
    companyname: 'company_name', company: 'company_name',
    emailaddress: 'email_address', email: 'email_address',
    contactno: 'contact_no', phone: 'contact_no', contactnumber: 'contact_no',
    berth: 'berth', status: 'status',
    maxcrew: 'max_crew', crew: 'max_crew',
    maxguests: 'max_guests', guests: 'max_guests',
    engine: 'engine', enginetype: 'engine',
    vesselimage: 'vessel_image', image: 'vessel_image', photo: 'vessel_image', picture: 'vessel_image', vesselphoto: 'vessel_image',
  }
  return map[n] ?? ''
}

function SharePointSyncSection() {
  const [listName, setListName] = useState('Yachts')
  const [columns, setColumns] = useState<{ name: string; displayName: string }[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [discovering, setDiscovering] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{ synced: number; errors: number; total: number } | null>(null)
  const [syncErr, setSyncErr] = useState<string | null>(null)
  const [syncTarget, setSyncTarget] = useState<'yachts' | 'permits' | 'small_boats'>('yachts')

  useEffect(() => {
    const n = listName.toLowerCase().trim()
    if (
      n.includes('tdra') || n.includes('sanitation') || n.includes('gate') ||
      n.includes('cruising') || n.includes('navigation') || n.includes('dma') ||
      n.includes('permit') || n.includes('exit') || n.includes('entry')
    ) {
      setSyncTarget('permits')
    } else if (
      n.includes('small boat') || n.includes('smallboat') ||
      n.includes('boat reg') || n.includes('boatreg')
    ) {
      setSyncTarget('small_boats')
    } else {
      setSyncTarget('yachts')
    }
  }, [listName])

  // Webhook state
  const [webhook, setWebhook] = useState<{ subscriptionId: string | null; expiresAt: string | null; daysLeft: number | null } | null>(null)
  const [webhookBusy, setWebhookBusy] = useState(false)
  const [webhookErr, setWebhookErr] = useState<string | null>(null)

  useEffect(() => {
    doGetWebhookStatus().then(setWebhook).catch(() => {})
  }, [])

  function getSuggestFn() {
    const n = listName.toLowerCase().trim()
    if (n.includes('tdra') || n.includes('sanitation') || n.includes('gate') || n.includes('cruising') || n.includes('navigation') || n.includes('dma') || n.includes('permit') || n.includes('exit') || n.includes('entry')) {
      return autoSuggestPermit
    }
    if (n.includes('small boat') || n.includes('smallboat') || n.includes('boat reg') || n.includes('boatreg')) {
      return autoSuggestSmallBoat
    }
    return autoSuggest
  }

  async function handleDiscover() {
    setDiscovering(true); setSyncErr(null); setResult(null)
    try {
      const cols = await doDiscoverSharePointColumns({ data: { listName } })
      setColumns(cols)
      const suggestFn = getSuggestFn()
      const auto: Record<string, string> = {}
      for (const c of cols) auto[c.name] = suggestFn(c.displayName)
      setMapping(auto)
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : 'Discovery failed')
    } finally { setDiscovering(false) }
  }

  async function handleSync() {
    setSyncing(true); setSyncErr(null); setResult(null)
    try {
      const res = await doSyncSharePoint({ data: { listName, fieldMapping: mapping, syncTarget } })
      setResult(res)
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : 'Sync failed')
    } finally { setSyncing(false) }
  }

  async function handleRegisterWebhook() {
    setWebhookBusy(true); setWebhookErr(null)
    try {
      const appUrl = window.location.origin
      const res = await doRegisterWebhook({ data: { appUrl } })
      setWebhook({ subscriptionId: res.subscriptionId, expiresAt: res.expiresAt, daysLeft: Math.round((new Date(res.expiresAt).getTime() - Date.now()) / 86_400_000) })
    } catch (e) {
      setWebhookErr(e instanceof Error ? e.message : 'Webhook registration failed')
    } finally { setWebhookBusy(false) }
  }

  async function handleRenewWebhook() {
    setWebhookBusy(true); setWebhookErr(null)
    try {
      const newExpiry = await doRenewWebhook()
      setWebhook(prev => prev ? { ...prev, expiresAt: newExpiry, daysLeft: Math.round((new Date(newExpiry).getTime() - Date.now()) / 86_400_000) } : null)
    } catch (e) {
      setWebhookErr(e instanceof Error ? e.message : 'Renewal failed')
    } finally { setWebhookBusy(false) }
  }

  const webhookActive = webhook?.subscriptionId && webhook.daysLeft !== null && webhook.daysLeft > 0
  const webhookExpiringSoon = webhookActive && (webhook.daysLeft ?? 0) < 30

  return (
    <div className="border-t border-border mt-4 pt-4 space-y-4">
      {/* ── Webhook status ── */}
      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-semibold">Real-time Webhook (SharePoint → App)</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              SharePoint notifies the app instantly when list items change. Requires a cron fallback for reliability.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {webhookActive && (
              <Button size="sm" variant="outline" onClick={handleRenewWebhook} disabled={webhookBusy} className="gap-1.5 h-7 text-xs">
                {webhookBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Renew
              </Button>
            )}
            <Button size="sm" variant={webhookActive ? 'ghost' : 'default'} onClick={handleRegisterWebhook} disabled={webhookBusy} className="gap-1.5 h-7 text-xs">
              {webhookBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {webhookActive ? 'Re-register' : 'Register Webhook'}
            </Button>
          </div>
        </div>
        {webhookErr && <p className="text-[11px] text-destructive">{webhookErr}</p>}
        {webhook !== null && (
          <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            webhookActive
              ? webhookExpiringSoon
                ? 'bg-amber-500/15 text-amber-400'
                : 'bg-emerald-500/15 text-emerald-400'
              : 'bg-muted text-muted-foreground'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${webhookActive ? webhookExpiringSoon ? 'bg-amber-400' : 'bg-emerald-400' : 'bg-muted-foreground'}`} />
            {webhookActive
              ? `Active · expires in ${webhook.daysLeft}d`
              : webhook?.subscriptionId
                ? 'Expired — re-register'
                : 'Not registered'}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Cron fallback runs every 15 min automatically — no action needed.
        </p>
      </div>

      {/* ── Field mapping ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold">Field Mapping &amp; Full Sync</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            App fields: <strong className="text-foreground">{
              syncTarget === 'permits' ? 'Permits' :
              syncTarget === 'small_boats' ? 'Small Boat Registration' : 'Yachts'
            }</strong>
            {' · '}
            Syncs to: <strong className={
              syncTarget === 'yachts' ? 'text-primary' :
              syncTarget === 'permits' ? 'text-success' : 'text-warning'
            }>{
              syncTarget === 'yachts' ? 'yachts table' :
              syncTarget === 'permits' ? 'permits table' : 'small_boats table'
            }</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={listName}
            onChange={e => { setListName(e.target.value); setColumns([]); setMapping({}); }}
            placeholder="List name"
            className="h-8 w-36 text-sm"
          />
          <Button size="sm" variant="outline" onClick={handleDiscover} disabled={discovering} className="gap-1.5 h-8">
            {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Load Columns
          </Button>
        </div>
      </div>

      {syncErr && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {syncErr}
        </div>
      )}
      {result && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
          Sync complete — {result.synced} records synced, {result.errors} errors (of {result.total} total rows).
          Field mapping saved — auto-sync will use it going forward.
        </div>
      )}

      {columns.length > 0 ? (
        <>
          <div className="rounded-lg border border-border overflow-hidden text-sm">
            <div className="grid grid-cols-[1fr_20px_1fr] gap-2 bg-muted/40 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>SharePoint Column</span><span /><span>App Field</span>
            </div>
            <div className="divide-y divide-border max-h-72 overflow-auto">
              {columns.map(col => (
                <div key={col.name} className="grid grid-cols-[1fr_20px_1fr] gap-2 items-center px-3 py-1.5">
                  <div>
                    <div className="font-medium text-xs">{col.displayName}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{col.name}</div>
                  </div>
                  <span className="text-center text-muted-foreground text-xs">→</span>
                  <select
                    value={mapping[col.name] ?? ''}
                    onChange={e => setMapping(prev => ({ ...prev, [col.name]: e.target.value }))}
                    className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {getFieldSetForList(listName).map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {syncing ? 'Syncing…' : 'Sync Now'}
            </Button>
          </div>
        </>
      ) : !discovering && (
        <p className="text-xs text-muted-foreground">
          Click <strong>Load Columns</strong> to fetch the SharePoint list columns,
          review the auto-suggested field mapping, then click <strong>Sync Now</strong>.
          The mapping is saved and used for all future auto-syncs.
        </p>
      )}
    </div>
  )
}
