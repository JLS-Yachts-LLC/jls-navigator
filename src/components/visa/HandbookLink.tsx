'use client'

const HANDBOOK_URL = 'https://online.fliphtml5.com/SuperyachtMiddleEast/oytr/index.html#p=1'

interface HandbookLinkProps {
  countryCode?: string
}

export default function HandbookLink({ countryCode }: HandbookLinkProps) {
  return (
    <a
      href={HANDBOOK_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        background: '#0D1520',
        border: '1px solid #0F2030',
        borderLeft: '3px solid #00C4CC',
        borderRadius: 6,
        textDecoration: 'none',
        fontFamily: 'Space Grotesk',
        fontSize: 12,
        color: '#00C4CC',
        letterSpacing: '0.04em',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLAnchorElement).style.background = '#0F2030'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLAnchorElement).style.background = '#0D1520'
      }}
    >
      {/* Book icon */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#00C4CC"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>

      <span style={{ flex: 1 }}>
        Resources —{' '}
        <span style={{ color: '#7A9DB8' }}>Our Port &amp; Agency Team</span>
      </span>

      {/* External link icon */}
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#3A5570"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  )
}
