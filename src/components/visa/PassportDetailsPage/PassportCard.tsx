import { useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { toDMY } from '@/lib/utils'
import type { Passport } from './PassportDetailsPage.types'

const GREEN = '#1D9E75'

// dd/mm/yyyy to match the UAE immigration portal.
const formatDate = (iso: string): string => toDMY(iso)

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

export interface PassportCardProps {
  passport:   Passport
  selected:   boolean
  onSelect:   () => void
  onRemove:   (id: string) => void
}

export function PassportCard({ passport, selected, onSelect, onRemove }: PassportCardProps) {
  const [expanded, setExpanded]       = useState(false)
  const [confirming, setConfirming]   = useState(false)

  const borderColor = selected ? GREEN : 'var(--border)'
  const borderWidth = selected ? '1.5px' : '0.5px'

  const validBadge = passport.isExpired ? (
    <span style={{
      fontFamily: FONTS.display, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      color: COLORS.warn, background: `${COLORS.warn}1A`,
      border: `1px solid ${COLORS.warn}50`, borderRadius: 4, padding: '2px 7px',
    }}>
      Expired
    </span>
  ) : (
    <span style={{
      fontFamily: FONTS.display, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      color: GREEN, background: `${GREEN}1A`,
      border: `1px solid ${GREEN}50`, borderRadius: 4, padding: '2px 7px',
    }}>
      Valid
    </span>
  )

  // ── Inline removal confirmation ──────────────────────────────────────────
  if (confirming) {
    return (
      <div style={{
        background: COLORS.abyss,
        border: `${borderWidth} solid ${COLORS.warn}`,
        borderRadius: 10, padding: '18px 20px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: `${COLORS.warn}14`, border: `1px solid ${COLORS.warn}50`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TrashIcon />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 700, color: COLORS.frost, marginBottom: 4 }}>
              Are you sure you want to remove this passport?
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, marginBottom: 16 }}>
              {passport.countryOfIssue} passport · No. {passport.passportNumber}
              <br />
              This action cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{
                  fontFamily: FONTS.display, fontSize: 13, fontWeight: 600,
                  color: COLORS.muted, background: 'none',
                  border: `1px solid var(--border)`, borderRadius: 7,
                  padding: '7px 18px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setConfirming(false); onRemove(passport.id) }}
                style={{
                  fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
                  color: '#fff', background: COLORS.warn,
                  border: 'none', borderRadius: 7,
                  padding: '7px 18px', cursor: 'pointer',
                }}
              >
                Remove passport
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Normal card ──────────────────────────────────────────────────────────
  return (
    <div style={{
      background: COLORS.abyss,
      border: `${borderWidth} solid ${borderColor}`,
      borderRadius: 10,
      transition: 'border-color 0.15s',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onSelect()}
        aria-pressed={selected}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', cursor: 'pointer',
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--muted)')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
      >
        {/* Selection circle */}
        <div style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${selected ? GREEN : COLORS.steel}`,
          background: selected ? GREEN : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.15s, background 0.15s',
        }}>
          {selected && (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        {/* Passport meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 700, color: COLORS.frost }}>
              {passport.countryOfIssue} passport
            </span>
            {passport.isPrimary && (
              <span style={{
                fontFamily: FONTS.display, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: COLORS.signal, background: `${COLORS.signal}1A`,
                border: `1px solid ${COLORS.signal}50`, borderRadius: 4, padding: '2px 7px',
              }}>
                Primary
              </span>
            )}
            {validBadge}
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted }}>
            No. {passport.passportNumber}
            <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>
            Expires {formatDate(passport.expiryDate)}
          </div>
        </div>

        {/* Action buttons — stop propagation so they don't trigger selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: COLORS.muted, padding: '6px', borderRadius: 5,
              display: 'flex', alignItems: 'center',
            }}
          >
            <ChevronIcon open={expanded} />
          </button>
          <button
            type="button"
            aria-label="Remove passport"
            onClick={e => { e.stopPropagation(); setConfirming(true) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: COLORS.muted, padding: '6px', borderRadius: 5,
              display: 'flex', alignItems: 'center',
            }}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div style={{
          borderTop: `1px solid var(--border)`,
          padding: '14px 16px',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '12px 20px',
        }}>
          {[
            { label: 'Passport number', value: passport.passportNumber },
            { label: 'Nationality',     value: passport.nationality },
            { label: 'Issue date',      value: formatDate(passport.issueDate) },
            { label: 'Expiry date',     value: formatDate(passport.expiryDate) },
            { label: 'Country of issue',value: passport.countryOfIssue },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{
                fontFamily: FONTS.display, fontSize: 11, fontWeight: 600,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: COLORS.muted, marginBottom: 4,
              }}>
                {label}
              </div>
              <div style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
