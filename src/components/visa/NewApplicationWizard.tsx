import React, { useState, useCallback } from 'react'
import { COLORS } from '@/lib/tokens'
import { loadCrewPassports } from '@/lib/visa/crewMatching'
import StepCountrySelect from './StepCountrySelect'
import StepCrewSearch from './StepCrewSearch'
import StepPassportSelect from './StepPassportSelect'
import StepCountryFields from './StepCountryFields'
import StepDocumentUpload from './StepDocumentUpload'
import StepComplianceCheck from './StepComplianceCheck'
import StepReviewSubmit from './StepReviewSubmit'

type WizardState = {
  step: number
  countryCode: string
  crew: any | null
  isNewCrew: boolean
  passport: any | null
  passports: any[]
  countryFields: Record<string, string>
  uploadedDocs: Record<string, string>
  complianceResults: any[]
  complianceAcknowledged: boolean
}

const STEP_LABELS = [
  'Country',
  'Crew',
  'Passport',
  'Details',
  'Documents',
  'Compliance',
  'Review',
]

const INITIAL_STATE: WizardState = {
  step: 1,
  countryCode: 'AE',
  crew: null,
  isNewCrew: false,
  passport: null,
  passports: [],
  countryFields: {},
  uploadedDocs: {},
  complianceResults: [],
  complianceAcknowledged: false,
}

type Props = {
  onClose?: () => void
}

export default function NewApplicationWizard({ onClose }: Props) {
  const [state, setState] = useState<WizardState>(INITIAL_STATE)

  const onUpdate = useCallback((partial: Partial<WizardState>) => {
    setState(prev => ({ ...prev, ...partial }))
  }, [])

  const onNext = useCallback(async () => {
    const currentStep = state.step

    // After step 2 (crew selected/created), load passports
    if (currentStep === 2 && state.crew) {
      try {
        const passports = await loadCrewPassports(state.crew.id)
        setState(prev => ({ ...prev, passports, step: prev.step + 1 }))
        return
      } catch {
        // proceed anyway, passports will be empty
        setState(prev => ({ ...prev, passports: [], step: prev.step + 1 }))
        return
      }
    }

    setState(prev => ({ ...prev, step: Math.min(prev.step + 1, 7) }))
  }, [state.step, state.crew])

  const onBack = useCallback(() => {
    setState(prev => ({ ...prev, step: Math.max(prev.step - 1, 1) }))
  }, [])

  const stepProps = { state, onUpdate, onNext, onBack }

  const countryName =
    state.step >= 2 && state.countryCode
      ? new Intl.DisplayNames(['en'], { type: 'region' }).of(state.countryCode) ?? state.countryCode
      : null

  return (
    <div
      style={{
        background: COLORS.abyss,
        minHeight: '100%',
        width: '100%',
        fontFamily: "'Space Grotesk', sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: COLORS.void,
          borderBottom: `1px solid ${COLORS.steel}`,
          padding: '20px 28px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div style={{ color: COLORS.frost, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
            New Visa Application
            {countryName && (
              <span style={{ color: COLORS.signal, marginLeft: 10, fontWeight: 500, fontSize: 15 }}>
                — {countryName}
              </span>
            )}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 2 }}>
            Step {state.step} of 7 · {STEP_LABELS[state.step - 1]}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: COLORS.muted,
              fontSize: 22,
              lineHeight: 1,
              padding: '2px 6px',
              borderRadius: 4,
              transition: 'color 0.15s',
            }}
            aria-label="Close"
            onMouseEnter={e => (e.currentTarget.style.color = COLORS.frost)}
            onMouseLeave={e => (e.currentTarget.style.color = COLORS.muted)}
          >
            ×
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div
        style={{
          background: COLORS.deep,
          borderBottom: `1px solid ${COLORS.steel}`,
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
        }}
      >
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1
          const isActive = stepNum === state.step
          const isCompleted = stepNum < state.step

          return (
            <React.Fragment key={stepNum}>
              {/* Step node */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  minWidth: 56,
                  flex: '0 0 auto',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "'Space Grotesk', sans-serif",
                    background: isActive
                      ? COLORS.signal
                      : isCompleted
                      ? COLORS.ocean
                      : COLORS.void,
                    color: isActive
                      ? COLORS.void
                      : isCompleted
                      ? COLORS.signal
                      : COLORS.muted,
                    border: isActive
                      ? `2px solid ${COLORS.signal}`
                      : isCompleted
                      ? `2px solid ${COLORS.ocean}`
                      : `2px solid ${COLORS.steel}`,
                    transition: 'all 0.2s',
                  }}
                >
                  {isCompleted ? '✓' : stepNum}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? COLORS.signal : isCompleted ? COLORS.muted : COLORS.steel,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  {label}
                </div>
              </div>

              {/* Connector */}
              {i < STEP_LABELS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    marginBottom: 18,
                    background: isCompleted ? COLORS.ocean : COLORS.steel,
                    transition: 'background 0.2s',
                  }}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Step Content — extra bottom padding so footer buttons clear the
          floating Leo assistant orb fixed in the bottom-right corner */}
      <div style={{ flex: 1, padding: '24px 28px 96px' }}>
        {state.step === 1 && <StepCountrySelect {...stepProps} />}
        {state.step === 2 && <StepCrewSearch {...stepProps} />}
        {state.step === 3 && <StepPassportSelect {...stepProps} />}
        {state.step === 4 && <StepCountryFields {...stepProps} />}
        {state.step === 5 && <StepDocumentUpload {...stepProps} />}
        {state.step === 6 && <StepComplianceCheck {...stepProps} />}
        {state.step === 7 && <StepReviewSubmit {...stepProps} />}
      </div>
    </div>
  )
}
