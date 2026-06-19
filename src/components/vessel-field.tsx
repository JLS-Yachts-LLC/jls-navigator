/**
 * VesselField — shared vessel selection component
 *
 * Three render modes driven entirely by the `mode` prop:
 *   auto_locked  — read-only badge, lock icon, no interaction
 *   dropdown     — searchable select (Pinned → Recent → All)
 *   backoffice   — searchable select with "Suggested" pill indicator
 *
 * VesselAuditTrail — renders vessel selection history for admin / detail views
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VesselOption {
  id: string
  name: string
  flag?: string | null
  imo?: string | null
  last_used?: string
}

export type VesselMode = 'auto_locked' | 'dropdown' | 'backoffice'

export interface VesselFieldProps {
  mode: VesselMode
  lockedVessel?: { id: string; name: string } | null
  suggestedVessel?: { id: string; name: string; reason: string } | null
  recentVessels?: VesselOption[]
  pinnedVessels?: VesselOption[]
  allVessels?: VesselOption[]
  value: string | null
  onChange: (vesselId: string) => void
  label?: string
  required?: boolean
  disabled?: boolean
  /** Bearer token for the type-ahead search API call */
  authToken?: string
}

// ── Lock icon ─────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function PinIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
         aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

// ── Label ─────────────────────────────────────────────────────────────────────

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <label style={{
      display: 'block',
      fontFamily: FONTS.display, fontSize: 10, fontWeight: 600,
      letterSpacing: '0.18em', textTransform: 'uppercase',
      color: COLORS.muted, marginBottom: 6,
    }}>
      {text}
      {required && (
        <span style={{ color: COLORS.warn, marginLeft: 3 }} aria-label="required">*</span>
      )}
    </label>
  )
}

// ── Section header inside dropdown ───────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      padding: '6px 12px 4px',
      fontFamily: FONTS.display, fontSize: 9, fontWeight: 700,
      letterSpacing: '0.18em', textTransform: 'uppercase',
      color: COLORS.steel, userSelect: 'none',
    }}>
      {title}
    </div>
  )
}

// ── Empty section notice ──────────────────────────────────────────────────────

function EmptySection({ text }: { text: string }) {
  return (
    <div style={{
      padding: '5px 12px 8px',
      fontFamily: FONTS.display, fontSize: 11,
      color: COLORS.steel, fontStyle: 'italic',
    }}>
      {text}
    </div>
  )
}

// ── Dropdown item ─────────────────────────────────────────────────────────────

function DropdownItem({
  vessel, selected, onSelect, onTogglePin, isPinned, suggested, lastUsed,
}: {
  vessel: VesselOption
  selected: boolean
  onSelect: () => void
  onTogglePin?: () => void
  isPinned?: boolean
  suggested?: boolean
  lastUsed?: string
}) {
  const [hover, setHover] = useState(false)

  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', cursor: 'pointer',
        background: selected
          ? `${COLORS.signal}18`
          : hover ? `${COLORS.deep}60` : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {/* Vessel name */}
      <span style={{
        fontFamily: FONTS.display, fontSize: 12, fontWeight: selected ? 600 : 400,
        color: selected ? COLORS.signal : COLORS.frost,
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {vessel.name}
      </span>

      {/* Suggested pill */}
      {suggested && (
        <span style={{
          fontFamily: FONTS.display, fontSize: 9, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: COLORS.leoAmber, background: `${COLORS.leoAmber}18`,
          border: `1px solid ${COLORS.leoAmber}40`,
          borderRadius: 3, padding: '1px 6px', flexShrink: 0,
        }}>
          Suggested
        </span>
      )}

      {/* Last used */}
      {lastUsed && !suggested && (
        <span style={{
          fontFamily: FONTS.display, fontSize: 10, color: COLORS.steel, flexShrink: 0,
        }}>
          {relativeTime(lastUsed)}
        </span>
      )}

      {/* Pin toggle */}
      {onTogglePin && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTogglePin() }}
          aria-label={isPinned ? 'Unpin vessel' : 'Pin vessel'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: isPinned ? COLORS.signal : COLORS.steel,
            padding: '2px 4px', flexShrink: 0, lineHeight: 1,
          }}
        >
          <PinIcon filled={isPinned} />
        </button>
      )}

      {/* Selected checkmark */}
      {selected && (
        <span style={{ color: COLORS.signal, fontSize: 12, flexShrink: 0 }} aria-hidden="true">✓</span>
      )}
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, background: COLORS.deep, margin: '4px 0' }} />
}

