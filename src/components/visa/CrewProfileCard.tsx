import React from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import type { CrewMember, CrewPassport } from '@/lib/visa/crewMatching'

interface CrewProfileCardProps {
  crew: CrewMember
  passports?: CrewPassport[]
  compact?: boolean
  selected?: boolean
  onClick?: () => void
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function isExpiringSoon(dateStr: string): boolean {
  const expiry = new Date(dateStr)
  const sixMonths = new Date()
  sixMonths.setMonth(sixMonths.getMonth() + 6)
  return expiry <= sixMonths
}

export function CrewProfileCard({
  crew,
  passports,
  compact = false,
  selected = false,
  onClick,
}: CrewProfileCardProps) {
  const primaryPassport = passports?.find((p) => p.is_primary) ?? passports?.[0]
  const isClickable = !!onClick

  const cardStyle: React.CSSProperties = {
    fontFamily: FONTS.display,
    backgroundColor: COLORS.abyss,
    border: `1px solid ${selected ? COLORS.signal : COLORS.deep}`,
    borderRadius: 8,
    padding: compact ? '10px 14px' : '16px 20px',
    cursor: isClickable ? 'pointer' : 'default',
    transition: 'border-color 0.15s, background-color 0.15s',
    boxShadow: selected ? `0 0 0 1px ${COLORS.signal}33` : undefined,
    userSelect: 'none',
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isClickable) return
    e.currentTarget.style.backgroundColor = COLORS.deep
    if (!selected) e.currentTarget.style.borderColor = COLORS.muted
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isClickable) return
    e.currentTarget.style.backgroundColor = COLORS.abyss
    e.currentTarget.style.borderColor = selected ? COLORS.signal : COLORS.deep
  }

  const displayName =
    crew.full_name ||
    [crew.first_name, crew.last_name].filter(Boolean).join(' ') ||
    'Unknown Crew'

  if (compact) {
    return (
      <div
        style={cardStyle}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: COLORS.frost,
                marginRight: 8,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'inline-block',
                maxWidth: 200,
                verticalAlign: 'middle',
              }}
            >
              {displayName}
            </span>
            {crew.rank && (
              <span
                style={{
                  fontSize: 12,
                  color: COLORS.muted,
                  verticalAlign: 'middle',
                }}
              >
                {crew.rank}
              </span>
            )}
          </div>
          {crew.date_of_birth && (
            <span style={{ fontSize: 12, color: COLORS.steel, whiteSpace: 'nowrap' }}>
              DOB: {formatDate(crew.date_of_birth)}
            </span>
          )}
          {primaryPassport && (
            <span style={{ fontSize: 12, color: COLORS.steel, whiteSpace: 'nowrap' }}>
              {primaryPassport.nationality} · exp {formatDate(primaryPassport.expiry_date)}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      style={cardStyle}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: COLORS.frost,
              marginBottom: 2,
            }}
          >
            {displayName}
          </div>
          {crew.rank && (
            <div style={{ fontSize: 13, color: COLORS.muted }}>
              {crew.rank}
            </div>
          )}
        </div>
        {selected && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: COLORS.signal,
              backgroundColor: `${COLORS.signal}1A`,
              border: `1px solid ${COLORS.signal}44`,
              borderRadius: 4,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
            }}
          >
            Selected
          </div>
        )}
      </div>

      {/* Details row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 20px',
          marginTop: 4,
        }}
      >
        {crew.date_of_birth && (
          <div style={{ fontSize: 13 }}>
            <span style={{ color: COLORS.steel, marginRight: 4 }}>DOB</span>
            <span style={{ color: COLORS.frost }}>{formatDate(crew.date_of_birth)}</span>
          </div>
        )}
        {crew.nationality && (
          <div style={{ fontSize: 13 }}>
            <span style={{ color: COLORS.steel, marginRight: 4 }}>Nationality</span>
            <span style={{ color: COLORS.frost }}>{crew.nationality}</span>
          </div>
        )}
      </div>

      {/* Passport section */}
      {passports && passports.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px solid ${COLORS.deep}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: COLORS.steel,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 6,
            }}
          >
            Passports · {passports.length}
          </div>
          {primaryPassport && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: COLORS.steel, marginRight: 4 }}>Nationality</span>
                <span style={{ color: COLORS.frost }}>{primaryPassport.nationality}</span>
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: COLORS.steel, marginRight: 4 }}>Expires</span>
                <span
                  style={{
                    color: isExpiringSoon(primaryPassport.expiry_date)
                      ? COLORS.warn
                      : COLORS.frost,
                    fontWeight: isExpiringSoon(primaryPassport.expiry_date) ? 600 : 400,
                  }}
                >
                  {formatDate(primaryPassport.expiry_date)}
                </span>
              </div>
              {crew.multiple_passports && passports.length > 1 && (
                <div style={{ fontSize: 12, color: COLORS.muted }}>
                  +{passports.length - 1} more
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CrewProfileCard
