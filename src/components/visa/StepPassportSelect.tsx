import React, { useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'
import { supabase } from '@/integrations/supabase/client'
import { DateInputDMY } from '@/components/ui/date-input-dmy'
import { SignedAnchor } from '@/components/ui/signed-file'
import { compressImageToMaxKB } from '@/lib/image-compress'
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

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png'

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

// Years remaining (rounded) — used for the "Expires in N years" summary box.
function yearsUntil(expiryDate: string): number {
  const expiry = new Date(expiryDate)
  const now = new Date()
  const ms = expiry.getTime() - now.getTime()
  return Math.max(0, Math.round(ms / (365.25 * 24 * 60 * 60 * 1000)))
}

// ─── Presentational sub-components (adapted from PassportDetails) ──────────────

// Document Status row.
function StatusRow({ label, status, note }: {
  label: string
  status: 'uploaded' | 'missing' | 'not_uploaded' | boolean
  note?: string
}) {
  const isOk      = status === 'uploaded' || status === true
  const isWarn    = status === 'missing'
  const iconColor = isOk ? '#22c55e' : isWarn ? COLORS.warn : COLORS.steel
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

// Large drag-and-drop dropzone for the passport inside pages.
function UploadZone({ onFile, fileName, fileKB, scanning, onRemove }: {
  onFile: (f: File) => void
  fileName: string | null
  fileKB: number | null
  scanning: boolean
  onRemove: () => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [onFile])

  if (fileName) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        background: `#22c55e12`, border: `1px solid #22c55e40`, borderRadius: 8,
      }}>
        <span style={{
          fontFamily: FONTS.display, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#22c55e', padding: '2px 8px',
          background: `#22c55e20`, borderRadius: 3,
        }}>{scanning ? 'Scanning…' : 'Uploaded'}</span>
        <span style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName}
        </span>
        {fileKB != null && (
          <span style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted }}>
            {fileKB} KB
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove uploaded file"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.muted, fontSize: 18, lineHeight: 1, padding: '0 4px' }}
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
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '32px 24px',
        border: `2px dashed ${dragging ? COLORS.signal : COLORS.deep}`,
        borderRadius: 10, cursor: 'pointer',
        background: dragging ? `${COLORS.signal}08` : COLORS.void,
        transition: 'border-color 0.15s, background 0.15s', textAlign: 'center',
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
        PDF, JPG or PNG — scanned to auto-fill the details
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
        style={{
          marginTop: 4, padding: '7px 18px',
          fontFamily: FONTS.display, fontSize: 12, fontWeight: 600,
          color: COLORS.signal, background: 'none',
          border: `1px solid ${COLORS.signal}60`, borderRadius: 6, cursor: 'pointer',
        }}
      >
        Browse Files
      </button>
    </div>
  )
}

// Smaller upload tile for cover / seaman's book / headshot.
function SmallUploadCard({ number, label, optional, icon, fileName, fileKB, scanning, onFile, onRemove, disabled, footer }: {
  number: number
  label: string
  optional?: boolean
  icon: string
  fileName: string | null
  fileKB: number | null
  scanning?: boolean
  onFile: (f: File) => void
  onRemove: () => void
  disabled?: boolean
  accept?: string
  footer?: React.ReactNode
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  return (
    <div style={{
      flex: 1, padding: '12px 14px',
      background: COLORS.abyss, border: `1px solid ${COLORS.deep}`,
      borderRadius: 8, opacity: disabled ? 0.55 : 1,
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
          <span style={{ fontFamily: FONTS.display, fontSize: 10, color: COLORS.steel, fontStyle: 'italic' }}>Optional</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }} aria-hidden="true">{icon}</span>
        {fileName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.frost, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {scanning ? 'Scanning…' : `${fileName}${fileKB != null ? ` · ${fileKB} KB` : ''}`}
            </span>
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.muted, fontSize: 16, padding: 0, lineHeight: 1 }}
            >×</button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            style={{
              fontFamily: FONTS.display, fontSize: 11, fontWeight: 600,
              color: disabled ? COLORS.steel : COLORS.signal, background: 'none',
              border: `1px solid ${disabled ? COLORS.deep : COLORS.signal + '50'}`, borderRadius: 5,
              padding: '4px 12px', cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {disabled ? 'Not applicable' : 'Upload ↑'}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
      {footer}
    </div>
  )
}

// Extracted-information field card.
function FieldCard({ label, note, noteColor, children }: {
  label: string
  note?: string
  noteColor?: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
      background: COLORS.void, border: `1px solid ${COLORS.deep}`, borderRadius: 8,
    }}>
      <span style={{ fontFamily: FONTS.display, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: COLORS.muted }}>
        {label}
      </span>
      <div style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 600, color: COLORS.frost }}>
        {children}
      </div>
      {note && (
        <span style={{ fontFamily: FONTS.display, fontSize: 11, color: noteColor ?? '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
          ✓ {note}
        </span>
      )}
    </div>
  )
}

