import React, { useEffect, useRef, useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { COUNTRY_CONFIGS } from '@/lib/visa/countryConfig'
import type { CountryVisaConfig, VisaField } from '@/lib/visa/countryConfig'
import type { CrewMember, CrewPassport } from '@/lib/visa/crewMatching'
import type { ComplianceResult } from '@/lib/visa/complianceChecks'
import { supabase } from '@/integrations/supabase/client'
import { AdditionalPersonalInfoSection } from '@/components/visa/AdditionalPersonalInfoSection'

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
  draftId?: string | null
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

/** Vessel name input with type-ahead suggestions from the yachts table.
 *  Free text is still allowed (so crew on an unlisted vessel can type manually). */
function VesselNameInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [names, setNames] = React.useState<string[]>([])
  const [open, setOpen] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    ;(supabase as any)
      .from('yachts').select('vessel_name').not('vessel_name', 'is', null).order('vessel_name')
      .then(({ data }: { data: { vessel_name: string }[] | null }) => {
        if (!alive) return
        const uniq = Array.from(new Set((data ?? []).map(y => y.vessel_name).filter(Boolean)))
        setNames(uniq as string[])
      })
    return () => { alive = false }
  }, [])

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = value.trim().toLowerCase()
  const matches = q
    ? names.filter(n => n.toLowerCase().includes(q)).slice(0, 8)
    : names.slice(0, 8)
  // Hide the list once the value exactly equals a known vessel (already chosen).
  const exact = names.some(n => n.toLowerCase() === q)
  const showList = open && matches.length > 0 && !(exact && matches.length === 1)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { setFocused(true); setOpen(true) }}
        onBlur={() => setFocused(false)}
        autoComplete="off"
        placeholder="Start typing a vessel name…"
        style={{ ...inputStyle, ...(focused ? focusStyle : {}) }}
      />
      {showList && (
        <ul style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
          margin: 0, padding: 4, listStyle: 'none', maxHeight: 240, overflowY: 'auto',
          background: COLORS.abyss, border: `1px solid ${COLORS.ocean}`, borderRadius: 8,
          boxShadow: '0 8px 30px -8px rgba(0,0,0,0.6)',
        }}>
          {matches.map(name => (
            <li key={name}>
              <button
                type="button"
                // onMouseDown (not onClick) so it fires before the input's blur.
                onMouseDown={e => { e.preventDefault(); onChange(name); setOpen(false) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  fontFamily: FONTS.display, fontSize: 13.5, color: COLORS.frost,
                  padding: '7px 10px', borderRadius: 5, border: 'none', background: 'transparent',
                }}
                onMouseEnter={e => { (e.currentTarget.style.background = `${COLORS.signal}1a`) }}
                onMouseLeave={e => { (e.currentTarget.style.background = 'transparent') }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function StepCountryFields({ state, onUpdate, onNext, onBack }: StepCountryFieldsProps) {
  // Auth token for the Additional Personal Information section (mother's maiden
  // name etc.) — that component talks to api.crew.personal-info with a bearer token.
  const [authToken, setAuthToken] = useState('')
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthToken(data.session?.access_token ?? ''))
  }, [])

  const config: CountryVisaConfig | undefined =
    COUNTRY_CONFIGS[state.countryCode as keyof typeof COUNTRY_CONFIGS]

  // Auto-populate vessel_name from the yacht record when we have a yacht_id.
  // Runs once per crew selection. Does NOT overwrite a value the user has typed.
  const fetchedRef = useRef<string | null>(null)
  const [vesselAutoFilled, setVesselAutoFilled] = React.useState(false)
  useEffect(() => {
    const yachtId = (state.crew as any)?.yacht_id
    if (!yachtId || fetchedRef.current === yachtId) return
    fetchedRef.current = yachtId
    ;(async () => {
      const db = supabase as any
      const { data } = await db
        .from('yachts')
        .select('vessel_name')
        .eq('id', yachtId)
        .maybeSingle()
      if (data?.vessel_name) {
        onUpdate({ countryFields: { ...state.countryFields, vessel_name: data.vessel_name } })
        setVesselAutoFilled(true)
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

            {/* vessel_name: always an editable text input; auto-filled badge when populated from DB */}
            {field.key === 'vessel_name' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <VesselNameInput
                  value={state.countryFields[field.key] ?? ''}
                  onChange={val => { handleChange(field.key, val); setVesselAutoFilled(false) }}
                />
                {vesselAutoFilled && state.countryFields['vessel_name'] && (
                  <span style={{
                    fontFamily: FONTS.display, fontSize: 11, color: COLORS.signal,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                      textTransform: 'uppercase', color: COLORS.signal,
                      padding: '1px 6px', background: `${COLORS.signal}18`,
                      border: `1px solid ${COLORS.signal}30`, borderRadius: 3,
                    }}>Auto-filled</span>
                    from vessel record — edit if incorrect
                  </span>
                )}
                {!state.countryFields['vessel_name'] && (
                  <span style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.steel }}>
                    No vessel linked to this crew member — enter the vessel name manually
                  </span>
                )}
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

      {/* Additional Personal Information (mother's maiden name, etc.) — Mike's
          personal-info capture, surfaced in the wizard's Details step. */}
      {state.crew?.id && authToken && (
        <div style={{ marginTop: 24 }}>
          <AdditionalPersonalInfoSection
            crewId={state.crew.id}
            applicationId={state.draftId ?? ''}
            selectedPassportId={state.passport?.id ?? null}
            authToken={authToken}
          />
        </div>
      )}

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
