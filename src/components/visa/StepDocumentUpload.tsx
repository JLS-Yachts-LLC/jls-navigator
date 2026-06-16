import React, { useRef, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { COLORS, FONTS } from '@/lib/tokens'
import type { CrewMember, CrewPassport } from '@/lib/visa/crewMatching'
import type { CountryVisaConfig } from '@/lib/visa/countryConfig'
import { COUNTRY_CONFIGS } from '@/lib/visa/countryConfig'
import type { ComplianceResult } from '@/lib/visa/complianceChecks'

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

export default function StepDocumentUpload({ state, onUpdate, onNext, onBack }: Props) {
  const config: CountryVisaConfig | undefined =
    (COUNTRY_CONFIGS as Record<string, CountryVisaConfig>)[state.countryCode]
  const requiredDocs: string[] = config?.requiredDocuments ?? []

  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const uploadedCount = requiredDocs.filter(d => !!state.uploadedDocs[docKey(d)]).length
  const canContinue   = uploadedCount >= 1

  async function handleFileChange(docLabel: string, file: File | null) {
    if (!file) return
    const key = docKey(docLabel)
    setUploading(u => ({ ...u, [key]: true }))
    setErrors(e => ({ ...e, [key]: '' }))

    const crewId    = state.crew?.id ?? 'unknown'
    const path      = `visa/${crewId}/${state.countryCode}/${key}`
    const { error } = await supabase.storage
      .from('permit-documents')
      .upload(path, file, { upsert: true })

    if (error) {
      setErrors(e => ({ ...e, [key]: error.message }))
      setUploading(u => ({ ...u, [key]: false }))
      return
    }

    const { data: urlData } = supabase.storage
      .from('permit-documents')
      .getPublicUrl(path)

    onUpdate({
      uploadedDocs: { ...state.uploadedDocs, [key]: urlData.publicUrl },
    })
    setUploading(u => ({ ...u, [key]: false }))
  }

  function handleRemove(docLabel: string) {
    const key = docKey(docLabel)
    const next = { ...state.uploadedDocs }
    delete next[key]
    onUpdate({ uploadedDocs: next })
    if (fileRefs.current[key]) {
      fileRefs.current[key]!.value = ''
    }
  }

  const card: React.CSSProperties = {
    background:   COLORS.abyss,
    border:       `1px solid ${COLORS.deep}`,
    borderRadius: 10,
    padding:      '18px 20px',
    display:      'flex',
    flexDirection: 'column',
    gap:          10,
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

      {/* Progress summary */}
      {requiredDocs.length > 0 && (
        <div
          style={{
            background:   uploadedCount === requiredDocs.length ? `${COLORS.signal}18` : `color-mix(in oklab, ${COLORS.ocean} 33%, transparent)`,
            border:       `1px solid ${uploadedCount === requiredDocs.length ? COLORS.signal : COLORS.deep}`,
            borderRadius: 8,
            padding:      '10px 16px',
            fontFamily:   FONTS.display,
            fontSize:     13,
            color:        uploadedCount === requiredDocs.length ? COLORS.signal : COLORS.muted,
          }}
        >
          {uploadedCount === requiredDocs.length
            ? `${uploadedCount} of ${requiredDocs.length} uploaded — all documents provided`
            : `${uploadedCount} of ${requiredDocs.length} uploaded — you may continue or add remaining later`}
        </div>
      )}

      {/* Document slots */}
      {requiredDocs.length === 0 && (
        <p style={{ fontFamily: FONTS.display, fontSize: 14, color: COLORS.muted }}>
          No specific documents required for this country configuration.
        </p>
      )}

      {requiredDocs.map(docLabel => {
        const key        = docKey(docLabel)
        const isUploaded = !!state.uploadedDocs[key]
        const isLoading  = !!uploading[key]
        const errMsg     = errors[key]

        return (
          <div key={key} style={card}>
            {/* Row: icon + label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Status dot */}
              <div
                style={{
                  width:        20,
                  height:       20,
                  borderRadius: '50%',
                  background:   isUploaded ? COLORS.signal : COLORS.steel,
                  flexShrink:   0,
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                }}
              >
                {isUploaded && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#080D14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span style={labelStyle}>{docLabel}</span>
            </div>

            {/* Uploaded state */}
            {isUploaded && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 30 }}>
                <a
                  href={state.uploadedDocs[key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.signal, textDecoration: 'underline', wordBreak: 'break-all' }}
                >
                  {decodeURIComponent(state.uploadedDocs[key].split('/').pop() ?? 'View file')}
                </a>
                <button
                  onClick={() => handleRemove(docLabel)}
                  style={{
                    background:   'none',
                    border:       'none',
                    cursor:       'pointer',
                    fontFamily:   FONTS.display,
                    fontSize:     12,
                    color:        COLORS.warn,
                    padding:      0,
                    flexShrink:   0,
                  }}
                >
                  Remove
                </button>
              </div>
            )}

            {/* Upload button */}
            {!isUploaded && (
              <div style={{ paddingLeft: 30 }}>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display: 'none' }}
                  ref={el => { fileRefs.current[key] = el }}
                  onChange={e => handleFileChange(docLabel, e.target.files?.[0] ?? null)}
                  disabled={isLoading}
                />
                <button
                  onClick={() => fileRefs.current[key]?.click()}
                  disabled={isLoading}
                  style={{
                    background:    isLoading ? COLORS.ocean : COLORS.deep,
                    border:        `1px solid ${COLORS.ocean}`,
                    borderRadius:  6,
                    padding:       '7px 16px',
                    cursor:        isLoading ? 'not-allowed' : 'pointer',
                    fontFamily:    FONTS.display,
                    fontSize:      13,
                    fontWeight:    600,
                    color:         isLoading ? COLORS.muted : COLORS.frost,
                    display:       'flex',
                    alignItems:    'center',
                    gap:           8,
                  }}
                >
                  {isLoading ? (
                    <>
                      <svg
                        width="14" height="14" viewBox="0 0 14 14" fill="none"
                        style={{ animation: 'spin 1s linear infinite' }}
                      >
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
              </div>
            )}

            {/* Error */}
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
