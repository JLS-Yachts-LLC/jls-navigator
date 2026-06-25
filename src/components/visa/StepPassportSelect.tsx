import React, { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { COLORS, FONTS } from '@/lib/tokens'
import { supabase } from '@/integrations/supabase/client'
import { DateInputDMY } from '@/components/ui/date-input-dmy'
import { SignedAnchor } from '@/components/ui/signed-file'
import { DraggableDocRow } from '@/components/visa/DraggableDocRow'
import { downloadImmigrationPackage, immigrationPackName, type ExportableDoc } from '@/lib/visa/documentExport'
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
function UploadZone({ onFile, fileName, fileKB, scanning, onRemove, previewUrl, isPdf, onRescan }: {
  onFile: (f: File) => void
  fileName: string | null
  fileKB: number | null
  scanning: boolean
  onRemove: () => void
  /** Stored or freshly-selected document to preview (image src or PDF url). */
  previewUrl?: string | null
  isPdf?: boolean
  /** When provided, shows a "Rescan OCR" button to re-run extraction. */
  onRescan?: () => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [onFile])

  // Show the "uploaded" state whenever there's either a freshly-selected file
  // or an existing stored document (edit mode) — so it's clear it's on file.
  const hasDoc = !!fileName || !!previewUrl
  if (hasDoc) {
    const showImg = !!previewUrl && !isPdf
    const label = fileName ?? 'Passport inside pages — on file'
    return (
      <div style={{
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        background: scanning ? `${COLORS.signal}12` : `#22c55e12`,
        border: `1px solid ${scanning ? COLORS.signal + '55' : '#22c55e40'}`, borderRadius: 8,
      }}>
        <style>{`@keyframes pp-spin{to{transform:rotate(360deg)}}@keyframes pp-sweep{0%{left:-40%}100%{left:100%}}`}</style>
        {scanning && (
          <span aria-hidden="true" style={{ position: 'absolute', bottom: 0, left: '-40%', width: '40%', height: 3, background: COLORS.signal, animation: 'pp-sweep 1.1s ease-in-out infinite' }} />
        )}
        {/* Thumbnail preview of the uploaded document */}
        <button
          type="button"
          onClick={() => previewUrl && window.open(previewUrl, '_blank', 'noreferrer')}
          title={previewUrl ? 'Open document' : undefined}
          style={{
            width: 46, height: 46, flexShrink: 0, padding: 0,
            borderRadius: 6, overflow: 'hidden', border: `1px solid ${COLORS.deep}`, background: COLORS.void,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: previewUrl ? 'pointer' : 'default',
          }}
        >
          {showImg
            ? <img src={previewUrl!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 22 }} aria-hidden="true">📄</span>}
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {scanning ? (
            <span style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 7, fontFamily: FONTS.display, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLORS.signal, padding: '2px 8px', background: `${COLORS.signal}20`, borderRadius: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation: 'pp-spin 0.8s linear infinite' }}>
                <circle cx="12" cy="12" r="9" stroke={COLORS.signal} strokeOpacity="0.3" strokeWidth="3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke={COLORS.signal} strokeWidth="3" strokeLinecap="round" />
              </svg>
              Scanning…
            </span>
          ) : (
            <span style={{
              fontFamily: FONTS.display, fontSize: 10, fontWeight: 700, alignSelf: 'flex-start',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: '#22c55e', padding: '2px 8px',
              background: `#22c55e20`, borderRadius: 3,
            }}>Uploaded</span>
          )}
          <span style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}{fileKB != null ? ` · ${fileKB} KB` : ''}
          </span>
        </div>
        {onRescan && (
          <button
            type="button"
            onClick={onRescan}
            disabled={scanning}
            title="Re-run OCR extraction on this document"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
              fontFamily: FONTS.display, fontSize: 11, fontWeight: 700,
              color: COLORS.signal, background: `${COLORS.signal}14`,
              border: `1px solid ${COLORS.signal}55`, borderRadius: 6,
              padding: '6px 12px', cursor: scanning ? 'wait' : 'pointer', opacity: scanning ? 0.6 : 1,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 13 }}>⟳</span> Rescan OCR
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove uploaded file"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.muted, fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
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
const isImageUrl = (u?: string | null) => !!u && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)

// Lightweight client-side check for headshot quality: is it colour (not B&W) and
// does it have a light/plain background? Samples a downscaled copy on a canvas.
async function analyzeHeadshot(file: Blob): Promise<{ isColour: boolean; whiteBackground: boolean }> {
  return new Promise((resolve) => {
    const fallback = { isColour: true, whiteBackground: true }
    try {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        try {
          const W = 96, H = Math.max(1, Math.round(96 * (img.height || 1) / (img.width || 1)))
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H
          const ctx = cv.getContext('2d'); if (!ctx) return resolve(fallback)
          ctx.drawImage(img, 0, 0, W, H)
          const data = ctx.getImageData(0, 0, W, H).data
          let colourful = 0, total = 0
          for (let i = 0; i < data.length; i += 4) {
            const max = Math.max(data[i], data[i + 1], data[i + 2])
            const min = Math.min(data[i], data[i + 1], data[i + 2])
            if (max - min > 28) colourful++
            total++
          }
          // Only flag a genuinely greyscale image (lenient — immigration portals
          // accept a wide range, so we err toward passing).
          const isColour = total === 0 || colourful / total > 0.02
          // Background check: lenient — a single reasonably light corner is enough
          // to consider it plain. Only a uniformly dark/busy edge gets flagged.
          let lightCorners = 0
          for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]] as const) {
            const idx = (y * W + x) * 4
            const r = data[idx], g = data[idx + 1], b = data[idx + 2]
            if ((r + g + b) / 3 > 150) lightCorners++
          }
          resolve({ isColour, whiteBackground: lightCorners >= 1 })
        } catch { resolve(fallback) } finally { URL.revokeObjectURL(url) }
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(fallback) }
      img.src = url
    } catch { resolve(fallback) }
  })
}

