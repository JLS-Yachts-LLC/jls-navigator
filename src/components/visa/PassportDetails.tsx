/**
 * Polaris — Passport Details Page (Step 1: Upload Documents)
 *
 * Part of the Add Crew Member wizard (4-step flow):
 *   1. Upload Documents  ← this page
 *   2. Verify Details
 *   3. Upload Photo
 *   4. Review & Complete
 */

import { useState, useCallback, useRef } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadedFile {
  name: string
  sizeKB: number
  url: string
}

export interface ExtractedPassportData {
  nationality: string
  nationalityFlag: string
  passportNumber: string
  dateOfBirth: string
  issueDate: string
  expiryDate: string
  issuingCountry: string
  validityNote: string
  placeOfBirth: string
  gender: string
  previewImageUrl?: string
}

interface DocumentStatus {
  insidePages: 'uploaded' | 'missing' | 'not_uploaded'
  ocrCompleted: boolean
  minimumValidity: boolean
  headshot: 'uploaded' | 'missing' | 'not_uploaded'
  cover: 'uploaded' | 'missing' | 'not_uploaded'
  seamansBook: 'uploaded' | 'missing' | 'not_uploaded'
}

interface PassportDetailsProps {
  crewMemberId: string
  vesselName?: string
  onContinue: (data: ExtractedPassportData) => void
  onSaveDraft: () => void
  onCancel: () => void
}

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png'
const MAX_SIZE_MB = 10

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps = [
    { n: 1, label: 'Upload Documents',  sub: 'Upload passport and documents' },
    { n: 2, label: 'Verify Details',    sub: 'Confirm extracted information' },
    { n: 3, label: 'Upload Photo',      sub: 'Add headshot photo' },
    { n: 4, label: 'Review & Complete', sub: 'Validation and save' },
  ] as const

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginBottom: 28 }}>
      {steps.map((step, i) => {
        const state = step.n < current ? 'done' : step.n === current ? 'active' : 'upcoming'
        const circleColor =
          state === 'done'    ? COLORS.success :
          state === 'active'  ? COLORS.signal  : COLORS.steel
        const textColor =
          state === 'active'  ? COLORS.frost : COLORS.muted

        return (
          <div key={step.n} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                border: `2px solid ${circleColor}`,
                background: state === 'active' ? `${COLORS.signal}18` : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: circleColor,
                fontFamily: FONTS.display,
              }}>
                {state === 'done' ? '✓' : step.n}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 600, color: textColor }}>
                  {step.label}
                </span>
                <span style={{ fontFamily: FONTS.display, fontSize: 10, color: COLORS.steel }}>
                  {step.sub}
                </span>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: COLORS.deep, margin: '0 12px' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Status Row ───────────────────────────────────────────────────────────────

function StatusRow({ label, status, note }: {
  label: string
  status: 'uploaded' | 'missing' | 'not_uploaded' | boolean
  note?: string
}) {
  const isOk      = status === 'uploaded' || status === true
  const isWarn    = status === 'missing'
  const iconColor = isOk ? COLORS.success : isWarn ? COLORS.warn : COLORS.steel
  const noteColor = isOk ? COLORS.muted   : isWarn ? COLORS.warn  : COLORS.steel
  const icon      = isOk ? '✓' : isWarn ? '!' : '○'

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0', borderBottom: `1px solid ${COLORS.deep}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          background: `${iconColor}18`, border: `1px solid ${iconColor}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: iconColor, flexShrink: 0,
        }} aria-hidden="true">{icon}</span>
        <span style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.frost }}>{label}</span>
      </div>
      {note && (
        <span style={{ fontFamily: FONTS.display, fontSize: 11, color: noteColor }}>{note}</span>
      )}
    </div>
  )
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onFile, file, onRemove }: {
  onFile: (f: File) => void
  file: UploadedFile | null
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [onFile])

  if (file) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        background: `${COLORS.success}12`, border: `1px solid ${COLORS.success}40`,
        borderRadius: 8,
      }}>
        <span style={{
          fontFamily: FONTS.display, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: COLORS.success, padding: '2px 8px',
          background: `${COLORS.success}20`, borderRadius: 3,
        }}>Uploaded</span>
        <span style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost, flex: 1 }}>
          {file.name}
        </span>
        <span style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted }}>
          {file.sizeKB} KB
        </span>
        <button
          onClick={onRemove}
          aria-label="Remove uploaded file"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: COLORS.muted, fontSize: 18, lineHeight: 1, padding: '0 4px',
          }}
        >×</button>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      aria-label="Upload passport inside pages — drag and drop or browse"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 8, padding: '32px 24px',
        border: `2px dashed ${dragging ? COLORS.signal : COLORS.deep}`,
        borderRadius: 10, cursor: 'pointer',
        background: dragging ? `${COLORS.signal}08` : COLORS.void,
        transition: 'border-color 0.15s, background 0.15s',
        textAlign: 'center',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
      <div style={{ fontSize: 28, color: COLORS.signal }} aria-hidden="true">↑</div>
      <div style={{ fontFamily: FONTS.display, fontSize: 13, fontWeight: 600, color: COLORS.signal }}>
        Drag &amp; drop passport inside pages here
      </div>
      <div style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted }}>
        PDF, JPG or PNG (Max. {MAX_SIZE_MB}MB)
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
        style={{
          marginTop: 4, padding: '7px 18px',
          fontFamily: FONTS.display, fontSize: 12, fontWeight: 600,
          color: COLORS.signal, background: 'none',
          border: `1px solid ${COLORS.signal}60`, borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Browse Files
      </button>
    </div>
  )
}

