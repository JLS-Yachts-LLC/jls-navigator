'use client'

import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { COLORS, FONTS } from '@/lib/tokens'
import { useAuth } from '@/lib/auth'
import { getAccessLevel } from '@/lib/leo-access'
import { useFeeConfig } from '@/hooks/useFeeConfig'
import { saveSupportingDocDeclaration } from '@/lib/api/visa'
import { SeamansBookCard } from './SeamansBookCard'
import { SupportingLetterCard } from './SupportingLetterCard'
import { OtherDocumentsCard } from './OtherDocumentsCard'
import { ConfirmationCard } from './ConfirmationCard'

export function SupportingDocumentsPage() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const search    = useSearch({ strict: false }) as { applicationId?: string }
  const applicationId = search.applicationId ?? ''

  const accessLevel = getAccessLevel(user?.email)
  const feeConfig   = useFeeConfig()

  const [seamansBookFile, setSeamansBookFile] = useState<File | null>(null)
  const [letterOption, setLetterOption]       = useState<'yes' | 'no' | null>(null)
  const [letterAuthorised, setLetterAuthorised] = useState(false)
  const [confirmed, setConfirmed]             = useState(false)
  const [saving, setSaving]                   = useState(false)
  const [saveError, setSaveError]             = useState<string | null>(null)

  // Access levels 1–2 (developer / JLS Super Admin) skip this declaration step
  if (accessLevel === 'developer') {
    void navigate({ to: '/crew-immigration/visas/documents/upload', search: { applicationId } })
    return null
  }

  const docReady =
    seamansBookFile !== null ||
    letterOption === 'no'    ||
    (letterOption === 'yes' && letterAuthorised)

  const canContinue = docReady && confirmed

  async function handleContinue() {
    if (!canContinue) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveSupportingDocDeclaration({
        applicationId,
        seamansBookUploaded:          seamansBookFile !== null,
        seamansBookFile:              seamansBookFile ?? undefined,
        supportingLetterRequested:    letterOption === 'yes',
        supportingLetterAuthorised:   letterAuthorised,
        alternativeDocsDeclared:      letterOption === 'no',
        documentsConfirmed:           confirmed,
      })
      void navigate({ to: '/crew-immigration/visas/documents/upload', search: { applicationId } })
    } catch {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      maxWidth: 900, margin: '0 auto',
      padding: '24px 20px',
      fontFamily: FONTS.display,
    }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: `${COLORS.signal}18`, border: `1px solid ${COLORS.signal}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke={COLORS.signal} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <polyline points="9 15 11 17 15 13"/>
          </svg>
        </div>
        <div>
          <h1 style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 700, color: COLORS.frost, margin: 0, marginBottom: 4 }}>
            Crew visa application
          </h1>
          <p style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.muted, margin: 0 }}>
            Please upload clear copies of the required supporting documents
            to help us process your application smoothly.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        background: `${COLORS.signal}10`,
        border: `1px solid ${COLORS.signal}30`,
        borderRadius: 8, padding: '12px 16px', marginBottom: 20,
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke={COLORS.signal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost }}>
          Ensure all documents are clear, complete, and legible.
          Incomplete or unclear documents may cause delays.
        </span>
      </div>

      {/* Two-column card row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 0 }}>
        <SeamansBookCard
          file={seamansBookFile}
          onFileSelect={setSeamansBookFile}
          onFileRemove={() => setSeamansBookFile(null)}
        />
        <SupportingLetterCard
          option={letterOption}
          authorised={letterAuthorised}
          feeAED={feeConfig.supportingLetterAED}
          feeUSD={feeConfig.supportingLetterUSD}
          onOptionChange={setLetterOption}
          onAuthorisedChange={setLetterAuthorised}
        />
      </div>

      <OtherDocumentsCard />
      <ConfirmationCard checked={confirmed} onChange={setConfirmed} />

      {/* Save error */}
      {saveError && (
        <div style={{
          marginTop: 12, fontFamily: FONTS.display, fontSize: 12,
          color: COLORS.warn, textAlign: 'center',
        }}>
          {saveError}
        </div>
      )}

      {/* Navigation row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 24, paddingTop: 20, borderTop: `1px solid ${COLORS.deep}`,
      }}>
        <button
          type="button"
          onClick={() => navigate({ to: -1 as never })}
          style={{
            fontFamily: FONTS.display, fontSize: 13, fontWeight: 600,
            color: COLORS.muted, background: 'none',
            border: `1px solid ${COLORS.deep}`, borderRadius: 7,
            padding: '9px 20px', cursor: 'pointer',
          }}
        >
          ← Back
        </button>
        <button
          type="button"
          disabled={!canContinue || saving}
          onClick={handleContinue}
          style={{
            fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
            color: '#fff', background: canContinue && !saving ? COLORS.signal : COLORS.signal,
            border: 'none', borderRadius: 7,
            padding: '9px 28px', cursor: canContinue && !saving ? 'pointer' : 'not-allowed',
            opacity: canContinue && !saving ? 1 : 0.45,
            transition: 'opacity 0.15s',
          }}
        >
          {saving ? 'Saving…' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}
