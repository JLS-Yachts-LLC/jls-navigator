import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'

/**
 * Per-user module access.
 *
 * The person's DEPARTMENT sets the defaults; each row here can override one
 * module — including downwards, so a Finance person can be given read-only
 * Crew & Immigration without touching anyone else. "Department default" clears
 * the override and hands the module back to the department.
 */

type Row = {
  module_id: string
  slug: string
  label: string
  inherited: string | null   // level from department_permissions
  override: string | null    // level set for this person
}

const LEVELS = [
  { value: '', label: 'Department default' },
  { value: 'none', label: 'No access' },
  { value: 'view', label: 'View' },
  { value: 'create', label: 'Create' },
  { value: 'edit', label: 'Edit' },
  { value: 'admin', label: 'Admin' },
]

const selectStyle = { backgroundColor: '#0e1c26', color: '#e6edf3' }

export function ModuleAccessModal({ userId, email, onClose }: {
  userId: string
  email: string
  onClose: () => void
}) {
  const { session } = useAuth()
  const token = (session as any)?.access_token ?? ''
  const [rows, setRows] = useState<Row[] | null>(null)
  const [dept, setDept] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/admin/user-modules?user_id=${encodeURIComponent(userId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const j = await res.json()
        if (!res.ok) { setError(j.error ?? 'Could not load module access'); return }
        setDept(j.department ?? null)
        setRows(j.modules ?? [])
      } catch { setError('Network error') }
    })()
  }, [userId, token])

  // '' means "no override" — represent an explicit block as the 'none' level.
  const current = (r: Row) => edits[r.slug] ?? (r.override ?? '')

  async function save() {
    setSaving(true); setError('')
    try {
      const levels: Record<string, string | null> = {}
      for (const [slug, v] of Object.entries(edits)) levels[slug] = v === '' ? null : v
      const res = await fetch('/api/admin/user-modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userId, levels }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error ?? 'Save failed'); return }
      onClose()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  const dirty = Object.keys(edits).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-[560px] flex-col rounded-xl border border-white/10 bg-popover shadow-2xl">
        <div className="border-b border-white/10 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Module access</h3>
          <p className="mt-0.5 text-[11.5px] text-white/45">
            {email}
            {dept
              ? <> · department <span className="text-white/70">{dept}</span> sets the defaults below</>
              : <> · <span className="text-amber-400">no department set</span> — only the overrides here grant access</>}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          {error && <p className="mb-2 text-[12.5px] text-red-400">{error}</p>}
          {!rows ? (
            <p className="py-6 text-center text-xs text-white/40">Loading…</p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {rows.map((r) => {
                  const val = current(r)
                  const overridden = val !== ''
                  return (
                    <tr key={r.slug} className="border-b border-white/5">
                      <td className="py-2 pr-3">
                        <div className="text-white/85">{r.label}</div>
                        <div className="text-[10.5px] text-white/35">
                          {r.inherited
                            ? `Department gives: ${r.inherited}`
                            : 'Department gives: no access'}
                        </div>
                      </td>
                      <td className="w-[170px] py-2">
                        <select
                          value={val}
                          onChange={(e) => setEdits((p) => ({ ...p, [r.slug]: e.target.value }))}
                          className="w-full rounded-md border border-white/10 px-2 py-1.5 text-[11.5px] text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
                          style={selectStyle}
                        >
                          {LEVELS.map((l) => (
                            <option key={l.value} value={l.value} style={selectStyle}>{l.label}</option>
                          ))}
                        </select>
                        {overridden && (
                          <div className="mt-0.5 text-[10px] text-cyan-400/80">set for this person</div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
          <span className="text-[11px] text-white/35">
            {dirty ? `${dirty} change${dirty === 1 ? '' : 's'} pending` : 'No changes'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/5">
              Cancel
            </button>
            <button onClick={() => void save()} disabled={saving || !dirty}
              className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-400 transition-colors hover:bg-cyan-500/20 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save access'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
