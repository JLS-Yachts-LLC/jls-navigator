/**
 * Polaris — Crew Visa Country Selector
 *
 * Single click  → selects the card (highlighted state), enables Continue
 * Second click  → selects AND immediately proceeds (same as clicking Continue)
 * Double click  → selects AND immediately proceeds
 * Continue btn  → proceeds with the currently selected country
 */

import React, { useCallback } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { SUPPORTED_COUNTRIES, COUNTRY_CONFIGS } from '@/lib/visa/countryConfig'
import type { CountryVisaConfig } from '@/lib/visa/countryConfig'
import type { CrewMember, CrewPassport } from '@/lib/visa/crewMatching'
import type { ComplianceResult } from '@/lib/visa/complianceChecks'

const COUNTRY_LABELS: Record<string, string> = {
  AE: 'UAE Crew Visa',
  OM: 'Oman Crew Visa',
  MV: 'Maldives Crew Visa',
  SA: 'Saudi Arabia Crew Visa',
  QA: 'Qatar Crew Visa',
  BH: 'Bahrain Crew Visa',
  EG: 'Egypt Crew Visa',
}

interface WizardState {
  step: number
  countryCode: string
  crew: CrewMember | null
  isNewCrew: boolean
  passport: CrewPassport | null
  passports: CrewPassport[]
  countryFields: Record<string, string>
  uploadedDocs: Record<string, string>
  complianceResults: ComplianceResult[]
  complianceAcknowledged: boolean
}

interface Props {
  state: WizardState
  onUpdate: (partial: Partial<WizardState>) => void
  onNext: () => void
  onBack: () => void
}

export default function StepCountrySelect({ state, onUpdate, onNext }: Props) {
  const selected = state.countryCode || 'AE'

  const handleCardClick = useCallback(
    (code: string) => {
      if (selected === code) {
        // Second click on already-selected card → proceed immediately
        onNext()
      } else {
        onUpdate({ countryCode: code })
      }
    },
    [selected, onUpdate, onNext]
  )

  const handleCardDoubleClick = useCallback(
    (code: string) => {
      // Double-click always selects + proceeds regardless of prior state
      onUpdate({ countryCode: code })
      onNext()
    },
    [onUpdate, onNext]
  )

  return (
    <div style={{ fontFamily: FONTS.display, color: COLORS.frost }}>
      <h2
        style={{
          fontFamily: FONTS.display,
          fontSize: 18,
          fontWeight: 700,
          color: COLORS.frost,
          marginBottom: 4,
        }}
      >
        Select Destination Country
      </h2>
      <p style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>
        Choose the country you are applying a crew visa for.
      </p>
      <p style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.steel, marginBottom: 16 }}>
        Click once to select · Click again or double-click to continue directly.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        {SUPPORTED_COUNTRIES.map((code) => {
          const config: CountryVisaConfig = COUNTRY_CONFIGS[code]
          const isSelected = selected === code

          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${config.countryName} — ${COUNTRY_LABELS[code]}${isSelected ? '. Selected. Click again to continue.' : ''}`}
              onClick={() => handleCardClick(code)}
              onDoubleClick={() => handleCardDoubleClick(code)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '11px 13px',
                borderRadius: 10,
                border: `2px solid ${isSelected ? COLORS.signal : COLORS.deep}`,
                background: isSelected ? 'rgba(0,196,204,0.08)' : COLORS.abyss,
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
                outline: 'none',
                textAlign: 'left',
                boxShadow: isSelected ? `0 0 0 1px ${COLORS.signal}33` : 'none',
              }}
            >
              <img
                src={`https://flagcdn.com/${code.toLowerCase()}.svg`}
                alt={`${config.countryName} flag`}
                width={30}
                height={20}
                loading="lazy"
                style={{
                  borderRadius: 3,
                  objectFit: 'cover',
                  flexShrink: 0,
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.1)',
                }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: isSelected ? COLORS.signal : COLORS.frost,
                    lineHeight: 1.2,
                  }}
                >
                  {config.countryName}
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.muted, marginLeft: 6 }}>
                    {code}
                  </span>
                </span>
                <span
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 11,
                    color: isSelected ? COLORS.signal : COLORS.muted,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    opacity: isSelected ? 0.85 : 1,
                  }}
                >
                  {isSelected ? 'Click again to continue →' : COUNTRY_LABELS[code]}
                </span>
              </div>

              {/* Selected dot */}
              {isSelected && (
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: COLORS.signal,
                    flexShrink: 0,
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: 20,
          paddingRight: 80,
          position: 'relative',
          zIndex: 20,
        }}
      >
        <button
          type="button"
          onClick={onNext}
          disabled={!selected}
          aria-label={
            selected
              ? `Continue with ${COUNTRY_CONFIGS[selected as keyof typeof COUNTRY_CONFIGS]?.countryName}`
              : 'Select a country to continue'
          }
          style={{
            fontFamily: FONTS.display,
            fontSize: 14,
            fontWeight: 600,
            padding: '10px 28px',
            borderRadius: 8,
            border: 'none',
            background: selected ? COLORS.signal : COLORS.ocean,
            color: selected ? COLORS.void : COLORS.muted,
            cursor: selected ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