// ─── Small Upload Card ────────────────────────────────────────────────────────

function SmallUploadCard({ number, label, optional, icon, file, onFile, onRemove, disabled }: {
  number: number
  label: string
  optional?: boolean
  icon: string
  file: UploadedFile | null
  onFile: (f: File) => void
  onRemove: () => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{
      flex: 1, padding: '12px 14px',
      background: COLORS.abyss, border: `1px solid ${COLORS.deep}`,
      borderRadius: 8, opacity: disabled ? 0.45 : 1,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 700, color: COLORS.muted }}>
          {number}.
        </span>
        <span style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 600, color: COLORS.frost, flex: 1 }}>
          {label}
        </span>
        {optional && (
          <span style={{ fontFamily: FONTS.display, fontSize: 10, color: COLORS.steel,
                          fontStyle: 'italic' }}>Optional</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }} aria-hidden="true">{icon}</span>
        {file ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.frost,
                            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap' }}>
              {file.name}
            </span>
            <button
              onClick={onRemove}
              aria-label="Remove"
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                       color: COLORS.muted, fontSize: 16, padding: 0, lineHeight: 1 }}
            >×</button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            style={{
              fontFamily: FONTS.display, fontSize: 11, fontWeight: 600,
              color: COLORS.signal, background: 'none',
              border: `1px solid ${COLORS.signal}50`, borderRadius: 5,
              padding: '4px 12px', cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            Upload ↑
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
    </div>
  )
}

// ─── Extracted Field ──────────────────────────────────────────────────────────

