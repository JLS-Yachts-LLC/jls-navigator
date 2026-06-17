import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { COLORS } from '@/lib/tokens'
import { supabase } from '@/integrations/supabase/client'
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
  draftId?: string | null
}

// Persist an in-progress application as a real DB draft so it appears in the
// Persist wizard progress. Always resolves to a single row per crew member —
// finds an existing record first, updates it; only inserts if none exists.
async function persistDraft(s: WizardState): Promise<string | null> {
  if (!s.crew?.id) return s.draftId ?? null
  const payload: any = {
    crew_member_id:  s.crew.id,
    yacht_id:        s.crew.yacht_id ?? null,
    country_code:    s.countryCode,
    status:          'draft',
    visa_type:       'Crew Visa',
    given_name:      s.crew.first_name ?? null,
    surname:         s.crew.last_name ?? null,
    nationality:     s.passport?.nationality ?? s.crew.nationality ?? null,
    passport_id:     s.passport?.id ?? null,
    passport_number: s.passport?.passport_number ?? null,
    passport_expiry: s.passport?.expiry_date ?? null,
    updated_at:      new Date().toISOString(),
  }
  const db = supabase as any

  // If we already have the row id, update it directly.
  if (s.draftId) {
    await db.from('visa_applications').update(payload).eq('id', s.draftId)
    return s.draftId
  }

  // Look for any existing record for this crew member before inserting.
  const { data: existing } = await db
    .from('visa_applications')
    .select('id')
    .eq('crew_member_id', s.crew.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    await db.from('visa_applications').update(payload).eq('id', existing.id)
    return existing.id
  }

  const { data } = await db.from('visa_applications').insert(payload).select('id').single()
  return data?.id ?? null
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

export const VISA_DRAFT_KEY = 'polaris.visaDraft'

export default function NewApplicationWizard({ onClose }: Props) {
  const navigate = useNavigate()
  const [state, setState] = useState<WizardState>(INITIAL_STATE)
  // A previously saved, unfinished application (offered for resume on mount).
  const [draft] = useState<WizardState | null>(() => {
    try {
      const raw = localStorage.getItem(VISA_DRAFT_KEY)
      if (raw) { const d = JSON.parse(raw); if (d && (d.step > 1 || d.crew)) return d as WizardState }
    } catch { /* ignore */ }
    return null
  })
  const [draftHandled, setDraftHandled] = useState(false)

  // Resume a specific draft from the list (?draft=<id>): load the saved row +
  // crew (+ passport) into wizard state so editing continues where it left off.
  useEffect(() => {
    const draftId = new URLSearchParams(window.location.search).get('draft')
    if (!draftId) return
    setDraftHandled(true)
    ;(async () => {
      const db = supabase as any
      const { data: app } = await db.from('visa_applications').select('*').eq('id', draftId).maybeSingle()
      if (!app) return
      const { data: crew } = app.crew_member_id
        ? await db.from('crew_members').select('*').eq('id', app.crew_member_id).maybeSingle()
        : { data: null }
      let passports: any[] = []
      let passport: any = null
      if (crew?.id) {
        try { passports = await loadCrewPassports(crew.id) } catch { passports = [] }
        passport = app.passport_id ? passports.find(p => p.id === app.passport_id) ?? null : null
      }
      setState(prev => ({
        ...prev,
        draftId,
        countryCode: app.country_code ?? prev.countryCode,
        crew: crew ?? prev.crew,
        passports,
        passport,
        step: passport ? 4 : crew ? 3 : 2,
      }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-save progress so the application can be paused and continued anytime.
  useEffect(() => {
    try {
      if (state.step > 1 || state.crew) localStorage.setItem(VISA_DRAFT_KEY, JSON.stringify(state))
    } catch { /* ignore */ }
  }, [state])

  // Persist a real DB draft once a crew member is chosen, and keep it updated.
  const draftBusy = useRef(false)
  useEffect(() => {
    if (!state.crew?.id || draftBusy.current) return
    draftBusy.current = true
    persistDraft(state)
      .then(id => { if (id && id !== state.draftId) setState(p => ({ ...p, draftId: id })) })
      .catch(() => {})
      .finally(() => { draftBusy.current = false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.crew?.id, state.countryCode, state.passport?.id])

  function resumeDraft() { if (draft) setState(draft); setDraftHandled(true) }
  function startOver() { try { localStorage.removeItem(VISA_DRAFT_KEY) } catch {}; setState(INITIAL_STATE); setDraftHandled(true) }
  function saveAndExit() { navigate({ to: '/crew-immigration/visas' }) } // draft already persisted

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
            Step {state.step} of 7 · {STEP_LABELS[state.step - 1]} · progress saves automatically
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={saveAndExit}
            style={{
              background: 'transparent', border: `1px solid ${COLORS.ocean}`, cursor: 'pointer',
              color: COLORS.frost, fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
            title="Save your progress and continue later"
          >
            Save &amp; exit
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.muted, fontSize: 22, lineHeight: 1, padding: '2px 6px', borderRadius: 4 }}
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Resume draft banner */}
      {draft && !draftHandled && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: `${COLORS.signal}14`, borderBottom: `1px solid ${COLORS.signal}33`,
          padding: '10px 28px', fontFamily: "'Space Grotesk', sans-serif",
        }}>
          <span style={{ color: COLORS.frost, fontSize: 13, flex: 1 }}>
            You have an unfinished visa application (step {draft.step} of 7). Resume where you left off?
          </span>
          <button onClick={resumeDraft} style={{ background: COLORS.signal, color: COLORS.void, border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Resume
          </button>
          <button onClick={startOver} style={{ background: 'transparent', color: COLORS.muted, border: `1px solid ${COLORS.ocean}`, borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
            Start over
          </button>
        </div>
      )}

      {/* Progress Bar */}
      <div
        style={{
          background: COLORS.deep,
          borderBottom: `1px solid ${COLORS.steel}`,
          padding: '12px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Battery-style progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700, color: COLORS.frost, whiteSpace: 'nowrap' }}>
            Step {state.step} of {STEP_LABELS.length}
          </span>
          <div style={{ flex: 1, height: 9, borderRadius: 6, background: COLORS.void, border: `1px solid ${COLORS.steel}`, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((state.step / STEP_LABELS.length) * 100)}%`, height: '100%', background: COLORS.signal, borderRadius: 6, transition: 'width 0.25s ease' }} />
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700, color: COLORS.signal, whiteSpace: 'nowrap', minWidth: 34, textAlign: 'right' }}>
            {Math.round((state.step / STEP_LABELS.length) * 100)}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
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
      </div>

      {/* Step Content — extra right/bottom padding so footer buttons clear the
          floating Leo assistant orb fixed in the bottom-right corner */}
      <div style={{ flex: 1, padding: '24px 96px 110px 28px' }}>
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
