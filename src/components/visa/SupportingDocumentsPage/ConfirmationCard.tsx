import { COLORS, FONTS } from '@/lib/tokens'

export interface ConfirmationCardProps {
  checked: boolean
  onChange: (val: boolean) => void
}

export function ConfirmationCard({ checked, onChange }: ConfirmationCardProps) {
  return (
    <div style={{
      background: COLORS.abyss,
      border: `1px solid ${COLORS.deep}`,
      borderRadius: 10,
      padding: 20,
      marginTop: 16,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: '#1D9E7520', border: `1px solid #1D9E75`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke="#1D9E75" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <span style={{ fontFamily: FONTS.display, fontSize: 14, fontWeight: 700, color: COLORS.frost }}>
          Confirmation
        </span>
      </div>

      {/* Checkbox */}
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        cursor: 'pointer', marginBottom: 16,
      }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0, accentColor: '#1D9E75', cursor: 'pointer', width: 16, height: 16 }}
        />
        <span style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.frost, lineHeight: 1.6 }}>
          I confirm that soft copies of all requested supporting documents are available and ready for upload.
        </span>
      </label>

      {/* Divider */}
      <div style={{ height: 1, background: COLORS.deep, marginBottom: 14 }} />

      {/* Footer note */}
      <div style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, lineHeight: 1.6 }}>
        <span style={{ color: COLORS.warn, fontWeight: 700 }}>Please note: </span>
        You can upload documents in the next step. You will be able to review and confirm before submission.
      </div>
    </div>
  )
}