// Document Status panel — shared between the add-form and existing-passport cards.
function DocumentStatusPanel({ status, expiryDate }: {
  status: {
    insidePages: 'uploaded' | 'missing' | 'not_uploaded'
    ocrCompleted: boolean
    minimumValidity: boolean
    headshot: 'uploaded' | 'missing' | 'not_uploaded'
    cover: 'uploaded' | 'missing' | 'not_uploaded'
    seamansBook: 'uploaded' | 'missing' | 'not_uploaded'
  }
  expiryDate?: string
}) {
  const hasExpiry = !!expiryDate
  const valid = hasExpiry && getExpiryLabel(expiryDate!) === 'Valid'
  const years = hasExpiry ? yearsUntil(expiryDate!) : 0

  return (
    <aside style={{
      width: 280, flexShrink: 0,
      background: COLORS.abyss, border: `1px solid ${COLORS.deep}`,
      borderRadius: 10, padding: '18px 20px', alignSelf: 'flex-start',
    }} aria-label="Document status">
      <h2 style={{ fontFamily: FONTS.display, fontSize: 13, fontWeight: 700, color: COLORS.frost, marginBottom: 14 }}>
        Document Status
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <StatusRow label="Passport inside pages" status={status.insidePages}
          note={status.insidePages === 'uploaded' ? 'Uploaded' : status.insidePages === 'missing' ? 'Missing' : 'Not uploaded'} />
        <StatusRow label="OCR extraction completed" status={status.ocrCompleted} />
        <StatusRow label="Minimum 6 months validity" status={status.minimumValidity} />
        <StatusRow label="Headshot photo" status={status.headshot}
          note={status.headshot === 'uploaded' ? 'Uploaded' : status.headshot === 'missing' ? 'Missing' : 'Not uploaded'} />
        <StatusRow label="Passport cover" status={status.cover}
          note={status.cover === 'uploaded' ? 'Uploaded' : 'Not uploaded'} />
        <StatusRow label="Seaman's book" status={status.seamansBook}
          note={status.seamansBook === 'uploaded' ? 'Uploaded' : 'Not uploaded'} />
      </div>

      {hasExpiry && (
        <div style={{
          marginTop: 16, padding: '12px 14px',
          background: valid ? `#22c55e10` : `${COLORS.warn}12`,
          border: `1px solid ${valid ? '#22c55e30' : COLORS.warn + '40'}`,
          borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }} aria-hidden="true">🛡</span>
          <div>
            <div style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 700, color: valid ? '#22c55e' : COLORS.warn, marginBottom: 3 }}>
              {valid ? 'Passport is valid' : getExpiryLabel(expiryDate!)}
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted, lineHeight: 1.5 }}>
              {valid ? `Expires in ${years} ${years === 1 ? 'year' : 'years'}` : 'Check validity before continuing'}<br />
              Expires {formatDate(expiryDate!)}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
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
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [placeOfBirth, setPlaceOfBirth] = useState('')
  const [gender, setGender] = useState('')
  type SlotKey = 'cover' | 'data' | 'seamans' | 'headshot'
  const [files, setFiles] = useState<Record<SlotKey, File | null>>({ cover: null, data: null, seamans: null, headshot: null })
  const [fileNames, setFileNames] = useState<Record<SlotKey, string | null>>({ cover: null, data: null, seamans: null, headshot: null })
  const [sizes, setSizes] = useState<Record<SlotKey, number | null>>({ cover: null, data: null, seamans: null, headshot: null })
  const [dataPreview, setDataPreview] = useState<string | null>(null)
  const [noSeamans, setNoSeamans] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState<SlotKey | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)
  const [extracted, setExtracted] = useState(false)
  // Auto checklist flags from OCR (null = unknown until scanned)
  const [auto, setAuto] = useState<{ colour: boolean | null; noGlare: boolean | null }>({ colour: null, noGlare: null })
  const [doubleChecked, setDoubleChecked] = useState(false)
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({})

  // Compress every attachment to < 1000 KB; the passport data-page slot also
  // runs OCR to self-populate the fields below.
  async function handleSlot(key: SlotKey, file: File | null) {
    if (!file) {
      setFiles(f => ({ ...f, [key]: null })); setSizes(s => ({ ...s, [key]: null })); setFileNames(n => ({ ...n, [key]: null }))
      if (key === 'data') { setDataPreview(null); setExtracted(false) }
      return
    }
    try {
      const c = await compressImageToMaxKB(file, 1000)
      setFiles(f => ({ ...f, [key]: c.file }))
      setSizes(s => ({ ...s, [key]: c.sizeKB }))
      setFileNames(n => ({ ...n, [key]: c.file.name }))
      if (key === 'data' && c.isImage) {
        try { setDataPreview(URL.createObjectURL(c.file)) } catch { /* ignore */ }
      }
      if (key !== 'data') return
      setScanning('data'); setScanNote(c.isImage ? null : 'Reading PDF…')
      const res = await fetch('/api/visa/passport-ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: c.base64, mediaType: c.mediaType }),
      })
      const j = await res.json()
      if (!j.ok) { setScanNote(j.error ?? 'Could not scan passport.'); return }
      const d = j.data ?? {}
      if (d.nationality && !nationality) setNationality(d.nationality)
      if (d.passport_number && !passportNumber) setPassportNumber(d.passport_number)
      if (d.issue_date && !issueDate) setIssueDate(d.issue_date)
      if (d.expiry_date && !expiryDate) setExpiryDate(d.expiry_date)
      if (d.issuing_country && !issuingCountry) setIssuingCountry(d.issuing_country)
      if (d.date_of_birth && !dateOfBirth) setDateOfBirth(d.date_of_birth)
      if (d.place_of_birth && !placeOfBirth) setPlaceOfBirth(d.place_of_birth)
      if (d.gender && !gender) setGender(d.gender)
      const cl = d.checklist ?? {}
      setAuto({
        colour:  typeof cl.is_colour === 'boolean' ? cl.is_colour : null,
        noGlare: typeof cl.has_glare_or_reflections === 'boolean' ? !cl.has_glare_or_reflections : null,
      })
      setExtracted(true)
      setScanNote('Scanned — details auto-filled below. Please double-check them.')
    } catch (e: any) {
      setScanNote('Scan failed: ' + (e?.message ?? 'error'))
    } finally {
      if (key === 'data') setScanning(null)
    }
  }

  // Auto-evaluated checks
  const sixMoOk: boolean | null = (() => {
    if (!expiryDate) return null
    const exp = new Date(expiryDate + 'T00:00:00Z')
    const min = new Date(); min.setMonth(min.getMonth() + 6)
    return exp >= min
  })()
  const allSizes = Object.values(sizes).filter((v): v is number => v != null)
  const sizeOk: boolean | null = allSizes.length === 0 ? null : allSizes.every(v => v <= 1000)

  // Items auto-satisfied by uploads / OCR / validation; the rest the user ticks.
  const autoTrue: Record<string, boolean> = {
    cover:    !!files.cover,
    data:     !!files.data,
    seamans:  noSeamans || !!files.seamans,
    headshot: !!files.headshot,
    validity: sixMoOk === true,
    glare:    auto.noGlare === true,
    colour:   auto.colour === true,
    size:     sizeOk === true,
  }
  const isChecked = (k: string) => !!manualChecks[k] || autoTrue[k]
  const CHECK_ITEMS: { key: string; label: string; hint?: string }[] = [
    { key: 'cover',    label: 'Passport external cover' },
    { key: 'data',     label: 'Passport — 2 inside pages' },
    { key: 'seamans',  label: "Seaman's book", hint: noSeamans ? 'N/A' : undefined },
    { key: 'headshot', label: 'Headshot photo' },
    { key: 'validity', label: 'Minimum 6 months validity' },
    { key: 'glare',    label: 'Clear — no reflections' },
    { key: 'colour',   label: 'Colour' },
    { key: 'size',     label: 'Under 1000 KB each' },
  ]
  const allChecked = CHECK_ITEMS.every(i => isChecked(i.key))

  // Document Status reflecting what's uploaded / scanned / validated.
  const docStatus = {
    insidePages: (files.data ? 'uploaded' : 'not_uploaded') as 'uploaded' | 'missing' | 'not_uploaded',
    ocrCompleted: extracted,
    minimumValidity: sixMoOk === true,
    headshot: (files.headshot ? 'uploaded' : 'missing') as 'uploaded' | 'missing' | 'not_uploaded',
    cover: (files.cover ? 'uploaded' : 'not_uploaded') as 'uploaded' | 'missing' | 'not_uploaded',
    seamansBook: ((noSeamans || files.seamans) ? 'uploaded' : 'not_uploaded') as 'uploaded' | 'missing' | 'not_uploaded',
  }

  const editInputStyle: React.CSSProperties = {
    fontFamily: FONTS.display, fontSize: 13, fontWeight: 600, color: COLORS.frost,
    background: COLORS.abyss, border: `1px solid ${COLORS.signal}60`,
    borderRadius: 5, padding: '4px 8px', width: '100%', outline: 'none', boxSizing: 'border-box',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!nationality.trim() || !passportNumber.trim() || !issuingCountry.trim()) {
      setError('Nationality, passport number and issuing country are required.')
      return
    }
    if (!issueDate || !expiryDate) {
      setError('Enter valid issue and expiry dates (dd/mm/yyyy).')
      return
    }
    if (!allChecked) {
      setError('Tick every item in the passport checklist first.')
      return
    }
    if (!doubleChecked) {
      setError('Please confirm you have double-checked the information.')
      return
    }

    setUploading(true)
    try {
      // Upload each present attachment to storage and collect its public URL.
      async function uploadSlot(key: SlotKey): Promise<string | null> {
        const file = files[key]
        if (!file) return null
        const ext = file.name.split('.').pop()
        const path = `crew/${crewId}/${key}_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('permit-documents').upload(path, file, { upsert: true })
        if (upErr) throw upErr
        return supabase.storage.from('permit-documents').getPublicUrl(path).data.publicUrl
      }
      const [coverUrl, dataUrl, seamansUrl, headshotUrl] = await Promise.all([
        uploadSlot('cover'), uploadSlot('data'), uploadSlot('seamans'), uploadSlot('headshot'),
      ])

      const saved = await upsertPassport({
        crew_id: crewId,
        nationality: nationality.trim(),
        passport_number: passportNumber.trim(),
        issue_date: issueDate,
        expiry_date: expiryDate,
        issuing_country: issuingCountry.trim(),
        is_primary: false,
        document_url: dataUrl,
        cover_url: coverUrl,
        seamans_book_url: seamansUrl,
        headshot_url: headshotUrl,
        no_seamans_book: noSeamans,
        double_checked: doubleChecked,
      })

      onSaved(saved)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save passport.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── Left column: uploads + preview + extracted info ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {/* Section 1: Passport Inside Pages + secondary uploads */}
          <section style={{ background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 10, padding: '22px 24px' }}>
            <h2 style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 700, color: COLORS.frost, marginBottom: 6 }}>
              Passport Inside Pages
            </h2>
            <p style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, margin: '0 0 14px', lineHeight: 1.45 }}>
              Upload the <strong>inside pages</strong> (PDF or photo) — we scan them and auto-fill the details below.
              Always double-check the result.
            </p>

            <UploadZone
              onFile={(f) => handleSlot('data', f)}
              fileName={fileNames.data}
              fileKB={sizes.data}
              scanning={scanning === 'data'}
              onRemove={() => handleSlot('data', null)}
            />

            {scanning === 'data' && (
              <p role="status" aria-live="polite" style={{
                fontFamily: FONTS.display, fontSize: 12, color: COLORS.signal, margin: '10px 0 0',
              }}>
                Scanning passport — extracting details…
              </p>
            )}
            {scanNote && scanning !== 'data' && (
              <p style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, margin: '10px 0 0' }}>{scanNote}</p>
            )}

            {/* Secondary uploads */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <SmallUploadCard number={1} label="Passport Cover" optional icon="📄"
                fileName={fileNames.cover} fileKB={sizes.cover}
                onFile={(f) => handleSlot('cover', f)} onRemove={() => handleSlot('cover', null)} />
              <SmallUploadCard number={2} label="Seaman's Book" optional icon="📋"
                fileName={fileNames.seamans} fileKB={sizes.seamans} disabled={noSeamans}
                onFile={(f) => handleSlot('seamans', f)} onRemove={() => handleSlot('seamans', null)}
                footer={
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted }}>
                    <input type="checkbox" checked={noSeamans} onChange={e => { setNoSeamans(e.target.checked); if (e.target.checked) handleSlot('seamans', null) }} />
                    No Seaman's book
                  </label>
                } />
              <SmallUploadCard number={3} label="Headshot Photo" icon="👤"
                fileName={fileNames.headshot} fileKB={sizes.headshot}
                onFile={(f) => handleSlot('headshot', f)} onRemove={() => handleSlot('headshot', null)} />
            </div>
          </section>

          {/* Section 2: Passport Preview + Extracted Information */}
          <section style={{ background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 10, padding: '22px 24px' }}>
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

              {/* Passport Preview */}
              <div style={{ width: 200, flexShrink: 0 }}>
                <span style={{ display: 'block', fontFamily: FONTS.display, fontSize: 11, fontWeight: 600, color: COLORS.muted, marginBottom: 10 }}>
                  Passport Preview
                </span>
                <div style={{ background: COLORS.void, border: `1px solid ${COLORS.deep}`, borderRadius: 8, overflow: 'hidden' }}>
                  {dataPreview ? (
                    <img src={dataPreview} alt="Uploaded passport — data page" style={{ width: '100%', display: 'block' }} />
                  ) : (
                    <div style={{ padding: '32px 16px', textAlign: 'center', fontFamily: FONTS.display, fontSize: 12, color: COLORS.steel }}>
                      {files.data ? 'Preview not available for PDF' : 'No preview yet'}
                    </div>
                  )}
                </div>
              </div>

              {/* Extracted Information grid */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 700, color: COLORS.frost }}>
                    Extracted Information
                  </span>
                  {extracted && (
                    <span style={{
                      fontFamily: FONTS.display, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                      textTransform: 'uppercase', color: COLORS.leoAmber, padding: '3px 9px',
                      background: `${COLORS.leoAmber}18`, border: `1px solid ${COLORS.leoAmber}30`, borderRadius: 4,
                    }}>
                      Auto-filled
                    </span>
                  )}
                </div>

                {/* Row 1 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 }}>
                  <FieldCard label="Nationality">
                    <input style={editInputStyle} value={nationality} onChange={e => setNationality(e.target.value)} placeholder="e.g. British" required />
                  </FieldCard>
                  <FieldCard label="Passport Number">
                    <input style={{ ...editInputStyle, fontFamily: 'Courier New, monospace', letterSpacing: '0.08em' }}
                      value={passportNumber} onChange={e => setPassportNumber(e.target.value)} placeholder="e.g. 123456789" required />
                  </FieldCard>
                  <FieldCard label="Date of Birth">
                    <DateInputDMY style={editInputStyle} value={dateOfBirth} onChange={setDateOfBirth} />
                  </FieldCard>
                </div>

                {/* Row 2 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 }}>
                  <FieldCard label="Issue Date">
                    <DateInputDMY style={editInputStyle} value={issueDate} onChange={setIssueDate} />
                  </FieldCard>
                  <FieldCard label="Expiry Date"
                    note={expiryDate ? getExpiryLabel(expiryDate) : undefined}
                    noteColor={expiryDate ? getExpiryColor(expiryDate) : undefined}>
                    <DateInputDMY style={editInputStyle} value={expiryDate} onChange={setExpiryDate} />
                  </FieldCard>
                  <FieldCard label="Issuing Country">
                    <input style={editInputStyle} value={issuingCountry} onChange={e => setIssuingCountry(e.target.value)} placeholder="e.g. United Kingdom" required />
                  </FieldCard>
                </div>

                {/* Row 3 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  <FieldCard label="Place of Birth">
                    <input style={editInputStyle} value={placeOfBirth} onChange={e => setPlaceOfBirth(e.target.value)} placeholder="e.g. London" />
                  </FieldCard>
                  <FieldCard label="Gender">
                    <select value={gender} onChange={e => setGender(e.target.value)} style={{ ...editInputStyle, cursor: 'pointer' }}>
                      <option value="">—</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </FieldCard>
                  <div />
                </div>
              </div>
            </div>
          </section>

          {/* Passport checklist — tick all to enable Save */}
          <section style={{ background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 10, padding: '20px 24px' }}>
            <h2 style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 700, color: COLORS.frost, marginBottom: 12 }}>
              Passport Checklist — confirm all to save
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 18px' }}>
              {CHECK_ITEMS.map(item => {
                const on = isChecked(item.key)
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setManualChecks(m => ({ ...m, [item.key]: !on }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px',
                      background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%',
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
                      color: on ? '#0B0F14' : 'transparent',
                      background: on ? '#FFFFFF' : 'transparent',
                      border: '2px solid #FFFFFF',
                      boxShadow: on ? 'none' : 'inset 0 0 0 2px rgba(0,0,0,0.25)',
                    }}>✓</span>
                    <span style={{ fontFamily: FONTS.display, fontSize: 12.5, color: on ? COLORS.frost : '#FFFFFF', flex: 1 }}>
                      {item.label}
                      {item.hint && <span style={{ color: COLORS.muted, marginLeft: 6, fontSize: 11 }}>({item.hint})</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            {!allChecked && (
              <p style={{ fontFamily: FONTS.display, fontSize: 11.5, color: COLORS.warn, margin: '6px 2px 0' }}>
                Tick every item above to enable Save.
              </p>
            )}

            {error && (
              <div style={{
                marginTop: 12, background: `${COLORS.warn}22`, border: `1px solid ${COLORS.warn}`,
                borderRadius: 8, padding: '8px 12px', color: COLORS.warn, fontFamily: FONTS.display, fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {/* Self-attestation */}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 16, cursor: 'pointer',
              fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost,
            }}>
              <input
                type="checkbox"
                checked={doubleChecked}
                onChange={e => setDoubleChecked(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: COLORS.signal }}
              />
              <span>I confirm I have <strong>double-checked</strong> that all details and attachments above are correct and match the passport.</span>
            </label>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {showCancel && onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  style={{
                    background: 'transparent', border: `1px solid ${COLORS.steel}`, borderRadius: 8,
                    color: COLORS.muted, fontFamily: FONTS.display, fontSize: 14, padding: '8px 18px', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={uploading || !doubleChecked || !allChecked}
                title={!allChecked ? 'Tick every checklist item first' : !doubleChecked ? 'Confirm you have double-checked the information first' : undefined}
                style={{
                  background: COLORS.signal, border: 'none', borderRadius: 8, color: COLORS.void,
                  fontFamily: FONTS.display, fontSize: 14, fontWeight: 600, padding: '8px 20px',
                  cursor: (uploading || !doubleChecked || !allChecked) ? 'not-allowed' : 'pointer',
                  opacity: (uploading || !doubleChecked || !allChecked) ? 0.6 : 1,
                }}
              >
                {uploading ? 'Saving…' : 'Save Passport'}
              </button>
            </div>
          </section>
        </div>

        {/* ── Right column: Document Status ── */}
        <DocumentStatusPanel status={docStatus} expiryDate={expiryDate || undefined} />
      </div>
    </form>
  )
}

// ─── Existing Passport Card (rich style) ───────────────────────────────────────

interface PassportCardProps {
  passport: CrewPassport
  selected: boolean
  onSelect: () => void
}

function PassportCard({ passport, selected, onSelect }: PassportCardProps) {
  const expiryColor = getExpiryColor(passport.expiry_date)
  const expiryLabel = getExpiryLabel(passport.expiry_date)

  const docStatus = {
    insidePages: (passport.document_url ? 'uploaded' : 'not_uploaded') as 'uploaded' | 'missing' | 'not_uploaded',
    ocrCompleted: !!passport.document_url,
    minimumValidity: expiryLabel === 'Valid' || expiryLabel === 'Expires < 12 months',
    headshot: (passport.headshot_url ? 'uploaded' : 'missing') as 'uploaded' | 'missing' | 'not_uploaded',
    cover: (passport.cover_url ? 'uploaded' : 'not_uploaded') as 'uploaded' | 'missing' | 'not_uploaded',
    seamansBook: ((passport.no_seamans_book || passport.seamans_book_url) ? 'uploaded' : 'not_uploaded') as 'uploaded' | 'missing' | 'not_uploaded',
  }

  return (
    <div style={{
      background: selected ? `${COLORS.signal}10` : COLORS.abyss,
      border: `2px solid ${selected ? COLORS.signal : COLORS.deep}`,
      borderRadius: 12, padding: 0, overflow: 'hidden',
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      {/* Header row: flag, nationality, badges, select control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: `1px solid ${COLORS.deep}` }}>
        <span style={{ fontSize: 24, lineHeight: 1 }}>{getFlagEmoji(passport.nationality)}</span>
        <span style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 700, color: COLORS.frost, flex: 1 }}>
          {passport.nationality}
        </span>
        {passport.is_primary && (
          <span style={{
            background: `${COLORS.signal}22`, border: `1px solid ${COLORS.signal}`, borderRadius: 4,
            color: COLORS.signal, fontFamily: FONTS.display, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.05em', padding: '2px 8px', textTransform: 'uppercase',
          }}>
            Primary
          </span>
        )}
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
            padding: '7px 16px', borderRadius: 8,
            border: selected ? 'none' : `1px solid ${COLORS.signal}`,
            background: selected ? COLORS.signal : 'transparent',
            color: selected ? COLORS.void : COLORS.signal, cursor: 'pointer',
          }}
        >
          {selected && (
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke={COLORS.void} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {selected ? 'Selected' : 'Select'}
        </button>
      </div>

      {/* Body: preview + extracted info + document status */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', padding: '18px 20px' }}>

        {/* Left: preview + extracted-info grid */}
        <div style={{ flex: 1, display: 'flex', gap: 20, alignItems: 'flex-start', minWidth: 0 }}>
          {/* Preview */}
          <div style={{ width: 150, flexShrink: 0 }}>
            <span style={{ display: 'block', fontFamily: FONTS.display, fontSize: 11, fontWeight: 600, color: COLORS.muted, marginBottom: 8 }}>
              Passport Preview
            </span>
            <div style={{ background: COLORS.void, border: `1px solid ${COLORS.deep}`, borderRadius: 8, overflow: 'hidden', minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {passport.document_url ? (
                <SignedAnchor stored={passport.document_url} style={{ display: 'block', width: '100%' }}>
                  <div style={{ padding: '24px 12px', textAlign: 'center', fontFamily: FONTS.display, fontSize: 12, color: COLORS.signal, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    View document
                  </div>
                </SignedAnchor>
              ) : (
                <div style={{ padding: '24px 12px', textAlign: 'center', fontFamily: FONTS.display, fontSize: 12, color: COLORS.steel }}>
                  No scan on file
                </div>
              )}
            </div>
          </div>

          {/* Extracted-info grid */}
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <FieldCard label="Passport Number">
              <span style={{ fontFamily: 'Courier New, monospace', letterSpacing: '0.08em' }}>{passport.passport_number}</span>
            </FieldCard>
            <FieldCard label="Issue Date">{formatDate(passport.issue_date)}</FieldCard>
            <FieldCard label="Expiry Date">
              <span style={{ color: expiryColor }}>{formatDate(passport.expiry_date)}</span>
            </FieldCard>
            <FieldCard label="Issuing Country">{passport.issuing_country}</FieldCard>
            <FieldCard label="Status">
              <span style={{ color: expiryColor }}>{expiryLabel}</span>
            </FieldCard>
            <div />
          </div>
        </div>

        {/* Right: per-passport Document Status */}
        <DocumentStatusPanel status={docStatus} expiryDate={passport.expiry_date} />
      </div>
    </div>
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
        <div style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 700, color: COLORS.frost, marginBottom: 6 }}>
          Passport Details
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 14, color: COLORS.muted, lineHeight: 1.5 }}>
          Select the passport you are using for this{' '}
          <span style={{ color: COLORS.frost }}>
            {countryFlag} {countryName}
          </span>{' '}
          application. You must explicitly choose even if only one passport is listed.
        </div>
      </div>

      {/* Passport list or empty state */}
      {noPassports && !showAddForm ? (
        <div style={{
          background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 12,
          padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center',
        }}>
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
              background: COLORS.signal, border: 'none', borderRadius: 8, color: COLORS.void,
              fontFamily: FONTS.display, fontSize: 14, fontWeight: 600, padding: '10px 22px', cursor: 'pointer', marginTop: 4,
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
                background: 'transparent', border: `1px dashed ${COLORS.deep}`, borderRadius: 10,
                color: COLORS.muted, fontFamily: FONTS.display, fontSize: 14, padding: '12px 20px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.signal
                ;(e.currentTarget as HTMLButtonElement).style.color = COLORS.signal
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.deep
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
        <div style={{
          background: `color-mix(in oklab, ${COLORS.ocean} 20%, transparent)`,
          border: `1px solid ${COLORS.deep}`, borderRadius: 8, padding: '10px 14px',
          fontFamily: FONTS.display, fontSize: 13, color: COLORS.muted, display: 'flex', alignItems: 'center', gap: 8,
        }}>
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
            background: 'transparent', border: `1px solid ${COLORS.steel}`, borderRadius: 8,
            color: COLORS.muted, fontFamily: FONTS.display, fontSize: 14, padding: '10px 22px', cursor: 'pointer',
          }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          style={{
            background: canContinue ? COLORS.signal : COLORS.ocean, border: 'none', borderRadius: 8,
            color: canContinue ? COLORS.void : COLORS.steel, fontFamily: FONTS.display, fontSize: 14, fontWeight: 600,
            padding: '10px 28px', cursor: canContinue ? 'pointer' : 'not-allowed',
            opacity: canContinue ? 1 : 0.7, transition: 'background 0.15s, color 0.15s',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

export default StepPassportSelect