function ExtractedField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{
        fontFamily: FONTS.display, fontSize: 9, fontWeight: 700,
        letterSpacing: '0.18em', textTransform: 'uppercase', color: COLORS.steel,
      }}>
        {label}
      </span>
      {children}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PassportDetails({
  crewMemberId,
  vesselName = 'M/Y Polaris',
  onContinue,
  onSaveDraft,
  onCancel,
}: PassportDetailsProps) {
  const [insidePages, setInsidePages]   = useState<UploadedFile | null>(null)
  const [coverFile, setCoverFile]       = useState<UploadedFile | null>(null)
  const [seamansFile, setSeamansFile]   = useState<UploadedFile | null>(null)
  const [headshotFile, setHeadshotFile] = useState<UploadedFile | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extracted, setExtracted]       = useState<ExtractedPassportData | null>(null)
  const [isEditing, setIsEditing]       = useState(false)

  const toUploadedFile = (f: File): UploadedFile => ({
    name: f.name,
    sizeKB: Math.round(f.size / 1024),
    url: URL.createObjectURL(f),
  })

  const handleInsidePages = useCallback(async (f: File) => {
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`File exceeds ${MAX_SIZE_MB}MB limit.`)
      return
    }
    const uploaded = toUploadedFile(f)
    setInsidePages(uploaded)
    setIsExtracting(true)

    // ── Replace with real OCR API call ──────────────────────────────────────
    // const formData = new FormData()
    // formData.append('file', f)
    // formData.append('crew_member_id', crewMemberId)
    // const res = await fetch('/api/passport/extract', { method: 'POST', body: formData })
    // const data = await res.json()
    // setExtracted(data)
    //
    // Mock (remove when API is wired up):
    await new Promise((r) => setTimeout(r, 1800))
    setExtracted({
      nationality:       'Irish',
      nationalityFlag:   '🇮🇪',
      passportNumber:    'LT5021572',
      dateOfBirth:       '15 Mar 1988',
      issueDate:         '06 Mar 2021',
      expiryDate:        '05 Mar 2031',
      issuingCountry:    'Ireland',
      validityNote:      'Valid for 5 years',
      placeOfBirth:      'Dublin',
      gender:            'Male',
      previewImageUrl:   uploaded.url,
    })
    setIsExtracting(false)
    // ── End OCR block ────────────────────────────────────────────────────────
  }, [crewMemberId])

  const docStatus: DocumentStatus = {
    insidePages:     insidePages  ? 'uploaded'     : 'not_uploaded',
    ocrCompleted:    !!extracted,
    minimumValidity: !!extracted,
    headshot:        headshotFile ? 'uploaded'     : 'missing',
    cover:           coverFile    ? 'uploaded'     : 'not_uploaded',
    seamansBook:     seamansFile  ? 'uploaded'     : 'not_uploaded',
  }

  const canContinue = !!insidePages && !!extracted

  return (
    <div style={{ fontFamily: FONTS.display, color: COLORS.frost,
                  background: COLORS.void, minHeight: '100vh', padding: '24px 28px' }}>

      {/* Step indicator */}
      <StepIndicator current={1} />

      {/* Main layout: content + sidebar */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* Left column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Section 1: Passport Inside Pages */}
          <section style={{
            background: COLORS.abyss, border: `1px solid ${COLORS.deep}`,
            borderRadius: 10, padding: '22px 24px',
          }}>
            <h2 style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 700,
                          color: COLORS.frost, marginBottom: 16 }}>
              1. Passport Inside Pages
            </h2>

            <UploadZone
              onFile={handleInsidePages}
              file={insidePages}
              onRemove={() => { setInsidePages(null); setExtracted(null) }}
            />

            {isExtracting && (
              <p role="status" aria-live="polite" style={{
                fontFamily: FONTS.display, fontSize: 12, color: COLORS.signal,
                margin: '10px 0 0', animation: 'pulse 1.2s infinite',
              }}>
                Scanning passport — extracting details…
              </p>
            )}

            <p style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.steel,
                         fontStyle: 'italic', margin: '10px 0 16px' }}>
              Tip: Upload the data page(s) of the passport (the pages with photo and details).
            </p>

            {/* Secondary uploads */}
            <div style={{ display: 'flex', gap: 10 }}>
              <SmallUploadCard number={2} label="Passport Cover" optional icon="📄"
                file={coverFile} onFile={(f) => setCoverFile(toUploadedFile(f))}
                onRemove={() => setCoverFile(null)} />
              <SmallUploadCard number={3} label="Seaman's Book" optional icon="📋"
                file={seamansFile} onFile={(f) => setSeamansFile(toUploadedFile(f))}
                onRemove={() => setSeamansFile(null)} />
              <SmallUploadCard number={4} label="Headshot Photo" icon="👤"
                file={headshotFile} onFile={(f) => setHeadshotFile(toUploadedFile(f))}
                onRemove={() => setHeadshotFile(null)} />
            </div>
          </section>

          {/* Section 2: Preview + Extracted Info (shown after OCR) */}
          {extracted && (
            <section style={{
              background: COLORS.abyss, border: `1px solid ${COLORS.deep}`,
              borderRadius: 10, padding: '22px 24px',
            }}>
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

                {/* Passport preview */}
                <div style={{
                  width: '38%', flexShrink: 0, background: COLORS.void,
                  border: `1px solid ${COLORS.deep}`, borderRadius: 8,
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '10px 14px', borderBottom: `1px solid ${COLORS.deep}` }}>
                    <span style={{ fontFamily: FONTS.display, fontSize: 11, fontWeight: 700,
                                    letterSpacing: '0.15em', textTransform: 'uppercase',
                                    color: COLORS.steel }}>
                      Passport Preview
                    </span>
                  </div>
                  {extracted.previewImageUrl ? (
                    <img
                      src={extracted.previewImageUrl}
                      alt="Uploaded passport — inside pages"
                      style={{ width: '100%', display: 'block' }}
                    />
                  ) : (
                    <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: COLORS.steel }}>
                      No image preview available
                    </div>
                  )}
                </div>

                {/* Extracted data */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <span style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 700,
                                    color: COLORS.frost }}>
                      Extracted Information
                    </span>
                    <span style={{
                      fontFamily: FONTS.display, fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      color: COLORS.leoAmber, padding: '2px 8px',
                      background: `${COLORS.leoAmber}18`, borderRadius: 3,
                    }}>
                      Auto-filled
                    </span>
                  </div>

                  {/* Grid of fields */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 14, marginBottom: 16,
                  }}>

                    {/* Nationality */}
                    <ExtractedField label="Nationality">
                      {isEditing ? (
                        <input value={extracted.nationality}
                          onChange={(e) => setExtracted(prev => prev ? { ...prev, nationality: e.target.value } : prev)}
                          style={inputStyle} />
                      ) : (
                        <span style={valueStyle}>{extracted.nationalityFlag} {extracted.nationality}</span>
                      )}
                    </ExtractedField>

                    {/* Passport Number */}
                    <ExtractedField label="Passport Number">
                      {isEditing ? (
                        <input value={extracted.passportNumber}
                          onChange={(e) => setExtracted(prev => prev ? { ...prev, passportNumber: e.target.value } : prev)}
                          style={inputStyle} />
                      ) : (
                        <span style={valueStyle}>{extracted.passportNumber}</span>
                      )}
                    </ExtractedField>

                    {/* Date of Birth */}
                    <ExtractedField label="Date of Birth">
                      {isEditing ? (
                        <input type="date" value={extracted.dateOfBirth}
                          onChange={(e) => setExtracted(prev => prev ? { ...prev, dateOfBirth: e.target.value } : prev)}
                          style={inputStyle} />
                      ) : (
                        <span style={valueStyle}>{extracted.dateOfBirth}</span>
                      )}
                    </ExtractedField>

                    {/* Issue Date */}
                    <ExtractedField label="Issue Date">
                      {isEditing ? (
                        <input type="date" value={extracted.issueDate}
                          onChange={(e) => setExtracted(prev => prev ? { ...prev, issueDate: e.target.value } : prev)}
                          style={inputStyle} />
                      ) : (
                        <span style={valueStyle}>{extracted.issueDate}</span>
                      )}
                    </ExtractedField>

                    {/* Expiry Date */}
                    <ExtractedField label="Expiry Date">
                      {isEditing ? (
                        <input type="date" value={extracted.expiryDate}
                          onChange={(e) => setExtracted(prev => prev ? { ...prev, expiryDate: e.target.value } : prev)}
                          style={inputStyle} />
                      ) : (
                        <div>
                          <span style={valueStyle}>{extracted.expiryDate}</span>
                          <span style={{ display: 'block', fontSize: 11, color: COLORS.signal, marginTop: 2 }}>
                            {extracted.validityNote}
                          </span>
                        </div>
                      )}
                    </ExtractedField>

                    {/* Issuing Country */}
                    <ExtractedField label="Issuing Country">
                      {isEditing ? (
                        <input value={extracted.issuingCountry}
                          onChange={(e) => setExtracted(prev => prev ? { ...prev, issuingCountry: e.target.value } : prev)}
                          style={inputStyle} />
                      ) : (
                        <span style={valueStyle}>{extracted.issuingCountry}</span>
                      )}
                    </ExtractedField>

                    {/* Place of Birth */}
                    <ExtractedField label="Place of Birth">
                      {isEditing ? (
                        <input value={extracted.placeOfBirth}
                          onChange={(e) => setExtracted(prev => prev ? { ...prev, placeOfBirth: e.target.value } : prev)}
                          style={inputStyle} />
                      ) : (
                        <span style={valueStyle}>{extracted.placeOfBirth}</span>
                      )}
                    </ExtractedField>

                    {/* Gender */}
                    <ExtractedField label="Gender">
                      {isEditing ? (
                        <select value={extracted.gender}
                          onChange={(e) => setExtracted(prev => prev ? { ...prev, gender: e.target.value } : prev)}
                          style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option>Male</option>
                          <option>Female</option>
                          <option>Other</option>
                        </select>
                      ) : (
                        <span style={valueStyle}>{extracted.gender}</span>
                      )}
                    </ExtractedField>

                  </div>

                  <button
                    type="button"
                    onClick={() => setIsEditing(v => !v)}
                    style={{
                      fontFamily: FONTS.display, fontSize: 12, fontWeight: 600,
                      color: isEditing ? COLORS.success : COLORS.signal,
                      background: 'none',
                      border: `1px solid ${isEditing ? COLORS.success : COLORS.signal}60`,
                      borderRadius: 6, padding: '6px 16px', cursor: 'pointer',
                    }}
                  >
                    {isEditing ? '✓  Save changes' : '✎  Edit Information'}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right sidebar */}
        <aside style={{
          width: 280, flexShrink: 0,
          background: COLORS.abyss, border: `1px solid ${COLORS.deep}`,
          borderRadius: 10, padding: '18px 20px',
        }} aria-label="Document status">
          <h2 style={{ fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
                        color: COLORS.frost, marginBottom: 14 }}>
            Document Status
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <StatusRow label="Passport inside pages" status={docStatus.insidePages}
              note={docStatus.insidePages === 'uploaded' ? 'Uploaded' : undefined} />
            <StatusRow label="OCR extraction completed" status={docStatus.ocrCompleted} />
            <StatusRow label="Minimum 6 months validity" status={docStatus.minimumValidity} />
            <StatusRow label="Headshot photo" status={docStatus.headshot}
              note={docStatus.headshot === 'missing' ? 'Missing' : undefined} />
            <StatusRow label="Passport cover" status={docStatus.cover}
              note={docStatus.cover === 'not_uploaded' ? 'Not uploaded' : undefined} />
            <StatusRow label="Seaman's book" status={docStatus.seamansBook}
              note={docStatus.seamansBook === 'not_uploaded' ? 'Not uploaded' : undefined} />
          </div>

          {extracted && (
            <div style={{
              marginTop: 16, padding: '12px 14px',
              background: `${COLORS.signal}10`, border: `1px solid ${COLORS.signal}30`,
              borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }} aria-hidden="true">🛡</span>
              <div>
                <div style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 700,
                               color: COLORS.signal, marginBottom: 3 }}>
                  Passport is valid
                </div>
                <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted,
                               lineHeight: 1.5 }}>
                  {extracted.validityNote}<br />Expires {extracted.expiryDate}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Footer */}
      <footer style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 28, paddingTop: 16, borderTop: `1px solid ${COLORS.deep}`,
      }}>
        <button type="button" onClick={onCancel} style={ghostBtnStyle}>
          Cancel
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onSaveDraft} style={ghostBtnStyle}>
            Save as Draft
          </button>
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => extracted && onContinue(extracted)}
            aria-label={canContinue ? 'Continue to verify details' : 'Upload passport inside pages to continue'}
            style={{
              fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: canContinue ? COLORS.signal : COLORS.ocean,
              color: canContinue ? COLORS.void : COLORS.muted,
              cursor: canContinue ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            Continue →
          </button>
        </div>
      </footer>
    </div>
  )
}

// ─── Shared style fragments ───────────────────────────────────────────────────

const valueStyle: React.CSSProperties = {
  fontFamily: FONTS.display,
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.frost,
}

const inputStyle: React.CSSProperties = {
  fontFamily: FONTS.display,
  fontSize: 13,
  color: COLORS.frost,
  background: COLORS.void,
  border: `1px solid ${COLORS.deep}`,
  borderRadius: 5,
  padding: '5px 8px',
  width: '100%',
  outline: 'none',
}

const ghostBtnStyle: React.CSSProperties = {
  fontFamily: FONTS.display,
  fontSize: 13,
  fontWeight: 600,
  padding: '9px 20px',
  borderRadius: 8,
  border: `1px solid ${COLORS.deep}`,
  background: 'none',
  color: COLORS.muted,
  cursor: 'pointer',
}
