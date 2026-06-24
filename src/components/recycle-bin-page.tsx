import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { COLORS, FONTS } from '@/lib/tokens'
import {
  listRecycleBin, restoreEntity, purgeForever, purgeExpired,
  daysUntilPurge, entityLabel, type RecycleBinItem,
} from '@/lib/recycle-bin'

const TYPE_ICON: Record<string, string> = {
  crew_member: '👤',
  yacht: '🛥',
  visa_application: '📄',
}

function itemTitle(item: RecycleBinItem): string {
  if (item.label) return item.label
  const p = item.payload ?? {}
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ')
    || p.vessel_name || p.passport_number || item.entity_id.slice(0, 8)
}

function relatedSummary(item: RecycleBinItem): string | null {
  const r = item.related
  if (!r) return null
  const parts: string[] = []
  if (r.visa_applications?.length) parts.push(`${r.visa_applications.length} visa application${r.visa_applications.length === 1 ? '' : 's'}`)
  if (r.crew_passports?.length) parts.push(`${r.crew_passports.length} passport${r.crew_passports.length === 1 ? '' : 's'}`)
  return parts.length ? `Includes ${parts.join(' · ')}` : null
}

export function RecycleBinPage() {
  const [items, setItems] = useState<RecycleBinItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  async function load() {
    setLoading(true)
    await purgeExpired()
    setItems(await listRecycleBin())
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  async function handleRestore(item: RecycleBinItem) {
    setBusy(item.id)
    try {
      await restoreEntity(item)
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast.success(`${entityLabel(item.entity_type)} restored`)
    } catch (e: any) {
      toast.error(e?.message ?? 'Restore failed')
    } finally { setBusy(null) }
  }

  async function handlePurge(item: RecycleBinItem) {
    if (!window.confirm(`Permanently delete "${itemTitle(item)}"? This cannot be undone.`)) return
    setBusy(item.id)
    try {
      await purgeForever(item.id)
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast.success('Permanently deleted')
    } catch (e: any) {
      toast.error(e?.message ?? 'Delete failed')
    } finally { setBusy(null) }
  }

  const types = ['all', 'crew_member', 'yacht', 'visa_application'] as const
  const shown = filter === 'all' ? items : items.filter(i => i.entity_type === filter)

  return (
    <div style={{ fontFamily: FONTS.display, color: COLORS.frost, padding: '24px 28px', maxWidth: 980 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Recycle Bin</h1>
      <p style={{ color: COLORS.muted, fontSize: 13, margin: '6px 0 20px' }}>
        Deleted crew, yachts and visa applications are kept here for <strong>90 days</strong> and can be restored.
        After that they're permanently removed.
      </p>

      {/* Type filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {types.map(t => {
          const active = filter === t
          const count = t === 'all' ? items.length : items.filter(i => i.entity_type === t).length
          return (
            <button key={t} onClick={() => setFilter(t)}
              style={{
                padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                fontFamily: FONTS.display, fontSize: 12.5, fontWeight: 600,
                border: `1px solid ${active ? COLORS.signal : COLORS.deep}`,
                background: active ? `${COLORS.signal}18` : 'transparent',
                color: active ? COLORS.signal : COLORS.muted,
              }}>
              {t === 'all' ? 'All' : `${TYPE_ICON[t]} ${entityLabel(t as any)}s`} · {count}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ color: COLORS.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '56px 0', color: COLORS.steel,
          border: `1px dashed ${COLORS.deep}`, borderRadius: 12, fontSize: 14,
        }}>
          🗑 The recycle bin is empty.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map(item => {
            const days = daysUntilPurge(item.expires_at)
            const rel = relatedSummary(item)
            return (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 10,
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden="true">{TYPE_ICON[item.entity_type] ?? '🗂'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.frost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {itemTitle(item)}
                  </div>
                  <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 2 }}>
                    {entityLabel(item.entity_type)} · deleted {new Date(item.deleted_at).toLocaleDateString('en-GB')}
                    {item.deleted_by_email ? ` by ${item.deleted_by_email}` : ''}
                    {rel ? ` · ${rel}` : ''}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                  color: days <= 7 ? COLORS.warn : COLORS.steel,
                }}>
                  {days === 0 ? 'Purges today' : `${days} day${days === 1 ? '' : 's'} left`}
                </span>
                <button onClick={() => handleRestore(item)} disabled={busy === item.id}
                  style={{
                    padding: '7px 14px', borderRadius: 7, flexShrink: 0,
                    border: 'none', background: COLORS.signal, color: COLORS.void,
                    fontFamily: FONTS.display, fontSize: 12, fontWeight: 700,
                    cursor: busy === item.id ? 'wait' : 'pointer', opacity: busy === item.id ? 0.6 : 1,
                  }}>
                  ↩ Restore
                </button>
                <button onClick={() => handlePurge(item)} disabled={busy === item.id}
                  title="Delete permanently"
                  style={{
                    padding: '7px 12px', borderRadius: 7, flexShrink: 0,
                    border: `1px solid ${COLORS.warn}44`, background: 'transparent', color: COLORS.warn,
                    fontFamily: FONTS.display, fontSize: 12, fontWeight: 600,
                    cursor: busy === item.id ? 'wait' : 'pointer', opacity: busy === item.id ? 0.6 : 1,
                  }}>
                  Delete forever
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default RecycleBinPage
