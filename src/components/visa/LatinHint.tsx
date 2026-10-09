/**
 * Warns when a passport field holds non-English letters, and offers the fix.
 *
 * Immigration forms need English (Latin) letters — a Russian passport's place of
 * birth printed only in Cyrillic, or a Cyrillic look-alike letter in a name, is
 * refused or silently mismatched (SD-0050). Shows nothing when the value is fine.
 */
import { COLORS, FONTS } from '@/lib/tokens'
import { hasNonLatin, toLatin } from '@/lib/latin-text'

export function LatinHint({ value, onFix }: { value: string | null | undefined; onFix: (next: string) => void }) {
  if (!hasNonLatin(value)) return null
  const fixed = toLatin(value ?? '')
  return (
    <div role="alert" style={{
      marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
      fontFamily: FONTS.display, fontSize: 12, lineHeight: 1.4, color: COLORS.warn,
    }}>
      <span>Not in English letters — immigration forms need English.</span>
      <button type="button" onClick={() => onFix(fixed)} title={`Change to “${fixed}”`}
        style={{
          fontFamily: FONTS.display, fontSize: 12, fontWeight: 600, color: COLORS.warn,
          background: `${COLORS.warn}14`, border: `1px solid ${COLORS.warn}55`, borderRadius: 6,
          padding: '3px 8px', cursor: 'pointer',
        }}>
        Use “{fixed}”
      </button>
    </div>
  )
}