// Fetch a stored document and return its base64 + media type, for re-running OCR
// on an already-uploaded passport (edit mode, where we only have the stored URL).
async function fetchAsBase64(url: string): Promise<{ base64: string; mediaType: string; isImage: boolean }> {
  const resp = await fetch(url)
  const blob = await resp.blob()
  const mediaType = blob.type || (/\.pdf(\?|$)/i.test(url) ? 'application/pdf' : 'image/jpeg')
  const isImage = mediaType.startsWith('image/')
  const base64: string = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)) }
    r.onerror = reject
    r.readAsDataURL(blob)
  })
  return { base64, mediaType, isImage }
}

/** Small clickable document thumbnail (image preview, or a file glyph for PDFs). */
function DocThumb({ url, onZoom, size = 56 }: { url: string; onZoom?: (u: string) => void; size?: number }) {
  const img = isImageUrl(url)
  return (
    <button
      type="button"
      title={img ? 'Click to enlarge' : 'Open document'}
      onClick={() => { if (img && onZoom) onZoom(url); else window.open(url, '_blank', 'noreferrer') }}
      style={{
        width: size, height: size, flexShrink: 0, padding: 0, cursor: img ? 'zoom-in' : 'pointer',
        borderRadius: 6, overflow: 'hidden', border: `1px solid ${COLORS.deep}`, background: COLORS.void,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {img
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: 20 }} aria-hidden="true">📄</span>}
    </button>
  )
}