// ── Main VesselField ──────────────────────────────────────────────────────────

export function VesselField({
  mode,
  lockedVessel,
  suggestedVessel,
  recentVessels = [],
  pinnedVessels = [],
  allVessels = [],
  value,
  onChange,
  label = 'Vessel',
  required = true,
  disabled = false,
  authToken,
}: VesselFieldProps) {

  const [open, setOpen]             = useState(false)
  const [query, setQuery]           = useState('')
  const [searchResults, setResults] = useState<VesselOption[] | null>(null)
  const [searching, setSearching]   = useState(false)
  const [pinned, setPinned]         = useState<Set<string>>(
    () => new Set(pinnedVessels.map((v) => v.id))
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync pinned set when prop changes
  useEffect(() => {
    setPinned(new Set(pinnedVessels.map((v) => v.id)))
  }, [pinnedVessels])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  // Type-ahead search
  const runSearch = useCallback(async (q: string) => {
    if (!q) { setResults(null); return }
    setSearching(true)
    try {
      const headers: Record<string, string> = {}
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`
      const res = await fetch(`/api/vessels/search?q=${encodeURIComponent(q)}&limit=10`, { headers })
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [authToken])

  function handleQueryChange(q: string) {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(q), 200)
  }

  function select(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
    setResults(null)
  }

  async function togglePin(vesselId: string) {
    const nowPinned = !pinned.has(vesselId)
    setPinned((prev) => {
      const next = new Set(prev)
      if (nowPinned) next.add(vesselId); else next.delete(vesselId)
      return next
    })
    if (authToken) {
      try {
        await fetch('/api/vessels/pin', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ vessel_id: vesselId, pinned: nowPinned }),
        })
      } catch { /* non-fatal */ }
    }
  }

  const selectedVessel =
    allVessels.find((v) => v.id === value) ??
    pinnedVessels.find((v) => v.id === value) ??
    recentVessels.find((v) => v.id === value) ??
    (lockedVessel?.id === value ? lockedVessel : null)

  // ── auto_locked mode ───────────────────────────────────────────────────────

  if (mode === 'auto_locked') {
    const vessel = lockedVessel ?? selectedVessel
    return (
      <div>
        <FieldLabel text={label} required={required} />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 12px',
          background: COLORS.abyss, border: `1px solid ${COLORS.deep}`,
          borderRadius: 7,
          color: COLORS.muted,
        }}>
          <span style={{
            fontFamily: FONTS.display, fontSize: 13, fontWeight: 500,
            color: vessel ? COLORS.frost : COLORS.steel, flex: 1,
          }}>
            {vessel ? vessel.name : '—'}
          </span>
          <span style={{ color: COLORS.steel, display: 'flex', alignItems: 'center' }}>
            <LockIcon />
          </span>
        </div>
        <div style={{
          marginTop: 5, fontFamily: FONTS.display, fontSize: 10,
          color: COLORS.steel, fontStyle: 'italic',
        }}>
          Vessel is pre-assigned to your account
        </div>
      </div>
    )
  }

  // ── dropdown / backoffice mode ─────────────────────────────────────────────

  const isBackoffice  = mode === 'backoffice'
  const displayName   = selectedVessel?.name ?? (value ? '...' : 'Select a vessel')
  const isPlaceholder = !value

  // Items to show when not searching
  const displayPinned = pinnedVessels
  const displayRecent = recentVessels.filter((v) => !pinned.has(v.id))
  const displayAll    = allVessels.filter((v) => !pinned.has(v.id))

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <FieldLabel text={label} required={required} />

      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
          background: COLORS.abyss,
          border: `1px solid ${open ? COLORS.signal : COLORS.deep}`,
          borderRadius: 7,
          outline: 'none', opacity: disabled ? 0.5 : 1,
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{
          fontFamily: FONTS.display, fontSize: 13,
          color: isPlaceholder ? COLORS.steel : COLORS.frost,
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {displayName}
        </span>
        {isBackoffice && suggestedVessel && !value && (
          <span style={{
            fontFamily: FONTS.display, fontSize: 9, fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: COLORS.leoAmber, background: `${COLORS.leoAmber}18`,
            border: `1px solid ${COLORS.leoAmber}40`,
            borderRadius: 3, padding: '1px 6px', flexShrink: 0,
          }}>
            Suggested
          </span>
        )}
        <span style={{ color: COLORS.muted, display: 'flex', alignItems: 'center' }}>
          <ChevronIcon open={open} />
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="listbox"
          aria-label="Select vessel"
          style={{
            position: 'absolute', zIndex: 50, top: 'calc(100% + 4px)', left: 0, right: 0,
            background: COLORS.abyss, border: `1px solid ${COLORS.deep}`,
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            maxHeight: 320, overflowY: 'auto',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${COLORS.deep}` }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search vessels…"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '6px 10px',
                fontFamily: FONTS.display, fontSize: 12, color: COLORS.frost,
                background: COLORS.void, border: `1px solid ${COLORS.deep}`,
                borderRadius: 5, outline: 'none',
              }}
            />
          </div>

          {searching && (
            <div style={{ padding: '10px 12px', fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted }}>
              Searching…
            </div>
          )}

          {/* Search results */}
          {query && searchResults !== null && !searching && (
            <>
              {searchResults.length === 0 ? (
                <EmptySection text="No vessels match your search" />
              ) : (
                searchResults.map((v) => (
                  <DropdownItem
                    key={v.id}
                    vessel={v}
                    selected={v.id === value}
                    onSelect={() => select(v.id)}
                    onTogglePin={() => togglePin(v.id)}
                    isPinned={pinned.has(v.id)}
                  />
                ))
              )}
            </>
          )}

          {/* Section layout (shown when not actively searching) */}
          {!query && (
            <>
              {/* Pinned */}
              <SectionHeader title="Pinned Vessels" />
              {displayPinned.length === 0
                ? <EmptySection text="None pinned" />
                : displayPinned.map((v) => (
                    <DropdownItem
                      key={v.id}
                      vessel={v}
                      selected={v.id === value}
                      onSelect={() => select(v.id)}
                      onTogglePin={() => togglePin(v.id)}
                      isPinned
                    />
                  ))
              }

              <Divider />

              {/* Recent */}
              <SectionHeader title="Recent Vessels" />
              {displayRecent.length === 0
                ? <EmptySection text="No recent vessels" />
                : displayRecent.map((v) => (
                    <DropdownItem
                      key={v.id}
                      vessel={v}
                      selected={v.id === value}
                      onSelect={() => select(v.id)}
                      onTogglePin={() => togglePin(v.id)}
                      isPinned={pinned.has(v.id)}
                      lastUsed={v.last_used}
                    />
                  ))
              }

              <Divider />

              {/* All vessels — backoffice shows suggested item first */}
              <SectionHeader title="All Vessels" />
              {isBackoffice && suggestedVessel && !value && (
                <DropdownItem
                  key={`suggested-${suggestedVessel.id}`}
                  vessel={suggestedVessel}
                  selected={suggestedVessel.id === value}
                  onSelect={() => select(suggestedVessel.id)}
                  onTogglePin={() => togglePin(suggestedVessel.id)}
                  isPinned={pinned.has(suggestedVessel.id)}
                  suggested
                />
              )}
              {displayAll.length === 0
                ? <EmptySection text="No vessels available" />
                : displayAll.map((v) => (
                    <DropdownItem
                      key={v.id}
                      vessel={v}
                      selected={v.id === value}
                      onSelect={() => select(v.id)}
                      onTogglePin={() => togglePin(v.id)}
                      isPinned={pinned.has(v.id)}
                    />
                  ))
              }
            </>
          )}
        </div>
      )}

      {isBackoffice && suggestedVessel && !value && (
        <div style={{
          marginTop: 5, fontFamily: FONTS.display, fontSize: 10,
          color: COLORS.steel, fontStyle: 'italic',
        }}>
          Last associated with this crew member
        </div>
      )}
    </div>
  )
}

