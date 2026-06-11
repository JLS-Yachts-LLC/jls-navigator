import React, { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { COLORS } from '@/lib/tokens'
import type { CrewMember, CrewPassport } from '@/lib/visa/crewMatching'
import type { CountryVisaConfig } from '@/lib/visa/countryConfig'
import { COUNTRY_CONFIGS } from '@/lib/visa/countryConfig'
import type { ComplianceResult } from '@/lib/visa/complianceChecks'

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

const font = { fontFamily: 'Space Grotesk, sans-serif' }

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    background: COLORS.abyss,
    border: `1px solid ${COLORS.deep}`,
    borderRadius: 10,
    padding: '16px 20px',
    marginBottom: 16,
    ...font,
  }}>
    <div style={{
      color: COLORS.muted,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: 12,
    }}>
      {title}
    </div>
    {children}
  </div>
)

const KV: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'flex-start' }}>
    <span style={{ color: COLORS.steel, fontSize: 13, minWidth: 140, flexShrink: 0 }}>{label}</span>
    <span style={{ color: COLORS.frost, fontSize: 13 }}>{value}</span>
  </div>
)

export function StepReviewSubmit({ state, onUpdate, onNext, onBack }: Props) {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const config: CountryVisaConfig | undefined =
    COUNTRY_CONFIGS[state.countryCode as keyof typeof COUNTRY_CONFIGS]

  const warningCount = state.complianceResults.filter(r => !r.blocks).length

  async function handleSubmit() {
    if (!state.crew || !state.passport) {
      toast.error('Missing crew or passport — cannot submit.')
      return
    }
    setSubmitting(true)
    try {
      // 1. Insert visa_applications
      const { data: appData, error: appError } = await (supabase as any)
        .from('visa_applications')
        .insert({
          crew_member_id:  state.crew.id,
          passport_id:     state.passport.id,
          country_code:    state.countryCode,
          status:          'submitted',
          submitted_at:    new Date().toISOString(),
          yacht_id:        state.crew.yacht_id ?? null,
          visa_type:       'Crew Visa',
          // Mirror crew/passport details onto the row so the dashboard and
          // reports display correctly even for records without a crew join.
          given_name:      state.crew.first_name ?? null,
          surname:         state.crew.last_name ?? null,
          nationality:     state.passport.nationality ?? state.crew.nationality ?? null,
          passport_number: state.passport.passport_number ?? null,
          passport_expiry: state.passport.expiry_date ?? null,
        })
        .select('id')
        .single()

      if (appError) throw appError

      const applicationId = appData?.id

      // 2. Insert countryFields as key-value rows
      const fieldRows = Object.entries(state.countryFields)
        .filter(([, v]) => v !== '' && v !== undefined && v !== null)
        .map(([field_key, field_value]) => ({
          application_id: applicationId,
          field_key,
          field_value,
        }))

      if (fieldRows.length > 0) {
        const { error: fieldsError } = await (supabase as any)
          .from('visa_application_fields')
          .insert(fieldRows)

        if (fieldsError) throw fieldsError
      }

      // Mirror the new application into the SharePoint Excel trackers
      // (fire-and-forget — never block the UI on the write-back).
      if (applicationId) {
        fetch('/api/visa/excel-push', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: applicationId }),
        }).catch(() => {})
      }

      toast.success('Visa application submitted.')
      navigate({ to: '/crew-immigration/visas' })
    } catch (err: any) {
      console.error('Visa submit error:', err)
      toast.error(err?.message ?? 'Failed to submit application.')
    } finally {
      setSubmitting(false)
    }
  }

  const displayName =
    state.crew?.full_name ||
    [state.crew?.first_name, state.crew?.last_name].filter(Boolean).join(' ') ||
    '—'

  return (
    <div style={{ ...font, color: COLORS.frost }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.frost, margin: 0 }}>
          Review &amp; Submit
        </h2>
        <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, marginBottom: 0 }}>
          Confirm all details below before submitting the visa application.
        </p>
      </div>

      {/* 1. Country */}
      <SectionCard title="Destination Country">
        {config ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>{config.flag}</span>
            <span style={{ color: COLORS.frost, fontSize: 15, fontWeight: 600 }}>
              {config.countryName}
            </span>
            <span style={{
              background: COLORS.ocean,
              color: COLORS.signal,
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {state.countryCode}
            </span>
          </div>
        ) : (
          <span style={{ color: COLORS.muted }}>{state.countryCode}</span>
        )}
      </SectionCard>

      {/* 2. Crew Member */}
      <SectionCard title="Crew Member">
        <KV label="Name" value={displayName} />
        <KV label="Date of Birth" value={state.crew?.date_of_birth ?? '—'} />
        <KV label="Position / Rank" value={state.crew?.rank ?? '—'} />
        <KV label="Nationality" value={state.crew?.nationality ?? '—'} />
      </SectionCard>

      {/* 3. Passport */}
      <SectionCard title="Passport">
        {state.passport ? (
          <>
            <KV label="Passport Nationality" value={state.passport.nationality} />
            <KV label="Passport Number" value={state.passport.passport_number} />
            <KV label="Issuing Country" value={state.passport.issuing_country} />
            <KV label="Issue Date" value={state.passport.issue_date} />
            <KV label="Expiry Date" value={
              <span style={{ color: isExpiringSoon(state.passport.expiry_date) ? COLORS.warn : COLORS.frost }}>
                {state.passport.expiry_date}
              </span>
            } />
          </>
        ) : (
          <span style={{ color: COLORS.muted }}>No passport selected.</span>
        )}
      </SectionCard>

      {/* 4. Country Fields */}
      {Object.keys(state.countryFields).length > 0 && (
        <SectionCard title="Application Fields">
          {config?.fields.map(f => {
            const val = state.countryFields[f.key]
            if (!val && val !== '0') return null
            return <KV key={f.key} label={f.label} value={val} />
          })}
        </SectionCard>
      )}

      {/* 5. Documents */}
      <SectionCard title="Uploaded Documents">
        {Object.keys(state.uploadedDocs).length === 0 ? (
          <span style={{ color: COLORS.muted, fontSize: 13 }}>No documents uploaded.</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(state.uploadedDocs).map(([key, url]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: COLORS.steel, fontSize: 13, minWidth: 140 }}>{key}</span>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: COLORS.signal, fontSize: 13, textDecoration: 'underline' }}
                >
                  View document
                </a>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 6. Compliance */}
      <SectionCard title="Compliance">
        {state.complianceResults.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#22c55e', fontSize: 16 }}>✓</span>
            <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>All clear — no compliance issues.</span>
          </div>
        ) : (
          <div>
            {warningCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ color: COLORS.leoAmber, fontSize: 15 }}>⚠</span>
                <span style={{ color: COLORS.leoAmber, fontSize: 13, fontWeight: 600 }}>
                  {warningCount} warning{warningCount !== 1 ? 's' : ''} acknowledged
                </span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {state.complianceResults.map((r, i) => (
                <div key={i} style={{
                  background: COLORS.deep,
                  borderLeft: `3px solid ${r.severity === 'critical' ? COLORS.warn : r.severity === 'warn' ? COLORS.leoAmber : COLORS.muted}`,
                  borderRadius: 4,
                  padding: '8px 12px',
                  fontSize: 12,
                  color: COLORS.frost,
                }}>
                  <span style={{
                    fontWeight: 700,
                    color: r.severity === 'critical' ? COLORS.warn : r.severity === 'warn' ? COLORS.leoAmber : COLORS.muted,
                    marginRight: 6,
                  }}>
                    {r.severity.toUpperCase()}
                  </span>
                  {r.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <button
          onClick={onBack}
          disabled={submitting}
          style={{
            background: 'transparent',
            border: `1px solid ${COLORS.deep}`,
            color: COLORS.muted,
            borderRadius: 8,
            padding: '10px 22px',
            fontSize: 14,
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 600,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.5 : 1,
          }}
        >
          Back
        </button>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            background: submitting ? COLORS.ocean : COLORS.signal,
            color: submitting ? COLORS.muted : COLORS.void,
            border: 'none',
            borderRadius: 8,
            padding: '10px 28px',
            fontSize: 14,
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'background 0.2s',
          }}
        >
          {submitting ? (
            <>
              <Spinner />
              Submitting…
            </>
          ) : (
            'Submit Application'
          )}
        </button>
      </div>
    </div>
  )
}

function isExpiringSoon(expiryDate: string): boolean {
  const exp = new Date(expiryDate)
  const sixMonths = new Date()
  sixMonths.setMonth(sixMonths.getMonth() + 6)
  return exp < sixMonths
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  )
}

export default StepReviewSubmit