function SmallUploadCard({ number, label, optional, required, icon, fileName, fileKB, scanning, onFile, onRemove, disabled, footer, thumbUrl, onZoom, onRescan }: {
  number: number
  label: string
  optional?: boolean
  required?: boolean
  icon: string
  fileName: string | null
  fileKB: number | null
  scanning?: boolean
  onFile: (f: File) => void
  onRemove: () => void
  disabled?: boolean
  accept?: string
  footer?: React.ReactNode
  thumbUrl?: string | null
  onZoom?: (u: string) => void
  /** When provided, shows a "Rescan" button to re-run the quality check. */
  onRescan?: () => void
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
        {required && (
          <span style={{ fontFamily: FONTS.display, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.warn, background: `${COLORS.warn}1a`, border: `1px solid ${COLORS.warn}40`, borderRadius: 3, padding: '1px 6px' }}>Required</span>
        )}
      </div>
      {thumbUrl && (
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <DocThumb url={thumbUrl} onZoom={onZoom} />
        </div>
      )}
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
      {onRescan && (thumbUrl || fileName) && (
        <button
          type="button"
          onClick={onRescan}
          disabled={scanning}
          title="Re-check this photo against the guidelines"
          style={{
            alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: FONTS.display, fontSize: 10.5, fontWeight: 700,
            color: COLORS.signal, background: `${COLORS.signal}14`,
            border: `1px solid ${COLORS.signal}55`, borderRadius: 5,
            padding: '4px 9px', cursor: scanning ? 'wait' : 'pointer', opacity: scanning ? 0.6 : 1,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 12 }}>⟳</span> {scanning ? 'Checking…' : 'Rescan'}
        </button>
      )}
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
function DocumentStatusPanel({ status, expiryDate, seamansNotApplicable, downloads, verificationLetterUrl, crewLastName, passportNumber }: {
  status: {
    insidePages: 'uploaded' | 'missing' | 'not_uploaded'
    ocrCompleted: boolean
    minimumValidity: boolean
    headshot: 'uploaded' | 'missing' | 'not_uploaded'
    cover: 'uploaded' | 'missing' | 'not_uploaded'
    seamansBook: 'uploaded' | 'missing' | 'not_uploaded'
  }
  expiryDate?: string
  seamansNotApplicable?: boolean
  /** Saved files available to download (null url = hidden). */
  downloads?: { label: string; url: string | null }[]
  /** URL of the generated Crew Verification letter, when no Seaman's book. */
  verificationLetterUrl?: string | null
  /** Used to name the immigration ZIP package. */
  crewLastName?: string | null
  passportNumber?: string | null
}) {
  const dls = (downloads ?? []).filter((d) => d.url) as { label: string; url: string }[]
  const [packing, setPacking] = useState(false)

  // Core docs for the immigration pack: passport cover + inside, headshot,
  // verification letter (Seaman's book is optional — not auto-included).
  const isCore = (label: string) => /cover|inside|headshot|verification letter/i.test(label)
  const isPassportDoc = (label: string) => /passport|cover|inside/i.test(label)

  async function handleExportPackage() {
    const docs: ExportableDoc[] = dls.filter((d) => isCore(d.label)).map((d) => ({ label: d.label, stored: d.url }))
    if (docs.length === 0) { toast('No core documents available to export yet.'); return }
    setPacking(true)
    try {
      const name = immigrationPackName(crewLastName ?? '', passportNumber)
      const count = await downloadImmigrationPackage(docs, name)
      if (count > 0) toast(`Immigration package ready — ${count} file${count === 1 ? '' : 's'}`)
      else toast.error('Could not build the immigration package. Please try again.')
    } finally {
      setPacking(false)
    }
  }
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
        {seamansNotApplicable ? (
          <StatusRow label="Verification letter" status={!!verificationLetterUrl}
            note={verificationLetterUrl ? 'Generated' : 'Pending — auto-generated'} />
        ) : (
          <StatusRow label="Seaman's book" status={status.seamansBook}
            note={status.seamansBook === 'uploaded' ? 'Uploaded' : 'Not uploaded'} />
        )}
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

      {dls.length > 0 && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${COLORS.deep}`, paddingTop: 14 }}>
          <h3 style={{ fontFamily: FONTS.display, fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Documents
          </h3>
          <p style={{ fontFamily: FONTS.display, fontSize: 10, color: COLORS.steel, margin: '0 0 10px', lineHeight: 1.5 }}>
            Drag a document into an immigration portal, or use Open / Download.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dls.map((d) => (
              <DraggableDocRow
                key={d.label}
                label={d.label}
                stored={d.url}
                icon={/headshot/i.test(d.label) ? '📷' : '📄'}
                expiryDate={isPassportDoc(d.label) ? expiryDate : undefined}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportPackage}
            disabled={packing}
            style={{
              marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '9px 12px', borderRadius: 7,
              background: COLORS.signal, border: 'none', cursor: packing ? 'wait' : 'pointer',
              fontFamily: FONTS.display, fontSize: 12, fontWeight: 700, color: COLORS.void, opacity: packing ? 0.6 : 1,
            }}>
            <span aria-hidden="true">⬇</span>
            {packing ? 'Building package…' : 'Export immigration package'}
          </button>
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
  /** When set, the form edits this passport (pre-filled) instead of adding new. */
  existingPassport?: CrewPassport | null
  /** Crew profile name, to flag if it differs from the scanned passport name. */
  crewName?: string
}

// Compare two names ignoring case, order, and punctuation. Returns true if they
// share no meaningful overlap (a likely discrepancy).
function namesDiffer(a: string, b: string): boolean {
  const toks = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length > 1)
  const A = new Set(toks(a)), B = toks(b)
  if (A.size === 0 || B.length === 0) return false
  const overlap = B.filter(t => A.has(t)).length
  return overlap < Math.min(A.size, B.length) // any token missing on either side = flag
}

function AddPassportForm({ crewId, onSaved, onCancel, showCancel, existingPassport, crewName }: AddPassportFormProps) {
  const ex = existingPassport ?? null
  const [nationality, setNationality] = useState(ex?.nationality ?? '')
  const [passportNumber, setPassportNumber] = useState(ex?.passport_number ?? '')
  const [issueDate, setIssueDate] = useState(ex?.issue_date ?? '')
  const [expiryDate, setExpiryDate] = useState(ex?.expiry_date ?? '')
  const [issuingCountry, setIssuingCountry] = useState(ex?.issuing_country ?? '')
  const [placeOfIssue, setPlaceOfIssue] = useState((ex as any)?.place_of_issue ?? '')
  // Pre-fill from the saved passport (+ its OCR snapshot) so re-opening to edit
  // does NOT require re-running OCR — the extracted details persist.
  const [dateOfBirth, setDateOfBirth] = useState(ex?.date_of_birth ?? '')
  const [placeOfBirth, setPlaceOfBirth] = useState((ex as any)?.ocr_raw?.placeOfBirth ?? '')
  const [gender, setGender] = useState((ex as any)?.ocr_raw?.gender ?? '')
  // Raw OCR snapshot persisted to crew_passports.ocr_raw so the Additional
  // Personal Info section can pre-fill nationality / place of birth from it.
  const [ocrRaw, setOcrRaw] = useState<any>((ex as any)?.ocr_raw ?? null)
  const [firstName, setFirstName] = useState((ex as any)?.first_name ?? '')
  const [middleName, setMiddleName] = useState((ex as any)?.middle_name ?? '')
  const [lastName, setLastName] = useState((ex as any)?.last_name ?? '')
  // Middle name OCR-detected on the passport but not yet entered — offered as a recommendation.
  const [recommendedMiddle, setRecommendedMiddle] = useState<string | null>(null)

  // ── Draft persistence ──────────────────────────────────────────────────────
  // The wizard unmounts this step on navigation (step === 3 && <…/>), so typed /
  // OCR'd values would be lost going forward → back before "Save Passport".
  // Persist the text fields to sessionStorage and restore on remount.
  const draftKey = `polaris.passportdraft.${crewId}.${ex?.id ?? 'new'}`
  const draftRestored = useRef(false)
  useEffect(() => {
    if (draftRestored.current) return
    draftRestored.current = true
    try {
      const raw = sessionStorage.getItem(draftKey)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.firstName) setFirstName(d.firstName)
      if (d.middleName) setMiddleName(d.middleName)
      if (d.lastName) setLastName(d.lastName)
      if (d.nationality) setNationality(d.nationality)
      if (d.passportNumber) setPassportNumber(d.passportNumber)
      if (d.issueDate) setIssueDate(d.issueDate)
      if (d.expiryDate) setExpiryDate(d.expiryDate)
      if (d.issuingCountry) setIssuingCountry(d.issuingCountry)
      if (d.dateOfBirth) setDateOfBirth(d.dateOfBirth)
      if (d.placeOfBirth) setPlaceOfBirth(d.placeOfBirth)
      if (d.placeOfIssue) setPlaceOfIssue(d.placeOfIssue)
      if (d.gender) setGender(d.gender)
      if (d.recommendedMiddle) setRecommendedMiddle(d.recommendedMiddle)
    } catch { /* ignore corrupt draft */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!draftRestored.current) return
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({
        firstName, middleName, lastName, nationality, passportNumber,
        issueDate, expiryDate, issuingCountry, dateOfBirth, placeOfBirth, placeOfIssue, gender, recommendedMiddle,
      }))
    } catch { /* quota / unavailable — non-fatal */ }
  }, [draftKey, firstName, middleName, lastName, nationality, passportNumber, issueDate, expiryDate, issuingCountry, dateOfBirth, placeOfBirth, placeOfIssue, gender, recommendedMiddle])
  const clearDraft = () => { try { sessionStorage.removeItem(draftKey) } catch { /* noop */ } }
  type SlotKey = 'cover' | 'data' | 'seamans' | 'headshot'
  const [files, setFiles] = useState<Record<SlotKey, File | null>>({ cover: null, data: null, seamans: null, headshot: null })
  const [fileNames, setFileNames] = useState<Record<SlotKey, string | null>>({ cover: null, data: null, seamans: null, headshot: null })
  const [sizes, setSizes] = useState<Record<SlotKey, number | null>>({ cover: null, data: null, seamans: null, headshot: null })
  // Existing stored URLs per slot (shown as thumbnails until replaced).
  const existingUrls: Record<SlotKey, string | null> = {
    cover: ex?.cover_url ?? null, data: ex?.document_url ?? null,
    seamans: ex?.seamans_book_url ?? null, headshot: ex?.headshot_url ?? null,
  }
  const [dataPreview, setDataPreview] = useState<string | null>(ex?.document_url ?? null)
  const [dataIsPdf, setDataIsPdf] = useState<boolean>(!!ex?.document_url && /\.pdf(\?|$)/i.test(ex.document_url))
  const [nameMismatch, setNameMismatch] = useState<string | null>(null)
  const [docWarning, setDocWarning] = useState<string | null>(null)
  const [slotPreviews, setSlotPreviews] = useState<Record<SlotKey, string | null>>({ cover: null, data: null, seamans: null, headshot: null })
  const [headshotWarn, setHeadshotWarn] = useState<string | null>(null)
  const headshotWarnRef = useRef<HTMLDivElement>(null)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [noSeamans, setNoSeamans] = useState(ex?.no_seamans_book ?? false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState<SlotKey | null>(null)
  const [headshotScanning, setHeadshotScanning] = useState(false)
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
      setSlotPreviews(p => ({ ...p, [key]: null }))
      if (key === 'headshot') setHeadshotWarn(null)
      if (key === 'data') { setDataPreview(null); setDataIsPdf(false); setExtracted(false); setDocWarning(null) }
      return
    }
    try {
      const c = await compressImageToMaxKB(file, 1000)
      setFiles(f => ({ ...f, [key]: c.file }))
      setSizes(s => ({ ...s, [key]: c.sizeKB }))
      setFileNames(n => ({ ...n, [key]: c.file.name }))
      // Live preview for the secondary image slots (cover / seaman's / headshot).
      if (key !== 'data' && c.isImage) {
        try { setSlotPreviews(p => ({ ...p, [key]: URL.createObjectURL(c.file) })) } catch { /* ignore */ }
      }
      // Headshot quality guard: warn if it looks black & white or lacks a plain background.
      if (key === 'headshot' && c.isImage) {
        await runHeadshotCheck(c.file)
      }
      if (key === 'data') {
        // Preview both images and PDFs (PDFs render in an embedded viewer).
        try { setDataPreview(URL.createObjectURL(c.file)); setDataIsPdf(!c.isImage) } catch { /* ignore */ }
      }
      if (key !== 'data') return
      await scanData(c.base64, c.mediaType, c.isImage, false)
    } catch (e: any) {
      setScanNote('Scan failed: ' + (e?.message ?? 'error'))
    }
  }

  // Run the passport OCR endpoint and apply the result to the form fields.
  // force=true overwrites existing values (manual Rescan); force=false only fills blanks.
  async function scanData(base64: string, mediaType: string, isImage: boolean, force: boolean) {
    setScanning('data'); setScanNote(isImage ? null : 'Reading PDF…')
    try {
      const res = await fetch('/api/visa/passport-ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      })
      const j = await res.json()
      if (!j.ok) { setScanNote(j.error ?? 'Could not scan passport.'); return }
      const d = j.data ?? {}
      const fill = (val: any, cur: string, setter: (v: string) => void) => { if (val && (force || !cur)) setter(val) }
      fill(d.nationality, nationality, setNationality)
      fill(d.passport_number, passportNumber, setPassportNumber)
      fill(d.issue_date, issueDate, setIssueDate)
      fill(d.expiry_date, expiryDate, setExpiryDate)
      fill(d.issuing_country, issuingCountry, setIssuingCountry)
      fill(d.place_of_issue, placeOfIssue, setPlaceOfIssue)
      fill(d.date_of_birth, dateOfBirth, setDateOfBirth)
      fill(d.place_of_birth, placeOfBirth, setPlaceOfBirth)
      fill(d.gender, gender, setGender)
      // Snapshot OCR for the Additional Personal Info section (camelCase keys the
      // /passports/:id/ocr endpoint expects).
      setOcrRaw({
        nationality: d.nationality ?? null,
        placeOfBirth: d.place_of_birth ?? null,
        gender: d.gender ?? null,
        countryOfBirth: null, // passports don't carry country of birth
        ocrCompletedAt: new Date().toISOString(),
      })
      // Names: surname → Last, first given name → First, remaining given names →
      // recommended Middle (not everyone has one, so we suggest rather than force).
      const given = String(d.given_names ?? '').trim()
      const sur = String(d.surname ?? '').trim()
      if (sur && (force || !lastName)) setLastName(sur)
      if (given) {
        const parts = given.split(/\s+/)
        if (force || !firstName) setFirstName(parts[0])
        const mid = parts.slice(1).join(' ')
        if (mid && (force || !middleName)) setRecommendedMiddle(mid)
      }
      // Flag if the passport name differs from the crew profile name.
      const passportName = `${d.given_names ?? ''} ${d.surname ?? ''}`.trim()
      if (crewName && passportName && namesDiffer(crewName, passportName)) setNameMismatch(passportName)
      else setNameMismatch(null)
      const cl = d.checklist ?? {}
      setAuto({
        colour:  typeof cl.is_colour === 'boolean' ? cl.is_colour : null,
        noGlare: typeof cl.has_glare_or_reflections === 'boolean' ? !cl.has_glare_or_reflections : null,
      })
      setExtracted(true)
      // Guard rail: warn if the scan yielded no passport details, or doesn't look
      // like the data page — likely the wrong document/page was uploaded.
      const gotData = !!(d.passport_number || d.nationality || d.issue_date || d.expiry_date || d.surname || d.given_names || d.date_of_birth)
      if (!gotData) {
        setDocWarning("We couldn't read any passport details from this image. Are you sure this is the passport inside (photo/data) page — and that it's clear, in colour, and fully in frame?")
        setScanNote('No details detected — please double-check the document.')
      } else if (cl.is_passport_data_page === false) {
        setDocWarning("This doesn't look like the passport data page. Please confirm you uploaded the inside pages, not the cover or another document.")
        setScanNote('Scanned — but verify this is the correct page.')
      } else {
        setDocWarning(null)
        setScanNote(force ? 'Rescanned — details refreshed below. Please double-check them.' : 'Scanned — details auto-filled below. Please double-check them.')
      }
    } catch (e: any) {
      setScanNote('Scan failed: ' + (e?.message ?? 'error'))
    } finally {
      setScanning(null)
    }
  }

  // Manual "Rescan OCR" — re-runs extraction on the freshly-selected file, or
  // (in edit mode) on the document already stored on the passport.
  async function rescanData() {
    if (scanning) return
    try {
      if (files.data) {
        const c = await compressImageToMaxKB(files.data, 1000)
        await scanData(c.base64, c.mediaType, c.isImage, true)
        return
      }
      if (existingUrls.data) {
        setScanning('data'); setScanNote('Fetching uploaded document…')
        const { base64, mediaType, isImage } = await fetchAsBase64(existingUrls.data)
        await scanData(base64, mediaType, isImage, true)
        return
      }
      setScanNote('Upload the passport inside pages first, then scan.')
    } catch (e: any) {
      setScanNote('Could not rescan: ' + (e?.message ?? 'error'))
      setScanning(null)
    }
  }

  // Headshot quality check — warns if the photo looks black & white or lacks a
  // plain/light background. Accepts a freshly-selected file or a stored blob.
  async function runHeadshotCheck(blob: Blob) {
    const q = await analyzeHeadshot(blob)
    const issues: string[] = []
    if (!q.isColour) issues.push('it looks black & white (a colour photo is preferred)')
    if (!q.whiteBackground) issues.push('the background may not be plain')
    setHeadshotWarn(issues.length ? `Please check the headshot — ${issues.join(', and ')}.` : null)
    return issues.length === 0
  }

  // Manual "Rescan" for the headshot — re-checks the new file or the stored photo.
  async function rescanHeadshot() {
    if (headshotScanning) return
    setHeadshotScanning(true)
    try {
      let blob: Blob | null = files.headshot
      if (!blob && existingUrls.headshot) blob = await (await fetch(existingUrls.headshot)).blob()
      if (!blob) { setHeadshotWarn('Upload a headshot photo first, then rescan.'); return }
      if (!blob.type.startsWith('image/')) { setHeadshotWarn(null); return }
      const ok = await runHeadshotCheck(blob)
      if (ok) toast.success('Headshot looks good — colour photo with a plain background.')
    } catch {
      setHeadshotWarn(null)
    } finally {
      setHeadshotScanning(false)
    }
  }

  // Auto-evaluated checks
  const sixMoOk: boolean | null = (() => {
    if (!expiryDate) return null
    const exp = new Date(expiryDate + 'T00:00:00Z')
    const min = new Date(); min.setMonth(min.getMonth() + 6)
    return exp >= min
  })()
  // True when a date is set but it fails the minimum 6-month validity rule.
  const expiryInvalid = !!expiryDate && sixMoOk === false

  // Toggle a checklist item; block ticking "validity" when the date fails the rule.
  function toggleCheck(key: string) {
    const on = isChecked(key)
    if (key === 'validity' && !on && sixMoOk === false) {
      setError('Cannot confirm “Minimum 6 months validity” — the passport expiry date does not have at least 6 months remaining.')
      return
    }
    setManualChecks(m => ({ ...m, [key]: !on }))
  }
  const allSizes = Object.values(sizes).filter((v): v is number => v != null)
  const sizeOk: boolean | null = allSizes.length === 0 ? null : allSizes.every(v => v <= 1000)

  // Items auto-satisfied by uploads / OCR / validation; the rest the user ticks.
  const autoTrue: Record<string, boolean> = {
    cover:    !!files.cover || !!existingUrls.cover,
    data:     !!files.data || !!existingUrls.data,
    seamans:  noSeamans || !!files.seamans || !!existingUrls.seamans,
    headshot: !!files.headshot || !!existingUrls.headshot,
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
    { key: 'headshot_quality', label: 'Headshot meets photo guidelines', hint: 'neutral · plain light bg · no hat/tint · sharp' },
    { key: 'validity', label: 'Minimum 6 months validity' },
    { key: 'glare',    label: 'Clear — no reflections' },
    { key: 'colour',   label: 'Colour' },
    { key: 'size',     label: 'Under 1000 KB each' },
  ]
  const allChecked = CHECK_ITEMS.every(i => isChecked(i.key))
  // Inside pages, cover and headshot are mandatory (new file or already on file).
  const hasRequiredDocs =
    (!!files.data || !!existingUrls.data) &&
    (!!files.cover || !!existingUrls.cover) &&
    (!!files.headshot || !!existingUrls.headshot)

  // Document Status reflecting what's uploaded / scanned / validated.
  const docStatus = {
    insidePages: ((files.data || existingUrls.data) ? 'uploaded' : 'not_uploaded') as 'uploaded' | 'missing' | 'not_uploaded',
    ocrCompleted: extracted || !!existingUrls.data,
    minimumValidity: sixMoOk === true,
    headshot: ((files.headshot || existingUrls.headshot) ? 'uploaded' : 'missing') as 'uploaded' | 'missing' | 'not_uploaded',
    cover: ((files.cover || existingUrls.cover) ? 'uploaded' : 'not_uploaded') as 'uploaded' | 'missing' | 'not_uploaded',
    seamansBook: ((noSeamans || files.seamans || existingUrls.seamans) ? 'uploaded' : 'not_uploaded') as 'uploaded' | 'missing' | 'not_uploaded',
  }

  const editInputStyle: React.CSSProperties = {
    fontFamily: FONTS.display, fontSize: 13, fontWeight: 600, color: COLORS.frost,
    background: COLORS.abyss, border: `1px solid ${COLORS.signal}60`,
    borderRadius: 5, padding: '4px 8px', width: '100%', outline: 'none', boxSizing: 'border-box',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // The headshot quality check is advisory only — it must never block a save,
    // since immigration portals accept a wide range of photos.

    if (!nationality.trim() || !passportNumber.trim() || !issuingCountry.trim()) {
      setError('Nationality, passport number and issuing country are required.')
      return
    }
    if (!issueDate || !expiryDate) {
      setError('Enter valid issue and expiry dates (dd/mm/yyyy).')
      return
    }
    if (!hasRequiredDocs) {
      setError('Passport inside pages, passport cover and headshot photo are all required.')
      return
    }
    if (expiryInvalid) {
      setError('Passport expiry does not meet the minimum 6 months validity — cannot proceed.')
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
        ...(ex?.id ? { id: ex.id } : {}),
        crew_id: crewId,
        nationality: nationality.trim(),
        passport_number: passportNumber.trim(),
        issue_date: issueDate,
        expiry_date: expiryDate,
        issuing_country: issuingCountry.trim(),
        place_of_issue: placeOfIssue.trim() || null,
        is_primary: ex?.is_primary ?? false,
        // Name + DOB exactly as printed on this passport — stored on the passport
        // itself so the card reflects the passport, not the crew member's
        // (possibly different) preferred name.
        first_name: firstName.trim() || null,
        middle_name: middleName.trim() || null,
        last_name: lastName.trim() || null,
        date_of_birth: dateOfBirth || null,
        // Keep existing attachments when a slot wasn't re-uploaded (edit mode).
        document_url: dataUrl ?? existingUrls.data,
        cover_url: coverUrl ?? existingUrls.cover,
        seamans_book_url: seamansUrl ?? existingUrls.seamans,
        headshot_url: headshotUrl ?? existingUrls.headshot,
        no_seamans_book: noSeamans,
        double_checked: doubleChecked,
        ...(ocrRaw ? { ocr_raw: ocrRaw } : {}),
      } as any)

      // Populate the crew member record with the OCR'd personal details.
      try {
        await (supabase as any).from('crew_members').update({
          ...(firstName.trim() ? { first_name: firstName.trim() } : {}),
          ...(middleName.trim() ? { middle_name: middleName.trim() } : {}),
          ...(lastName.trim() ? { last_name: lastName.trim() } : {}),
          nationality: nationality.trim() || null,
          date_of_birth: dateOfBirth || null,
          place_of_birth: placeOfBirth.trim() || null,
          gender: gender || null,
          updated_at: new Date().toISOString(),
        }).eq('id', crewId)
      } catch { /* non-fatal — passport is saved regardless */ }

      clearDraft()
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
              previewUrl={dataPreview}
              isPdf={dataIsPdf}
              onRescan={rescanData}
            />

            {scanning === 'data' && (
              <p role="status" aria-live="polite" style={{
                fontFamily: FONTS.display, fontSize: 12, color: COLORS.signal, margin: '10px 0 0',
              }}>
                Scanning passport — extracting details…
              </p>
            )}
            {scanNote && scanning !== 'data' && !docWarning && (
              <p style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, margin: '10px 0 0' }}>{scanNote}</p>
            )}
            {docWarning && scanning !== 'data' && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, padding: '11px 14px',
                background: `${COLORS.warn}16`, border: `1px solid ${COLORS.warn}66`, borderRadius: 8,
              }}>
                <span style={{ fontSize: 15, color: COLORS.warn }} aria-hidden="true">⚠</span>
                <span style={{ fontFamily: FONTS.display, fontSize: 12.5, color: COLORS.frost, lineHeight: 1.5 }}>{docWarning}</span>
              </div>
            )}

            {/* Secondary uploads */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <SmallUploadCard number={1} label="Passport Cover" required icon="📄"
                fileName={fileNames.cover} fileKB={sizes.cover} thumbUrl={slotPreviews.cover ?? existingUrls.cover} onZoom={setZoomSrc}
                onFile={(f) => handleSlot('cover', f)} onRemove={() => handleSlot('cover', null)} />
              <SmallUploadCard number={2} label="Seaman's Book" optional icon="📋"
                fileName={fileNames.seamans} fileKB={sizes.seamans} disabled={noSeamans} thumbUrl={slotPreviews.seamans ?? existingUrls.seamans} onZoom={setZoomSrc}
                onFile={(f) => handleSlot('seamans', f)} onRemove={() => handleSlot('seamans', null)}
                footer={
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted }}>
                    <input type="checkbox" checked={noSeamans} onChange={e => { setNoSeamans(e.target.checked); if (e.target.checked) handleSlot('seamans', null) }} />
                    No Seaman's book
                  </label>
                } />
              <SmallUploadCard number={3} label="Headshot Photo" required icon="👤"
                fileName={fileNames.headshot} fileKB={sizes.headshot} thumbUrl={slotPreviews.headshot ?? existingUrls.headshot} onZoom={setZoomSrc}
                scanning={headshotScanning} onRescan={rescanHeadshot}
                onFile={(f) => handleSlot('headshot', f)} onRemove={() => handleSlot('headshot', null)} />
            </div>
            {headshotWarn && (
              <div ref={headshotWarnRef} style={{
                display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, padding: '10px 14px',
                background: `${COLORS.warn}16`, border: `1px solid ${COLORS.warn}66`, borderRadius: 8,
              }}>
                <span style={{ fontSize: 14, color: COLORS.warn }} aria-hidden="true">⚠</span>
                <span style={{ fontFamily: FONTS.display, fontSize: 12.5, color: COLORS.frost, lineHeight: 1.5 }}>
                  {headshotWarn} <strong>You can still save</strong> — just double-check it against the guidelines below, or use Rescan.
                </span>
              </div>
            )}

            {/* Headshot photo requirements — matches the GDRFA / immigration portal */}
            <div style={{ marginTop: 12, padding: '12px 14px', background: COLORS.ocean, border: `1px solid ${COLORS.deep}`, borderRadius: 8 }}>
              <div style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 700, color: COLORS.frost, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                📷 Headshot photo requirements
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 4 }}>
                {([
                  ['Face & pose', 'Look straight at the camera, head centred, face filling most of the frame.'],
                  ['Expression', 'Neutral, mouth closed — no smile, no visible teeth.'],
                  ['Eyes', 'Open and clearly visible, looking at the camera; nothing covering them.'],
                  ['Headwear & glasses', 'No hats or caps; glasses only if lenses are clear (no glare or tint).'],
                  ['Lighting', 'Even front lighting, no strong shadows on the face or background.'],
                  ['Background & quality', 'Plain light background; sharp, in focus, no colour filters.'],
                ] as const).map(([h, t]) => (
                  <li key={h} style={{ fontFamily: FONTS.display, fontSize: 11.5, color: COLORS.steel, lineHeight: 1.5 }}>
                    <span style={{ color: COLORS.frost, fontWeight: 600 }}>{h}:</span> {t}
                  </li>
                ))}
              </ul>
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
                  {dataPreview && dataIsPdf ? (
                    <iframe src={dataPreview} title="Uploaded passport PDF" style={{ width: '100%', height: 260, display: 'block', border: 'none' }} />
                  ) : dataPreview ? (
                    <img
                      src={dataPreview}
                      alt="Uploaded passport — data page"
                      title="Click to enlarge"
                      onClick={() => setZoomSrc(dataPreview)}
                      style={{ width: '100%', display: 'block', cursor: 'zoom-in' }}
                    />
                  ) : (
                    <div style={{ padding: '32px 16px', textAlign: 'center', fontFamily: FONTS.display, fontSize: 12, color: COLORS.steel }}>
                      No preview yet
                    </div>
                  )}
                </div>
                {dataPreview && (
                  <button type="button"
                    onClick={() => dataIsPdf ? window.open(dataPreview, '_blank', 'noreferrer') : setZoomSrc(dataPreview)}
                    style={{ marginTop: 6, background: 'none', border: 'none', cursor: 'zoom-in', fontFamily: FONTS.display, fontSize: 11, color: COLORS.signal, padding: 0 }}>
                    🔍 {dataIsPdf ? 'Open full PDF' : 'Click to enlarge'}
                  </button>
                )}
                {zoomSrc && (
                  <div
                    onClick={() => setZoomSrc(null)}
                    style={{
                      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 24,
                    }}
                  >
                    <img src={zoomSrc} alt="Passport — enlarged" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} />
                  </div>
                )}
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

                {nameMismatch && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, padding: '10px 12px',
                    background: `${COLORS.warn}14`, border: `1px solid ${COLORS.warn}55`, borderRadius: 8,
                  }}>
                    <span style={{ fontSize: 14 }} aria-hidden="true">⚠</span>
                    <span style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.frost, lineHeight: 1.5 }}>
                      <strong>Name discrepancy:</strong> the passport reads <strong>{nameMismatch}</strong>, which differs from the crew profile name <strong>{crewName}</strong>. Verify the crew member matches this passport before saving.
                    </span>
                  </div>
                )}

                {/* Row 0 — Name (OCR fills First/Last; Middle is recommended) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 }}>
                  <FieldCard label="First Name">
                    <input style={editInputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Matthew" required />
                  </FieldCard>
                  <FieldCard label="Middle Name"
                    note={!middleName ? (recommendedMiddle ? 'Recommended from passport' : 'Not on passport — optional') : undefined}
                    noteColor={!middleName && recommendedMiddle ? COLORS.signal : COLORS.muted}>
                    <input
                      style={{ ...editInputStyle, ...(!middleName && recommendedMiddle ? { borderColor: COLORS.signal } : {}) }}
                      value={middleName} onChange={e => { setMiddleName(e.target.value); setRecommendedMiddle(null) }}
                      placeholder={recommendedMiddle ? recommendedMiddle : 'If shown on passport'} />
                    {!middleName && recommendedMiddle && (
                      <button type="button" onClick={() => { setMiddleName(recommendedMiddle); setRecommendedMiddle(null) }}
                        style={{ marginTop: 6, fontFamily: FONTS.display, fontSize: 11, fontWeight: 600, color: COLORS.signal,
                          background: `${COLORS.signal}14`, border: `1px solid ${COLORS.signal}44`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>
                        Use “{recommendedMiddle}”
                      </button>
                    )}
                  </FieldCard>
                  <FieldCard label="Last Name">
                    <input style={editInputStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g. Peeters" required />
                  </FieldCard>
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
                  <FieldCard label="Place of Issue / Authority">
                    <input style={editInputStyle} value={placeOfIssue} onChange={e => setPlaceOfIssue(e.target.value)} placeholder="e.g. HMPO · Authority" />
                  </FieldCard>
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
                    onClick={() => toggleCheck(item.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px',
                      background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', width: '100%',
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
                      color: on ? '#0B0F14' : 'transparent',
                      background: on ? COLORS.signal : 'transparent',
                      border: `2px solid ${on ? COLORS.signal : COLORS.steel}`,
                    }}>✓</span>
                    <span style={{ fontFamily: FONTS.display, fontSize: 12.5, color: COLORS.frost, flex: 1 }}>
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
                disabled={uploading || !doubleChecked || !allChecked || !hasRequiredDocs || expiryInvalid}
                title={expiryInvalid ? 'Passport fails the minimum 6 months validity rule' : !hasRequiredDocs ? 'Upload the passport inside pages, cover and headshot first' : !allChecked ? 'Tick every checklist item first' : !doubleChecked ? 'Confirm you have double-checked the information first' : undefined}
                style={{
                  background: COLORS.signal, border: 'none', borderRadius: 8, color: COLORS.void,
                  fontFamily: FONTS.display, fontSize: 14, fontWeight: 600, padding: '8px 20px',
                  cursor: (uploading || !doubleChecked || !allChecked || !hasRequiredDocs || expiryInvalid) ? 'not-allowed' : 'pointer',
                  opacity: (uploading || !doubleChecked || !allChecked || !hasRequiredDocs || expiryInvalid) ? 0.6 : 1,
                }}
              >
                {uploading ? 'Saving…' : 'Save Passport'}
              </button>
            </div>
          </section>
        </div>

        {/* ── Right column: Document Status ── */}
        <DocumentStatusPanel status={docStatus} expiryDate={expiryDate || undefined} seamansNotApplicable={noSeamans}
          verificationLetterUrl={(ex as any)?.crew_verification_letter_url ?? null}
          crewLastName={lastName} passportNumber={passportNumber}
          downloads={[
            { label: 'Passport cover', url: existingUrls.cover },
            { label: 'Passport inside pages', url: existingUrls.data },
            noSeamans
              ? { label: 'Crew verification letter', url: (ex as any)?.crew_verification_letter_url ?? null }
              : { label: "Seaman's book", url: existingUrls.seamans },
            { label: 'Headshot photo', url: existingUrls.headshot },
          ]} />
      </div>
    </form>
  )
}

// ─── Existing Passport Card (rich style) ───────────────────────────────────────

interface PassportCardProps {
  passport: CrewPassport
  selected: boolean
  onSelect: () => void
  onEdit?: () => void
  crewFirst?: string | null
  crewMiddle?: string | null
  crewLast?: string | null
  crewDob?: string | null
}

function PassportCard({ passport, selected, onSelect, onEdit, crewFirst, crewMiddle, crewLast, crewDob }: PassportCardProps) {
  const expiryColor = getExpiryColor(passport.expiry_date)
  const expiryLabel = getExpiryLabel(passport.expiry_date)
  // Show the name exactly as printed on THIS passport; fall back to the crew
  // member's name only for legacy passports saved before per-passport names.
  const nameFirst  = passport.first_name  ?? crewFirst
  const nameMiddle = passport.middle_name ?? crewMiddle
  const nameLast   = passport.last_name   ?? crewLast
  const nameDob    = passport.date_of_birth ?? crewDob
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const thumbs: { url: string; label: string }[] = [
    passport.document_url ? { url: passport.document_url, label: 'Inside pages' } : null,
    passport.cover_url ? { url: passport.cover_url, label: 'Cover' } : null,
    passport.headshot_url ? { url: passport.headshot_url, label: 'Headshot' } : null,
    passport.seamans_book_url ? { url: passport.seamans_book_url, label: "Seaman's book" } : null,
  ].filter(Boolean) as { url: string; label: string }[]

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
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            style={{
              fontFamily: FONTS.display, fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8,
              border: `1px solid ${COLORS.deep}`, background: 'transparent', color: COLORS.muted, cursor: 'pointer',
            }}
          >
            Edit
          </button>
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
          {/* Document thumbnails */}
          <div style={{ width: 150, flexShrink: 0 }}>
            <span style={{ display: 'block', fontFamily: FONTS.display, fontSize: 11, fontWeight: 600, color: COLORS.muted, marginBottom: 8 }}>
              Documents
            </span>
            {thumbs.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {thumbs.map(t => (
                  <div key={t.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 60 }}>
                    <DocThumb url={t.url} onZoom={setZoomSrc} size={60} />
                    <span style={{ fontFamily: FONTS.display, fontSize: 9, color: COLORS.steel, textAlign: 'center', lineHeight: 1.2 }}>{t.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: COLORS.void, border: `1px solid ${COLORS.deep}`, borderRadius: 8, padding: '24px 12px', textAlign: 'center', fontFamily: FONTS.display, fontSize: 12, color: COLORS.steel }}>
                No documents on file
              </div>
            )}
          </div>

          {/* Extracted-info grid */}
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <FieldCard label="First Name">{nameFirst || '—'}</FieldCard>
            <FieldCard label="Middle Name"
              note={!nameMiddle ? 'Missing — add via Edit if shown on passport' : undefined}
              noteColor={!nameMiddle ? COLORS.warn : undefined}>
              {nameMiddle
                ? nameMiddle
                : <span style={{ color: COLORS.warn }}>—</span>}
            </FieldCard>
            <FieldCard label="Last Name">{nameLast || '—'}</FieldCard>
            <FieldCard label="Date of Birth">{nameDob ? formatDate(nameDob) : '—'}</FieldCard>
            <FieldCard label="Passport Number">
              <span style={{ fontFamily: 'Courier New, monospace', letterSpacing: '0.08em' }}>{passport.passport_number}</span>
            </FieldCard>
            <FieldCard label="Issuing Country">{passport.issuing_country}</FieldCard>
            <FieldCard label="Issue Date">{formatDate(passport.issue_date)}</FieldCard>
            <FieldCard label="Expiry Date">
              <span style={{ color: expiryColor }}>{formatDate(passport.expiry_date)}</span>
            </FieldCard>
            <FieldCard label="Status">
              <span style={{ color: expiryColor }}>{expiryLabel}</span>
            </FieldCard>
          </div>
        </div>

        {/* Right: per-passport Document Status */}
        <DocumentStatusPanel status={docStatus} expiryDate={passport.expiry_date} seamansNotApplicable={!!passport.no_seamans_book}
          verificationLetterUrl={(passport as any).crew_verification_letter_url ?? null}
          crewLastName={nameLast} passportNumber={passport.passport_number}
          downloads={[
            { label: 'Passport cover', url: (passport as any).cover_url ?? null },
            { label: 'Passport inside pages', url: (passport as any).document_url ?? null },
            passport.no_seamans_book
              ? { label: 'Crew verification letter', url: (passport as any).crew_verification_letter_url ?? null }
              : { label: "Seaman's book", url: (passport as any).seamans_book_url ?? null },
            { label: 'Headshot photo', url: (passport as any).headshot_url ?? null },
          ]} />
      </div>

      {zoomSrc && (
        <div
          onClick={() => setZoomSrc(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 24 }}
        >
          <img src={zoomSrc} alt="Document — enlarged" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} />
        </div>
      )}
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
  const [editingPassport, setEditingPassport] = useState<CrewPassport | null>(null)
  const [localPassports, setLocalPassports] = useState<CrewPassport[]>(state.passports)

  const countryConfig = COUNTRY_CONFIGS[state.countryCode as CountryCode]
  const countryName = countryConfig?.countryName ?? state.countryCode
  const countryFlag = countryConfig?.flag ?? ''

  const multiplePassports = state.crew?.multiple_passports ?? false
  const noPassports = localPassports.length === 0

  function handlePassportSaved(passport: CrewPassport) {
    const exists = localPassports.some(p => p.id === passport.id)
    const updated = exists ? localPassports.map(p => p.id === passport.id ? passport : p) : [...localPassports, passport]
    setLocalPassports(updated)
    // Keep the currently-selected passport in sync if it was the one edited.
    onUpdate({ passports: updated, passport: state.passport?.id === passport.id ? passport : (exists ? state.passport ?? passport : passport) })
    setShowAddForm(false)
    setEditingPassport(null)
  }

  function handleSelectPassport(passport: CrewPassport) {
    onUpdate({ passport })
    // Retrospectively keep the crew member's nationality in sync with the chosen
    // passport (fill if missing, or update if it changed). Best-effort.
    const crew = state.crew
    if (crew?.id && passport.nationality && passport.nationality !== crew.nationality) {
      ;(supabase as any).from('crew_members')
        .update({ nationality: passport.nationality, updated_at: new Date().toISOString() })
        .eq('id', crew.id)
        .then(() => {}, () => {})
    }
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

      {/* Editing an existing passport → show the full passport form pre-filled */}
      {editingPassport && state.crew ? (
        <AddPassportForm
          crewId={state.crew.id}
          existingPassport={editingPassport}
          crewName={state.crew.full_name ?? `${state.crew.first_name ?? ''} ${state.crew.last_name ?? ''}`.trim()}
          onSaved={handlePassportSaved}
          onCancel={() => setEditingPassport(null)}
          showCancel
        />
      ) : noPassports && !showAddForm ? (
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
                  onEdit={() => setEditingPassport(p)}
                  crewFirst={state.crew?.first_name}
                  crewMiddle={(state.crew as any)?.middle_name}
                  crewLast={state.crew?.last_name}
                  crewDob={state.crew?.date_of_birth}
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
              crewName={state.crew.full_name ?? `${state.crew.first_name ?? ''} ${state.crew.last_name ?? ''}`.trim()}
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
