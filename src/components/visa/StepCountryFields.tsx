import React, { useEffect, useRef } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { COUNTRY_CONFIGS } from '@/lib/visa/countryConfig'
import type { CountryVisaConfig, VisaField } from '@/lib/visa/countryConfig'
import type { CrewMember, CrewPassport } from '@/lib/visa/crewMatching'
import type { ComplianceResult } from '@/lib/visa/complianceChecks'
import { supabase } from '@/integrations/supabase/client'

export interface WizardState {
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

interface StepCountryFieldsProps {
  state: WizardState
  onUpdate: (partial: Partial<WizardState>) => void
  onNext: () => void
  onBack: () => void
}

const inputStyle: React.CSSProperties = {
  fontFamily: FONTS.display,
  background: COLORS.deep,
  color: COLORS.frost,
  border: `1px solid ${COLORS.ocean}`,
  borderRadius: 6,
  padding: '8px 12px',
  width: '100%',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const focusStyle: React.CSSProperties = {
  outline: `2px solid ${COLORS.signal}`,
  outlineOffset: 1,
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: VisaField
  value: string
  onChange: (val: string) => void
}) {
  const [focused, setFocused] = React.useState(false)
  const mergedStyle = { ...inputStyle, ...(focused ? focusStyle : {}) }

  if (field.type === 'text') {
    return (
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={mergedStyle}
        placeholder={field.label}
      />
    )
  }

  if (field.type === 'date') {
    return (
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...mergedStyle,
          colorScheme: 'dark',
        }}
      />
    )
  }

  if (field.type === 'select') {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...mergedStyle,
          cursor: 'pointer',
        }}
      >
        <option value="" style={{ background: COLORS.abyss, color: COLORS.muted }}>
          — Select —
        </option>
        {(field.options ?? []).map(opt => (
          <option key={opt} value={opt} style={{ background: COLORS.abyss, color: COLORS.frost }}>
            {opt}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'boolean') {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {(['Yes', 'No'] as const).map(opt => {
          const isActive = value === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              style={{
                fontFamily: FONTS.display,
                fontSize: 14,
                fontWeight: 600,
                padding: '7px 22px',
                borderRadius: 6,
                border: `1px solid ${isActive ? COLORS.signal : COLORS.ocean}`,
                background: isActive ? COLORS.signal : COLORS.deep,
                color: isActive ? COLORS.void : COLORS.frost,
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>
    )
  }

  // fallback text
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={mergedStyle}
    />
  )
}

export function StepCountryFields({ state, onUpdate, onNext, onBack }: StepCountryFieldsProps) {
  const config: CountryVisaConfig | undefined =
    COUNTRY_CONFIGS[state.countryCode as keyof typeof COUNTRY_CONFIGS]

  // Auto-populate vessel_name from the yacht record as soon as we have a yacht_id.
  // Only runs once per wizard session — skips if already populated.
  const fetchedRef = useRef(false)
  useEffect(() => {
    const yachtId = (state.crew as any)?.yacht_id
    if (!yachtId || state.countryFields['vessel_name'] || fetchedRef.current) return
    fetchedRef.current = true
    ;(async () => {
      const db = supabase as any
      const { data } = await db
        .from('yachts')
        .select('vessel_name')
        .eq('id', yachtId)
        .maybeSingle()
      if (data?.vessel_name) {
        onUpdate({ countryFields: { ...state.countryFields, vessel_name: data.vessel_name } })
      }
    })()
  }, [(state.crew as any)?.yacht_id])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) {
    return (
      <div style={{ fontFamily: FONTS.display, color: COLORS.warn, padding: 24 }}>
        No configuration found for country code "{state.countryCode}".
      </div>
    )
  }

  function handleChange(key: string, value: string) {
    onUpdate({
      countryFields: { ...state.countryFields, [key]: value },
    })
  }

  const allRequiredFilled = config.fields
    .filter(f => f.required)
    .every(f => {
      const v = state.countryFields[f.key]
      return v !== undefined && v !== ''
    })

  return (
    <div
      style={{
        fontFamily: FONTS.display,
        color: COLORS.frost,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 28, lineHeight: 1 }}>{config.flag}</span>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 20,
            fontWeight: 700,
            color: COLORS.frost,
            margin: 0,
          }}
        >
          {config.countryName} — Application Details
        </h2>
      </div>

      <p style={{ fontSize: 13, color: COLORS.muted, margin: '0 0 24px 0' }}>
        Complete the fields below specific to your {config.countryName} visa application.
      </p>

      {/* UAE: fixed visa type notice */}
      {state.countryCode === 'AE' && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: '14px 16px', marginBottom: 24,
          background: `${COLORS.signal}0D`,
          border: `1px solid ${COLORS.signal}30`,
          borderRadius: 8,
        }}>
          {/* Visa type badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontFamily: FONTS.display, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: COLORS.signal, padding: '3px 10px',
              background: `${COLORS.signal}18`,
              border: `1px solid ${COLORS.signal}40`,
              borderRadius: 4,
            }}>
              Visa Type
            </span>
            <span style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 700, color: COLORS.frost }}>
              Crew 180-Day Multiple Entry Visa
            </span>
          </div>

          {/* Rules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 2 }}>
            {[
              { icon: '⚠', color: COLORS.warn, text: 'Crew must enter the UAE within 30 days of visa issuance. If not used within 30 days, the visa expires and a new application is required.' },
              { icon: '◆', color: COLORS.info,  text: 'Visa validity (180 days) runs from the date of first entry — not from the date of issuance.' },
              { icon: '◆', color: COLORS.info,  text: 'The vessel name below is used on all documents and correspondence throughout this application. Confirm it is correct before continuing.' },
            ].map(({ icon, color, text }) => (
              <div key={text} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color, fontSize: 12, flexShrink: 0, marginTop: 1 }} aria-hidden="true">{icon}</span>
                <span style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, lineHeight: 1.6 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {config.fields.map(field => (
          <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              style={{
                fontFamily: FONTS.display,
                fontSize: 13,
                fontWeight: 600,
                color: COLORS.steel,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
              }}
            >
              {field.label}
              {field.required && (
                <span style={{ color: COLORS.warn, marginLeft: 3 }}>*</span>
              )}
            </label>

            {/* vessel_name: show confirmed-vessel pill when auto-populated */}
            {field.key === 'vessel_name' && state.countryFields['vessel_name'] ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px',
                background: `${COLORS.signal}0D`,
                border: `1px solid ${COLORS.signal}40`,
                borderRadius: 6,
              }}>
                <span style={{
                  fontFamily: FONTS.display, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.16em', textTransform: 'uppercase',
                  color: COLORS.signal, padding: '2px 8px',
                  background: `${COLORS.signal}18`, borderRadius: 3, flexShrink: 0,
                }}>
                  Vessel
                </span>
                <span style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 700, color: COLORS.frost, flex: 1 }}>
                  {state.countryFields['vessel_name']}
                </span>
                <button
                  type="button"
                  onClick={() => handleChange('vessel_name', '')}
                  title="Edit vessel name"
                  style={{
                    fontFamily: FONTS.display, fontSize: 11, color: COLORS.steel,
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
                  }}
                >
                  ✎ Edit
                </button>
              </div>
            ) : (
              <FieldInput
                field={field}
                value={state.countryFields[field.key] ?? ''}
                onChange={val => handleChange(field.key, val)}
              />
            )}

            {field.helpText && (
              <p style={{ fontSize: 12, color: COLORS.muted, margin: 0 }}>
                {field.helpText}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 32,
          paddingTop: 20,
          borderTop: `1px solid ${COLORS.deep}`,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            fontFamily: FONTS.display,
            fontSize: 14,
            fontWeight: 600,
            padding: '9px 22px',
            borderRadius: 6,
            border: `1px solid ${COLORS.ocean}`,
            background: 'transparent',
            color: COLORS.muted,
            cursor: 'pointer',
          }}
        >
          Back
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!allRequiredFilled}
          style={{
            fontFamily: FONTS.display,
            fontSize: 14,
            fontWeight: 700,
            padding: '9px 28px',
            borderRadius: 6,
            border: 'none',
            background: allRequiredFilled ? COLORS.signal : COLORS.ocean,
            color: allRequiredFilled ? COLORS.void : COLORS.muted,
            cursor: allRequiredFilled ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s, color 0.15s',
            opacity: allRequiredFilled ? 1 : 0.6,
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

export default StepCountryFields
