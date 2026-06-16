import React, { useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { supabase } from '@/integrations/supabase/client'
import { upsertPassport, type CrewMember, type CrewPassport } from '@/lib/visa/crewMatching'
import { COUNTRY_CONFIGS, type CountryVisaConfig, type CountryCode } from '@/lib/visa/countryConfig'
import type { ComplianceResult } from '@/lib/visa/complianceChecks'

// ─── Wizard state shape ───────────────────────────────────────────────────────

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

interface StepPassportSelectProps {
  state: WizardState
  onUpdate: (partial: Partial<WizardState>) => void
  onNext: () => void
  onBack: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getExpiryColor(expiryDate: string): string {
  const expiry = new Date(expiryDate)
  const now = new Date()
  const sixMonths = new Date(now)
  sixMonths.setMonth(sixMonths.getMonth() + 6)
  const twelveMonths = new Date(now)
  twelveMonths.setMonth(twelveMonths.getMonth() + 12)

  if (expiry < sixMonths) return COLORS.warn
  if (expiry < twelveMonths) return COLORS.leoAmber
  return '#22c55e'
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getExpiryLabel(expiryDate: string): string {
  const expiry = new Date(expiryDate)
  const now = new Date()
  const sixMonths = new Date(now)
  sixMonths.setMonth(sixMonths.getMonth() + 6)
  const twelveMonths = new Date(now)
  twelveMonths.setMonth(twelveMonths.getMonth() + 12)

  if (expiry < now) return 'Expired'
  if (expiry < sixMonths) return 'Expires < 6 months'
  if (expiry < twelveMonths) return 'Expires < 12 months'
  return 'Valid'
}

// ─── Add Passport Form ────────────────────────────────────────────────────────

interface AddPassportFormProps {
  crewId: string
  onSaved: (passport: CrewPassport) => void
  onCancel?: () => void
  showCancel: boolean
}

function AddPassportForm({ crewId, onSaved, onCancel, showCancel }: AddPassportFormProps) {
  const [nationality, setNationality] = useState('')
  const [passportNumber, setPassportNumber] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [issuingCountry, setIssuingCountry] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fieldStyle: React.CSSProperties = {
    background: COLORS.deep,
    border: `1px solid ${COLORS.ocean}`,
    borderRadius: 8,
    color: COLORS.frost,
    fontFamily: FONTS.display,
    fontSize: 14,
    padding: '8px 12px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: FONTS.display,
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 4,
    display: 'block',
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!nationality.trim() || !passportNumber.trim() || !issueDate || !expiryDate || !issuingCountry.trim()) {
      setError('All fields except document upload are required.')
      return
    }

    setUploading(true)
    try {
      let documentUrl: string | null = null

      if (docFile) {
        const ext = docFile.name.split('.').pop()
        const path = `crew/${crewId}/passport_${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('permit-documents')
          .upload(path, docFile, { upsert: true })
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage
          .from('permit-documents')
          .getPublicUrl(path)
        documentUrl = urlData.publicUrl
      }

      const saved = await upsertPassport({
        crew_id: crewId,
        nationality: nationality.trim(),
        passport_number: passportNumber.trim(),
        issue_date: issueDate,
        expiry_date: expiryDate,
        issuing_country: issuingCountry.trim(),
        is_primary: false,
        document_url: documentUrl,
      })

      onSaved(saved)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save passport.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          background: COLORS.abyss,
          border: `1px solid ${COLORS.ocean}`,
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 15,
            fontWeight: 600,
            color: COLORS.frost,
            marginBottom: 16,
          }}
        >
          Add Passport
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>Nationality</label>
            <input
              style={fieldStyle}
              value={nationality}
              onChange={e => setNationality(e.target.value)}
              placeholder="e.g. British"
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Passport Number</label>
            <input
              style={{ ...fieldStyle, fontFamily: 'Courier New, monospace', letterSpacing: '0.08em' }}
              value={passportNumber}
              onChange={e => setPassportNumber(e.target.value)}
              placeholder="e.g. 123456789"
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Issue Date</label>
            <input
              type="date"
              style={fieldStyle}
              value={issueDate}
              onChange={e => setIssueDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Expiry Date</label>
            <input
              type="date"
              style={fieldStyle}
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              required
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Issuing Country</label>
            <input
              style={fieldStyle}
              value={issuingCountry}
              onChange={e => setIssuingCountry(e.target.value)}
              placeholder="e.g. United Kingdom"
              required
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Passport Document (optional)</label>
            <div
              style={{
                background: COLORS.deep,
                border: `1px dashed ${COLORS.ocean}`,
                borderRadius: 8,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
              }}
              onClick={() => document.getElementById('passport-doc-upload')?.click()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted} strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span style={{ fontFamily: FONTS.display, fontSize: 13, color: docFile ? COLORS.frost : COLORS.muted }}>
                {docFile ? docFile.name : 'Upload passport scan / photo'}
              </span>
              <input
                id="passport-doc-upload"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: 'none' }}
                onChange={e => setDocFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              background: `${COLORS.warn}22`,
              border: `1px solid ${COLORS.warn}`,
              borderRadius: 8,
              padding: '8px 12px',
              color: COLORS.warn,
              fontFamily: FONTS.display,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {showCancel && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: 'transparent',
                border: `1px solid ${COLORS.steel}`,
                borderRadius: 8,
                color: COLORS.muted,
                fontFamily: FONTS.display,
                fontSize: 14,
                padding: '8px 18px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={uploading}
            style={{
              background: COLORS.signal,
              border: 'none',
              borderRadius: 8,
              color: COLORS.void,
              fontFamily: FONTS.display,
              fontSize: 14,
              fontWeight: 600,
              padding: '8px 20px',
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            {uploading ? 'Saving…' : 'Save Passport'}
          </button>
        </div>
      </div>
    </form>
  )
}

// ─── Passport Card ────────────────────────────────────────────────────────────

interface PassportCardProps {
  passport: CrewPassport
  selected: boolean
  onSelect: () => void
}

function PassportCard({ passport, selected, onSelect }: PassportCardProps) {
  const expiryColor = getExpiryColor(passport.expiry_date)
  const expiryLabel = getExpiryLabel(passport.expiry_date)

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        background: selected ? `${COLORS.signal}18` : COLORS.abyss,
        border: `2px solid ${selected ? COLORS.signal : COLORS.ocean}`,
        borderRadius: 12,
        padding: '16px 20px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Top row: nationality + badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24, lineHeight: 1 }}>{getFlagEmoji(passport.nationality)}</span>
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 15,
            fontWeight: 600,
            color: COLORS.frost,
            flex: 1,
          }}
        >
          {passport.nationality}
        </span>
        {passport.is_primary && (
          <span
            style={{
              background: `${COLORS.signal}22`,
              border: `1px solid ${COLORS.signal}`,
              borderRadius: 4,
              color: COLORS.signal,
              fontFamily: FONTS.display,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.05em',
              padding: '2px 8px',
              textTransform: 'uppercase',
            }}
          >
            Primary
          </span>
        )}
        {selected && (
          <span
            style={{
              background: COLORS.signal,
              borderRadius: '50%',
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke={COLORS.void} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>

      {/* Passport number + dates */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.steel, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
            Passport No.
          </div>
          <div style={{ fontFamily: 'Courier New, monospace', fontSize: 15, color: COLORS.frost, letterSpacing: '0.1em', fontWeight: 600 }}>
            {passport.passport_number}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.steel, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
            Issued
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 14, color: COLORS.frost }}>
            {formatDate(passport.issue_date)}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.steel, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
            Expires
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 14, color: expiryColor, fontWeight: 600 }}>
            {formatDate(passport.expiry_date)}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.steel, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
            Status
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: `${expiryColor}18`,
              border: `1px solid ${expiryColor}55`,
              borderRadius: 4,
              padding: '1px 8px',
              fontFamily: FONTS.display,
              fontSize: 12,
              fontWeight: 600,
              color: expiryColor,
            }}
          >
            {expiryLabel}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.steel, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
            Issued By
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 14, color: COLORS.frost }}>
            {passport.issuing_country}
          </div>
        </div>
      </div>

      {passport.document_url && (
        <a
          href={passport.document_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            fontFamily: FONTS.display,
            fontSize: 12,
            color: COLORS.signal,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          View document
        </a>
      )}
    </button>
  )
}

// Very basic: try to turn a country name like "British" or "United Kingdom" into a flag emoji.
// Falls back to a generic passport icon string.
function getFlagEmoji(nationality: string): string {
  const map: Record<string, string> = {
    british: '🇬🇧',
    'united kingdom': '🇬🇧',
    uk: '🇬🇧',
    american: '🇺🇸',
    'united states': '🇺🇸',
    us: '🇺🇸',
    usa: '🇺🇸',
    australian: '🇦🇺',
    australia: '🇦🇺',
    canadian: '🇨🇦',
    canada: '🇨🇦',
    french: '🇫🇷',
    france: '🇫🇷',
    german: '🇩🇪',
    germany: '🇩🇪',
    dutch: '🇳🇱',
    netherlands: '🇳🇱',
    'south african': '🇿🇦',
    'south africa': '🇿🇦',
    italian: '🇮🇹',
    italy: '🇮🇹',
    spanish: '🇪🇸',
    spain: '🇪🇸',
    portuguese: '🇵🇹',
    portugal: '🇵🇹',
    greek: '🇬🇷',
    greece: '🇬🇷',
    'new zealand': '🇳🇿',
    kiwi: '🇳🇿',
    irish: '🇮🇪',
    ireland: '🇮🇪',
    norwegian: '🇳🇴',
    norway: '🇳🇴',
    swedish: '🇸🇪',
    sweden: '🇸🇪',
    danish: '🇩🇰',
    denmark: '🇩🇰',
    filipino: '🇵🇭',
    philippines: '🇵🇭',
    indonesian: '🇮🇩',
    indonesia: '🇮🇩',
    indian: '🇮🇳',
    india: '🇮🇳',
  }
  return map[nationality.toLowerCase()] ?? '🛂'
}

// ─── Main Step Component ──────────────────────────────────────────────────────

export function StepPassportSelect({ state, onUpdate, onNext, onBack }: StepPassportSelectProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [localPassports, setLocalPassports] = useState<CrewPassport[]>(state.passports)

  const countryConfig = COUNTRY_CONFIGS[state.countryCode as CountryCode]
  const countryName = countryConfig?.countryName ?? state.countryCode
  const countryFlag = countryConfig?.flag ?? ''

  const multiplePassports = state.crew?.multiple_passports ?? false
  const noPassports = localPassports.length === 0

  function handlePassportSaved(passport: CrewPassport) {
    const updated = [...localPassports, passport]
    setLocalPassports(updated)
    onUpdate({ passports: updated, passport })
    setShowAddForm(false)
  }

  function handleSelectPassport(passport: CrewPassport) {
    onUpdate({ passport })
  }

  const canContinue = state.passport !== null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 20,
            fontWeight: 700,
            color: COLORS.frost,
            marginBottom: 6,
          }}
        >
          Select Passport
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 14,
            color: COLORS.muted,
            lineHeight: 1.5,
          }}
        >
          Select the passport you are using for this{' '}
          <span style={{ color: COLORS.frost }}>
            {countryFlag} {countryName}
          </span>{' '}
          application. You must explicitly choose even if only one passport is listed.
        </div>
      </div>

      {/* Passport list or empty state */}
      {noPassports && !showAddForm ? (
        <div
          style={{
            background: COLORS.abyss,
            border: `1px solid ${COLORS.ocean}`,
            borderRadius: 12,
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 36 }}>🛂</div>
          <div style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 600, color: COLORS.frost }}>
            No passports on file
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.muted, maxWidth: 340 }}>
            {state.crew?.full_name ?? 'This crew member'} has no passports recorded yet. Add one below to continue.
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            style={{
              background: COLORS.signal,
              border: 'none',
              borderRadius: 8,
              color: COLORS.void,
              fontFamily: FONTS.display,
              fontSize: 14,
              fontWeight: 600,
              padding: '10px 22px',
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            + Add Passport
          </button>
        </div>
      ) : (
        <>
          {localPassports.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {localPassports.map(p => (
                <PassportCard
                  key={p.id}
                  passport={p}
                  selected={state.passport?.id === p.id}
                  onSelect={() => handleSelectPassport(p)}
                />
              ))}
            </div>
          )}

          {/* Add another button — only shown when multiple_passports=true and form isn't open */}
          {(multiplePassports || localPassports.length === 0) && !showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              style={{
                background: 'transparent',
                border: `1px dashed ${COLORS.ocean}`,
                borderRadius: 10,
                color: COLORS.muted,
                fontFamily: FONTS.display,
                fontSize: 14,
                padding: '12px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.signal
                ;(e.currentTarget as HTMLButtonElement).style.color = COLORS.signal
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.ocean
                ;(e.currentTarget as HTMLButtonElement).style.color = COLORS.muted
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add {localPassports.length > 0 ? 'another' : 'a'} passport
            </button>
          )}

          {/* Inline add form */}
          {showAddForm && state.crew && (
            <AddPassportForm
              crewId={state.crew.id}
              onSaved={handlePassportSaved}
              onCancel={() => setShowAddForm(false)}
              showCancel={localPassports.length > 0}
            />
          )}
        </>
      )}

      {/* Selection required notice */}
      {localPassports.length > 0 && !state.passport && (
        <div
          style={{
            background: `color-mix(in oklab, ${COLORS.ocean} 20%, transparent)`,
            border: `1px solid ${COLORS.ocean}`,
            borderRadius: 8,
            padding: '10px 14px',
            fontFamily: FONTS.display,
            fontSize: 13,
            color: COLORS.muted,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted} strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Please select a passport to continue.
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'transparent',
            border: `1px solid ${COLORS.steel}`,
            borderRadius: 8,
            color: COLORS.muted,
            fontFamily: FONTS.display,
            fontSize: 14,
            padding: '10px 22px',
            cursor: 'pointer',
          }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          style={{
            background: canContinue ? COLORS.signal : COLORS.ocean,
            border: 'none',
            borderRadius: 8,
            color: canContinue ? COLORS.void : COLORS.steel,
            fontFamily: FONTS.display,
            fontSize: 14,
            fontWeight: 600,
            padding: '10px 28px',
            cursor: canContinue ? 'pointer' : 'not-allowed',
            opacity: canContinue ? 1 : 0.7,
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

export default StepPassportSelect