// ── VesselAuditTrail ──────────────────────────────────────────────────────────

interface AuditEntry {
  id: string
  selection_mode: string
  changed_at: string
  selected_vessel_name?: { vessel_name: string } | null
  previous_vessel_name?: { vessel_name: string } | null
  changed_by_name?: { display_name: string } | null
}

interface VesselAuditTrailProps {
  recordId: string
  authToken?: string
}

export function VesselAuditTrail({ recordId, authToken }: VesselAuditTrailProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!recordId) return
    void (async () => {
      try {
        const headers: Record<string, string> = {}
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`
        const res  = await fetch(`/api/vessels/audit?record_id=${recordId}`, { headers })
        const data = await res.json()
        setEntries(data.entries ?? [])
      } catch {
        setEntries([])
      } finally {
        setLoading(false)
      }
    })()
  }, [recordId, authToken])

  const modeLabel: Record<string, string> = {
    auto_locked:        'Auto-assigned (locked)',
    auto_suggested:     'Auto-suggested',
    manual:             'Manual selection',
    backoffice_suggested: 'Backoffice suggested',
  }

  return (
    <div style={{ fontFamily: FONTS.display }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: COLORS.muted, marginBottom: 10,
      }}>
        Vessel Selection History
      </div>
      <div style={{ borderTop: `1px solid ${COLORS.deep}` }}>
        {loading && (
          <div style={{ padding: '10px 0', fontSize: 11, color: COLORS.steel }}>Loading…</div>
        )}
        {!loading && entries.length === 0 && (
          <div style={{ padding: '10px 0', fontSize: 11, color: COLORS.steel, fontStyle: 'italic' }}>
            No selection history
          </div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto',
              gap: '6px 16px', alignItems: 'center',
              padding: '9px 0', borderBottom: `1px solid ${COLORS.deep}`,
            }}
          >
            <span style={{ fontSize: 12, color: COLORS.frost }}>
              {modeLabel[entry.selection_mode] ?? entry.selection_mode}
              {entry.selected_vessel_name?.vessel_name && (
                <span style={{ color: COLORS.signal, marginLeft: 4 }}>
                  — {entry.selected_vessel_name.vessel_name}
                </span>
              )}
            </span>
            <span style={{ fontSize: 11, color: COLORS.muted, whiteSpace: 'nowrap' }}>
              {formatDate(entry.changed_at)}
            </span>
            <span style={{ fontSize: 11, color: COLORS.steel, whiteSpace: 'nowrap' }}>
              {entry.changed_by_name?.display_name ?? '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Util ──────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 60)   return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Exported for consumers who need to resolve vessel context on page load
export async function fetchVesselContext(authToken: string, opts?: {
  crewMemberId?: string
  recordType?: string
}) {
  const params = new URLSearchParams()
  if (opts?.crewMemberId) params.set('crew_member_id', opts.crewMemberId)
  if (opts?.recordType)   params.set('record_type', opts.recordType)
  const qs = params.toString()
  const res = await fetch(`/api/vessels/resolve${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
  return res.json()
}
