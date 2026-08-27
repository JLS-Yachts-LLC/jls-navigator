/**
 * Edit a staff member's name.
 *
 * Display name is what every picker in Polaris shows (assignee lists, the vessel
 * Agent column, approvals). First/last name live on `profiles` — the same fields
 * Settings → My Profile edits — and saving them refreshes the display name
 * automatically, so the two can't drift apart. An explicit display name still
 * wins when someone should show as something other than "First Last".
 */
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import type { UserRole } from '@/lib/admin/types'

interface Props {
  userRole: UserRole & { display_name?: string | null; first_name?: string | null; last_name?: string | null }
  onClose: () => void
  onSuccess: () => void
}

export function EditNameModal({ userRole, onClose, onSuccess }: Props) {
  const { session } = useAuth()
  const email = (userRole as any).user?.email ?? userRole.user_id
  const [first, setFirst] = useState(userRole.first_name ?? '')
  const [last, setLast] = useState(userRole.last_name ?? '')
  const [display, setDisplay] = useState(userRole.display_name ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const derived = [first.trim(), last.trim()].filter(Boolean).join(' ')
  // Blank display name = "follow the first/last name".
  const effective = display.trim() || derived || '—'

  async function save() {
    setBusy(true)
    setErr('')
    try {
      const res = await fetch(`/api/admin/users/${userRole.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(session as any)?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          action: 'name',
          first_name: first.trim(),
          last_name: last.trim(),
          display_name: display.trim(),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error ?? 'Could not save the name'); return }
      onSuccess()
      onClose()
    } catch {
      setErr('Network error')
    } finally {
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div>
          <h2 className="text-base font-semibold">Edit name</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{email}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">First name</label>
            <input value={first} onChange={e => setFirst(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && save()} placeholder="Hilary" className={input} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Last name</label>
            <input value={last} onChange={e => setLast(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()} placeholder="Ackermann" className={input} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            Display name <span className="text-muted-foreground/60">— leave blank to use the first and last name</span>
          </label>
          <input value={display} onChange={e => setDisplay(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()} placeholder={derived || 'Shown throughout Polaris'} className={input} />
        </div>

        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Will show throughout Polaris as <span className="font-medium text-foreground">{effective}</span>
        </p>

        {err && <p className="text-xs text-red-400">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={busy}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-40">
            Cancel
          </button>
          <button onClick={save} disabled={busy || (!derived && !display.trim())}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40">
            {busy ? 'Saving…' : 'Save name'}
          </button>
        </div>
      </div>
    </div>
  )
}
