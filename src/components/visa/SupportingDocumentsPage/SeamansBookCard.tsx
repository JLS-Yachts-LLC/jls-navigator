import { useRef, useState } from 'react'
import { COLORS, FONTS } from '@/lib/tokens'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE_MB   = 10

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type))
    return 'Only PDF, JPG, or PNG files are accepted.'
  if (file.size > MAX_SIZE_MB * 1024 * 1024)
    return `File must be under ${MAX_SIZE_MB}MB.`
  return null
}

export interface SeamansBookCardProps {
  file: File | null
  onFileSelect: (file: File) => void
  onFileRemove: () => void
}

export function SeamansBookCard({ file, onFileSelect, onFileRemove }: SeamansBookCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return
    const error = validateFile(selected)
    if (error) { setFileError(error); return }
    setFileError(null)
    onFileSelect(selected)
    // Reset input so the same file can be re-selected after removal
    e.target.value = ''
  }

  return (
    <div style={{
      background: COLORS.abyss,
      border: `1px solid #1D9E75`,
      borderRadius: 10,
      padding: 20,
      position: 'relative',
    }}>
      {/* Recommended badge */}
      <div style={{
        position: 'absolute', top: 16, right: 16,
        background: '#1D9E75', color: '#fff',
        fontFamily: FONTS.display, fontSize: 10, fontWeight: 700,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        padding: '3px 10px', borderRadius: 20,
      }}>
        Recommended
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, marginRight: 100 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: '#1D9E7520', border: `1px solid #1D9E75`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 700, color: COLORS.frost }}>
            Seaman's Book (Preferred)
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
            A valid Seaman's Book is the preferred supporting document for all crew visa applications.
          </div>
        </div>
      </div>

      {/* Benefit callout */}
      <div style={{
        background: '#1D9E7514',
        border: `1px solid #1D9E7540`,
        borderRadius: 7,
        padding: '10px 14px',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        marginBottom: 16,
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
             style={{ flexShrink: 0, marginTop: 1 }}>
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span style={{ fontFamily: FONTS.display, fontSize: 12, color: '#1D9E75', lineHeight: 1.55 }}>
          It confirms your maritime employment and helps us process your application faster.
        </span>
      </div>

      {/* Upload zone / uploaded state */}
      {!file ? (
        <div>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed #1D9E75`,
              borderRadius: 8,
              padding: '20px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              background: '#1D9E750A',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#1D9E7516')}
            onMouseLeave={e => (e.currentTarget.style.background = '#1D9E750A')}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                 stroke="#1D9E75" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                 style={{ margin: '0 auto 8px' }}>
              <polyline points="16 16 12 12 8 16"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
            </svg>
            <div style={{ fontFamily: FONTS.display, fontSize: 13, fontWeight: 600, color: COLORS.frost, marginBottom: 4 }}>
              Upload Seaman's Book
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted, marginBottom: 12 }}>
              PDF, JPG or PNG (Max 10MB)
            </div>
            <button
              type="button"
              style={{
                fontFamily: FONTS.display, fontSize: 12, fontWeight: 600,
                color: '#1D9E75', background: '#1D9E7520',
                border: `1px solid #1D9E75`, borderRadius: 6,
                padding: '6px 18px', cursor: 'pointer',
              }}
            >
              Choose File
            </button>
          </div>
          {fileError && (
            <div style={{ marginTop: 8, fontFamily: FONTS.display, fontSize: 11, color: COLORS.warn }}>
              {fileError}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          background: '#1D9E7514',
          border: `1px solid #1D9E7540`,
          borderRadius: 8,
          padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <polyline points="9 15 11 17 15 13"/>
          </svg>
          <span style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost, flex: 1, wordBreak: 'break-all' }}>
            {file.name}
          </span>
          <button
            type="button"
            onClick={onFileRemove}
            style={{
              fontFamily: FONTS.display, fontSize: 12, fontWeight: 600,
              color: COLORS.muted, background: 'none', border: 'none',
              cursor: 'pointer', padding: '2px 6px', flexShrink: 0,
            }}
          >
            Remove
          </button>
        </div>
      )}

      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={handleFileChange}
      />
    </div>
  )
}
