import { storageRef } from '@/lib/signed-url'
import React, { useRef, useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { COLORS, FONTS } from '@/lib/tokens'
import type { CrewMember, CrewPassport } from '@/lib/visa/crewMatching'
import type { CountryVisaConfig } from '@/lib/visa/countryConfig'
import { COUNTRY_CONFIGS } from '@/lib/visa/countryConfig'
import { SignedAnchor } from '@/components/ui/signed-file'
import type { ComplianceResult } from '@/lib/visa/complianceChecks'
import { resolveApplicationDocuments, slotComplete } from '@/lib/visa/resolveApplicationDocuments'
import type { DocumentSlot } from '@/lib/visa/resolveApplicationDocuments'

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

interface Props {
  state: WizardState
  onUpdate: (partial: Partial<WizardState>) => void
  onNext: () => void
  onBack: () => void
}

function docKey(label: string) {
  return label.replace(/ /g, '_')
}

/** For non-UAE countries, resolve slots from the country config. */
function legacySlotsFromConfig(config: CountryVisaConfig | undefined, passport: CrewPassport | null): DocumentSlot[] {
  const docs = config?.requiredDocuments ?? []
  return docs.map(label => {
    const l   = label.toLowerCase()
    let url: string | null = null
    if (passport) {
      if (l.includes('seaman'))                                          url = passport.seamans_book_url ?? null
      else if (l.includes('photo') || l.includes('headshot'))           url = passport.headshot_url    ?? null
      else if (l.includes('cover'))                                      url = passport.cover_url       ?? null
      else if (l.includes('passport') || l.includes('bio') || l.includes('data page')) url = passport.document_url ?? null
    }
    return {
      key:      docKey(label),
      label,
      url,
      source:   url ? 'passport' as const : null,
      required: true,
    }
  })
}

export default function StepDocumentUpload({ state, onUpdate, onNext, onBack }: Props) {
  const config: CountryVisaConfig | undefined =
    (COUNTRY_CONFIGS as Record<string, CountryVisaConfig>)[state.countryCode]

  // UAE uses fixed 4-slot resolution; all other countries use config-driven list.
  const slots: DocumentSlot[] = state.countryCode === 'AE'
    ? resolveApplicationDocuments(state.passport)
    : legacySlotsFromConfig(config, state.passport)

  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Pre-fill passport-sourced documents into uploadedDocs on mount / passport change.
  useEffect(() => {
    if (!state.passport) return
    const updates: Record<string, string> = {}
    for (const slot of slots) {
      if (!slot.url) continue
      if (state.uploadedDocs[slot.key]) continue
      updates[slot.key] = slot.url
    }
    if (Object.keys(updates).length) {
      onUpdate({ uploadedDocs: { ...state.uploadedDocs, ...updates } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.passport, state.countryCode])

  // URLs that originated from the passport record (for the "from passport" badge).
  const passportUrls = new Set(
    [
      state.passport?.document_url,
      state.passport?.cover_url,
      state.passport?.headshot_url,
      state.passport?.seamans_book_url,
    ].filter(Boolean) as string[],
  )

  const completedCount = slots.filter(s => slotComplete(s, state.uploadedDocs)).length
  const allComplete    = completedCount === slots.length
  const canContinue    = allComplete

  async function handleFileChange(slot: DocumentSlot, file: File | null) {
    if (!file) return
    setUploading(u => ({ ...u, [slot.key]: true }))
    setErrors(e => ({ ...e, [slot.key]: '' }))

    const crewId    = state.crew?.id ?? 'unknown'
    const path      = `visa/${crewId}/${state.countryCode}/${slot.key}`
    const { error } = await supabase.storage
      .from('permit-documents')
      .upload(path, file, { upsert: true })

    if (error) {
      setErrors(e => ({ ...e, [slot.key]: error.message }))
      setUploading(u => ({ ...u, [slot.key]: false }))
      return
    }

    onUpdate({
      uploadedDocs: { ...state.uploadedDocs, [slot.key]: storageRef('permit-documents', path) },
    })
    setUploading(u => ({ ...u, [slot.key]: false }))
  }

  function handleRemove(slot: DocumentSlot) {
    // Do not allow removing a passport-sourced document — it came from the passport step.
    if (slot.source === 'passport') return
    const next = { ...state.uploadedDocs }
    delete next[slot.key]
    onUpdate({ uploadedDocs: next })
    if (fileRefs.current[slot.key]) {
      fileRefs.current[slot.key]!.value = ''
    }
  }

  const card: React.CSSProperties = {
    background:    COLORS.abyss,
    border:        `1px solid ${COLORS.deep}`,
    borderRadius:  10,
    padding:       '18px 20px',
    display:       'flex',
    flexDirection: 'column',
    gap:           10,
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: FONTS.display,
    fontSize:   14,
    fontWeight: 600,
    color:      COLORS.frost,
  }

  const mutedStyle: React.CSSProperties = {
    fontFamily: FONTS.display,
    fontSize:   12,
    color:      COLORS.muted,
  }

  // Banner colour: green = all done, amber = missing or pending
  const bannerGreen = allComplete
  const bannerBg    = bannerGreen ? `${COLORS.signal}18`       : `${COLORS.leoAmber}14`
  const bannerBorder= bannerGreen ? COLORS.signal               : COLORS.leoAmber
  const bannerColor = bannerGreen ? COLORS.signal               : COLORS.leoAmber
  const bannerText  = bannerGreen
    ? `${completedCount} of ${slots.length} — all documents provided`
    : `${completedCount} of ${slots.length} provided — all documents required before continuing`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 700, color: COLORS.frost, margin: 0 }}>
          Upload Documents
        </h2>
        <p style={{ fontFamily: FONTS.display, fontSize: 14, color: COLORS.muted, marginTop: 6 }}>
          {config
            ? `Required documents for ${config.flag} ${config.countryName}`
            : 'Upload the required visa documents.'}
        </p>
      </div>

      {/* Progress banner */}
      {slots.length > 0 && (
        <div style={{
          background:   bannerBg,
          border:       `1px solid ${bannerBorder}`,
          borderRadius: 8,
          padding:      '10px 16px',
          fontFamily:   FONTS.display,
          fontSize:     13,
          color:        bannerColor,
        }}>
          {bannerText}
        </div>
      )}

      {slots.length === 0 && (
        <p style={{ fontFamily: FONTS.display, fontSize: 14, color: COLORS.muted }}>
          No specific documents required for this country configuration.
        </p>
      )}

      {/* Document slots */}
      {slots.map(slot => {
        const effectiveUrl = state.uploadedDocs[slot.key] ?? slot.url ?? null
        const isComplete   = slotComplete(slot, state.uploadedDocs)
        const isUploading  = !!uploading[slot.key]
        const errMsg       = errors[slot.key]
        const fromPassport = effectiveUrl ? passportUrls.has(effectiveUrl) : false

        return (
          <div key={slot.key} style={card}>
            {/* Row: status dot + label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width:          20,
                height:         20,
                borderRadius:   '50%',
                flexShrink:     0,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                background:     isComplete ? COLORS.signal
                              : slot.letterPending ? COLORS.leoAmber
                              : COLORS.steel,
              }}>
                {isComplete && !slot.letterPending && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#080D14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {slot.letterPending && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M6 2v4l2.5 2.5" stroke="#080D14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="6" cy="6" r="5" stroke="#080D14" strokeWidth="1.5" />
                  </svg>
                )}
              </div>
              <span style={labelStyle}>{slot.label}</span>
            </div>

            {/* Letter pending state */}
            {slot.letterPending && (
              <div style={{
                paddingLeft: 30,
                display:     'flex',
                flexDirection: 'column',
                gap:         4,
              }}>
                <span style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.leoAmber, fontWeight: 600 }}>
                  Will be issued by our Port & Agency Team
                </span>
                <span style={{ ...mutedStyle }}>
                  No Seaman's Book declared. A JLS Crew Verification Letter will be prepared before submission.
                </span>
              </div>
            )}

            {/* Uploaded / pre-filled state */}
            {!slot.letterPending && isComplete && effectiveUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 30, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.signal, textDecoration: 'underline', wordBreak: 'break-all' }}>
                  <SignedAnchor stored={effectiveUrl}>
                    {decodeURIComponent(effectiveUrl.split('/').pop() ?? 'View file')}
                  </SignedAnchor>
                </span>
                {fromPassport && (
                  <span style={{
                    fontFamily:    FONTS.display,
                    fontSize:      9,
                    fontWeight:    700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color:         COLORS.signal,
                    padding:       '1px 6px',
                    background:    `${COLORS.signal}18`,
                    border:        `1px solid ${COLORS.signal}30`,
                    borderRadius:  3,
                  }}>
                    From passport on file
                  </span>
                )}
                {/* Only allow removing manually-uploaded docs, not passport-sourced ones */}
                {slot.source !== 'passport' && (
                  <button
                    onClick={() => handleRemove(slot)}
                    style={{
                      background: 'none',
                      border:     'none',
                      cursor:     'pointer',
                      fontFamily: FONTS.display,
                      fontSize:   12,
                      color:      COLORS.warn,
                      padding:    0,
                      flexShrink: 0,
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            )}

            {/* Upload button — only shown when slot has no URL and isn't letter_pending */}
            {!slot.letterPending && !isComplete && (
              <div style={{ paddingLeft: 30 }}>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display: 'none' }}
                  ref={el => { fileRefs.current[slot.key] = el }}
                  onChange={e => handleFileChange(slot, e.target.files?.[0] ?? null)}
                  disabled={isUploading}
                />
                <button
                  onClick={() => fileRefs.current[slot.key]?.click()}
                  disabled={isUploading}
                  style={{
                    background:    isUploading ? COLORS.ocean : COLORS.deep,
                    border:        `1px solid ${COLORS.ocean}`,
                    borderRadius:  6,
                    padding:       '7px 16px',
                    cursor:        isUploading ? 'not-allowed' : 'pointer',
                    fontFamily:    FONTS.display,
                    fontSize:      13,
                    fontWeight:    600,
                    color:         isUploading ? COLORS.muted : COLORS.frost,
                    display:       'flex',
                    alignItems:    'center',
                    gap:           8,
                  }}
                >
                  {isUploading ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                           style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="7" cy="7" r="5" stroke={COLORS.muted} strokeWidth="2" strokeDasharray="20 10" />
                      </svg>
                      Uploading…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1v8M4 4l3-3 3 3M2 11h10" stroke={COLORS.signal} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Choose file
                    </>
                  )}
                </button>
                <p style={{ ...mutedStyle, marginTop: 4 }}>PDF, JPG, or PNG accepted</p>
                {slot.key === 'seamans_book_or_letter' && (
                  <p style={{ ...mutedStyle, marginTop: 2 }}>
                    No Seaman's Book? Declare this on the Supporting Documents step — our Port & Agency Team will issue a verification letter.
                  </p>
                )}
              </div>
            )}

            {/* Upload error */}
            {errMsg && (
              <p style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.warn, paddingLeft: 30, margin: 0 }}>
                {errMsg}
              </p>
            )}
          </div>
        )
      })}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <button
          onClick={onBack}
          style={{
            background:   'none',
            border:       `1px solid ${COLORS.steel}`,
            borderRadius: 8,
            padding:      '10px 24px',
            cursor:       'pointer',
            fontFamily:   FONTS.display,
            fontSize:     14,
            fontWeight:   600,
            color:        COLORS.muted,
          }}
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!canContinue}
          style={{
            background:   canContinue ? COLORS.signal : COLORS.steel,
            border:       'none',
            borderRadius: 8,
            padding:      '10px 28px',
            cursor:       canContinue ? 'pointer' : 'not-allowed',
            fontFamily:   FONTS.display,
            fontSize:     14,
            fontWeight:   700,
            color:        canContinue ? COLORS.void : COLORS.muted,
            opacity:      canContinue ? 1 : 0.55,
          }}
        >
          Continue
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
