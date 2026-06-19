import { COLORS, FONTS } from '@/lib/tokens'

export interface SupportingLetterCardProps {
  option: 'yes' | 'no' | null
  authorised: boolean
  feeAED: string
  feeUSD: string
  onOptionChange: (val: 'yes' | 'no') => void
  onAuthorisedChange: (val: boolean) => void
}

export function SupportingLetterCard({
  option,
  authorised,
  feeAED,
  feeUSD,
  onOptionChange,
  onAuthorisedChange,
}: SupportingLetterCardProps) {
  return (
    <div style={{
      background: COLORS.abyss,
      border: `1px solid #EF9F27`,
      borderRadius: 10,
      padding: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: '#EF9F2720', border: `1px solid #EF9F27`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="#EF9F27" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 700, color: COLORS.frost }}>
            No Seaman's Book?
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
            JLS can prepare a Supporting Letter on your behalf to submit to Immigration.
          </div>
        </div>
      </div>

      {/* Fee callout */}
      <div style={{
        background: '#EF9F2714',
        border: `1px solid #EF9F2740`,
        borderRadius: 7,
        padding: '10px 14px',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="#EF9F27" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ fontFamily: FONTS.display, fontSize: 11, fontWeight: 700, color: '#EF9F27', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Additional fee applies
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <span style={{
            fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
            color: COLORS.frost, background: '#EF9F2720',
            border: `1px solid #EF9F2760`, borderRadius: 6, padding: '4px 12px',
          }}>
            AED {feeAED}
          </span>
          <span style={{
            fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
            color: COLORS.frost, background: '#EF9F2720',
            border: `1px solid #EF9F2760`, borderRadius: 6, padding: '4px 12px',
          }}>
            USD {feeUSD}
          </span>
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted }}>
          This fee will be added to your application costs.
        </div>
      </div>

      {/* Option: Yes */}
      <div
        onClick={() => onOptionChange('yes')}
        style={{
          border: `1px solid ${option === 'yes' ? '#EF9F27' : COLORS.deep}`,
          background: option === 'yes' ? '#EF9F2710' : 'transparent',
          borderRadius: 8, padding: '12px 14px',
          cursor: 'pointer', marginBottom: 8,
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${option === 'yes' ? '#EF9F27' : COLORS.steel}`,
              background: option === 'yes' ? '#EF9F27' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {option === 'yes' && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
              )}
            </div>
            <span style={{ fontFamily: FONTS.display, fontSize: 13, fontWeight: 600, color: COLORS.frost }}>
              Yes, issue Supporting Letter
            </span>
          </div>
          <span style={{
            fontFamily: FONTS.display, fontSize: 11, fontWeight: 700,
            color: '#EF9F27', background: '#EF9F2720',
            border: `1px solid #EF9F2760`, borderRadius: 20, padding: '2px 10px',
            whiteSpace: 'nowrap',
          }}>
            AED {feeAED} / USD {feeUSD}
          </span>
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted, paddingLeft: 26 }}>
          I authorise JLS to prepare and submit a Supporting Letter on my behalf.
        </div>
      </div>

      {/* Option: No */}
      <div
        onClick={() => onOptionChange('no')}
        style={{
          border: `1px solid ${option === 'no' ? COLORS.signal : COLORS.deep}`,
          background: option === 'no' ? `${COLORS.signal}10` : 'transparent',
          borderRadius: 8, padding: '12px 14px',
          cursor: 'pointer', marginBottom: option === 'yes' ? 12 : 0,
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
            border: `2px solid ${option === 'no' ? COLORS.signal : COLORS.steel}`,
            background: option === 'no' ? COLORS.signal : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {option === 'no' && (
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
            )}
          </div>
          <span style={{ fontFamily: FONTS.display, fontSize: 13, fontWeight: 600, color: COLORS.frost }}>
            No, I will provide alternative documentation
          </span>
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted, paddingLeft: 26 }}>
          I will upload alternative supporting documents as requested.
        </div>
      </div>

      {/* Authorisation checkbox — only when Yes selected */}
      {option === 'yes' && (
        <div style={{
          background: '#EF9F2714',
          border: `1px solid #EF9F2740`,
          borderRadius: 7,
          padding: '12px 14px',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <input
            type="checkbox"
            id="authCheck"
            checked={authorised}
            onChange={e => onAuthorisedChange(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0, accentColor: '#EF9F27', cursor: 'pointer' }}
          />
          <label
            htmlFor="authCheck"
            style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.frost, lineHeight: 1.6, cursor: 'pointer' }}
          >
            I authorise JLS to prepare and submit a Supporting Letter on my behalf and understand that an
            additional charge of AED {feeAED} (USD {feeUSD}) will apply to this application.
          </label>
        </div>
      )}
    </div>
  )
}
