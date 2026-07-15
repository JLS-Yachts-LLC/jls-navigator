'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import type { UserRole, RoleOption } from '@/lib/admin/types'

interface Props {
  userRole: UserRole
  roles: RoleOption[]
  onClose: () => void
  onSuccess: () => void
}

export function EditRoleModal({ userRole, roles, onClose, onSuccess }: Props) {
  const { session } = useAuth()
  const [role, setRole]     = useState<string>(userRole.role)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${userRole.id}`, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${(session as any)?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action: 'role', role }),
      })
      if (!res.ok) {
        const j = await res.json()
        setError(j.error ?? 'Failed to update role')
        return
      }
      onSuccess()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-xl border border-white/10 bg-popover p-5 shadow-2xl">
        <h3 className="mb-4 text-sm font-semibold text-white">Change role</h3>
        <p className="mb-3 text-[11px] text-white/50">{(userRole as any).user?.email ?? userRole.user_id}</p>

        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          className="w-full rounded-md border border-white/10 px-3 py-2
                     text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500/40"
          style={{ backgroundColor: "#0e1c26", color: "#e6edf3" }}
        >
          {roles.map(r => (
            <option key={r.name} value={r.name} style={{ backgroundColor: "#0e1c26", color: "#e6edf3" }}>{r.display_name}</option>
          ))}
        </select>

        {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}

        <div className="mt-4 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/60
                       hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || role === userRole.role}
            className="rounded-md bg-amber-500/15 border border-amber-500/25 px-3 py-1.5
                       text-xs text-amber-400 hover:bg-amber-500/25 transition-colors
                       disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
