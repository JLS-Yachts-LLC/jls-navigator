import { COLORS, FONTS } from '@/lib/tokens'

const DOCUMENTS = [
  {
    icon: 'book',
    name: 'Passport External Cover',
    sub:  'Front cover of passport',
  },
  {
    icon: 'id',
    name: 'Passport Copy',
    sub:  'Photo & details pages (2 pages)',
  },
  {
    icon: 'notebook',
    name: "Seaman's Book",
    sub:  'Relevant pages (2 pages)',
  },
  {
    icon: 'camera',
    name: 'Passport Photo',
    sub:  'Recent passport size photograph',
  },
] as const

function DocIcon({ type }: { type: typeof DOCUMENTS[number]['icon'] }) {
  const stroke = COLORS.signal
  if (type === 'book') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  )
  if (type === 'id') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <line x1="16" y1="10" x2="16" y2="10"/>
      <path d="M6 10h4"/>
      <path d="M6 14h8"/>
    </svg>
  )
  if (type === 'notebook') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  )
  // camera
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  )
}

export function OtherDocumentsCard() {
  return (
    <div style={{
      background: COLORS.abyss,
      border: `1px solid ${COLORS.deep}`,
      borderRadius: 10,
      padding: 20,
      marginTop: 16,
    }}>
      {/* Section heading */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 700, color: COLORS.frost, marginBottom: 4 }}>
          Other required supporting documents
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted }}>
          Please ensure you have soft copies of the following documents ready to upload.
        </div>
      </div>

      {/* Four-column chip grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 16,
      }}>
        {DOCUMENTS.map(doc => (
          <div
            key={doc.name}
            style={{
              background: `${COLORS.signal}0A`,
              border: `1px solid ${COLORS.signal}30`,
              borderRadius: 8,
              padding: '14px 12px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textAlign: 'center', gap: 8,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: `${COLORS.signal}18`, border: `1px solid ${COLORS.signal}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DocIcon type={doc.icon} />
            </div>
            <div>
              <div style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 600, color: COLORS.frost, marginBottom: 3 }}>
                {doc.name}
              </div>
              <div style={{ fontFamily: FONTS.display, fontSize: 11, color: COLORS.muted, lineHeight: 1.45 }}>
                {doc.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '10px 14px',
        background: `${COLORS.signal}0A`,
        border: `1px solid ${COLORS.signal}20`,
        borderRadius: 7,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke={COLORS.signal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ fontFamily: FONTS.display, fontSize: 12, color: COLORS.muted, lineHeight: 1.55 }}>
          Additional documents may be requested based on nationality and destination.
        </span>
      </div>
    </div>
  )
}
