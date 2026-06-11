import React from 'react'
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

  return (
    <div style={{ fontFamily: FONTS.display, color: COLORS.frost }}>
      <h2
        style={{
          fontFamily: FONTS.display,
          fontSize: 20,
          fontWeight: 700,
          color: COLORS.frost,
          marginBottom: 6,
        }}
      >
        Select Destination Country
      </h2>
      <p
        style={{
          fontFamily: FONTS.display,
          fontSize: 14,
          color: COLORS.muted,
          marginBottom: 24,
        }}
      >
        Choose the country you are applying a crew visa for.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
        }}
      >
        {SUPPORTED_COUNTRIES.map((code) => {
          const config: CountryVisaConfig = COUNTRY_CONFIGS[code]
          const isSelected = selected === code
          return (
            <button
              key={code}
              type="button"
              onClick={() => onUpdate({ countryCode: code })}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '20px 12px',
                borderRadius: 10,
                border: `2px solid ${isSelected ? COLORS.signal : COLORS.deep}`,
                background: isSelected ? 'rgba(0,196,204,0.08)' : COLORS.abyss,
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
                outline: 'none',
                boxShadow: isSelected
                  ? `0 0 0 1px ${COLORS.signal}33`
                  : 'none',
              }}
            >
              <span style={{ fontSize: 32, lineHeight: 1 }}>{config.flag}</span>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 15,
                  fontWeight: 700,
                  color: isSelected ? COLORS.signal : COLORS.frost,
                  textAlign: 'center',
                }}
              >
                {config.countryName}
              </span>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 12,
                  color: COLORS.muted,
                  textAlign: 'center',
                }}
              >
                {COUNTRY_LABELS[code]}
              </span>
              {isSelected && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: COLORS.signal,
                    marginTop: 2,
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
          marginTop: 32,
          paddingRight: 80, // clear the fixed bottom-right Leo orb so the click lands
          position: 'relative',
          zIndex: 20,
        }}
      >
        <button
          type="button"
          onClick={onNext}
          disabled={!selected}
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
