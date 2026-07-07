import { useId } from 'react'

/**
 * Leo mark — original vector artwork (no stock/licensing): a stylised line-art
 * lion head centred in a glowing zodiac ring on a transparent background.
 * Scales crisply at any size; `variant` picks the glow colour family.
 */
interface LeoIconProps {
  size?: number
  variant?: 'leo' | 'signal'
  className?: string
}

export function LeoIcon({ size = 24, variant = 'leo', className }: LeoIconProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const main = variant === 'signal' ? '#00C4CC' : '#3FE0EC'
  const soft = variant === 'signal' ? '#7EE7EB' : '#8EEBF2'

  // 12 zodiac-ring ticks (every 30°) + intermediate dots, computed inline.
  const ticks: React.ReactNode[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180
    const cos = Math.cos(a); const sin = Math.sin(a)
    ticks.push(
      <line key={`t${i}`} x1={120 + 92 * cos} y1={120 + 92 * sin} x2={120 + 102 * cos} y2={120 + 102 * sin}
        stroke={soft} strokeWidth={2} strokeLinecap="round" opacity={0.85} />,
    )
    const b = ((i * 30 + 15) * Math.PI) / 180
    ticks.push(
      <circle key={`d${i}`} cx={120 + 97 * Math.cos(b)} cy={120 + 97 * Math.sin(b)} r={1.6} fill={soft} opacity={0.6} />,
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg"
      className={className} role="img" aria-label="Leo">
      <defs>
        <radialGradient id={`${uid}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor={main} stopOpacity="0" />
          <stop offset="82%" stopColor={main} stopOpacity="0.22" />
          <stop offset="100%" stopColor={main} stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" /><feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Halo */}
      <circle cx="120" cy="120" r="118" fill={`url(#${uid}-halo)`} />

      {/* Zodiac ring */}
      <g filter={`url(#${uid}-glow)`}>
        <circle cx="120" cy="120" r="106" stroke={main} strokeWidth="2" opacity="0.9" />
        <circle cx="120" cy="120" r="88" stroke={soft} strokeWidth="1.2" opacity="0.55" />
        {ticks}
      </g>

      {/* Sparkles */}
      <g fill={soft} opacity="0.9">
        <path d="M36 58l2.2 5.8L44 66l-5.8 2.2L36 74l-2.2-5.8L28 66l5.8-2.2z" opacity="0.7" />
        <path d="M206 44l1.6 4.2 4.2 1.6-4.2 1.6-1.6 4.2-1.6-4.2-4.2-1.6 4.2-1.6z" opacity="0.55" />
        <circle cx="196" cy="196" r="2.2" opacity="0.6" />
      </g>

      {/* Lion head — mane as two beaded rings, face as line art */}
      <g filter={`url(#${uid}-glow)`} stroke={main} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx="120" cy="122" r="58" strokeWidth="3" strokeDasharray="13 9" opacity="0.9" />
        <circle cx="120" cy="122" r="49" stroke={soft} strokeWidth="1.6" strokeDasharray="7 10" opacity="0.55" transform="rotate(11 120 122)" />

        {/* Ears */}
        <path d="M96 92q-8-10 2-16 9-5 13 6" strokeWidth="2.6" />
        <path d="M144 92q8-10-2-16-9-5-13 6" strokeWidth="2.6" />
        {/* Brow / top of head */}
        <path d="M100 93q20-14 40 0" strokeWidth="2.6" />
        {/* Eyes */}
        <path d="M100 112q7-6 15 0" strokeWidth="2.6" />
        <path d="M125 112q7-6 15 0" strokeWidth="2.6" />
        {/* Nose bridge + cheeks */}
        <path d="M112 122q8-5 16 0" strokeWidth="2" opacity="0.8" />
        {/* Nose */}
        <path d="M120 128l-8 9 8 8 8-8z" strokeWidth="2.6" />
        {/* Muzzle + chin */}
        <path d="M112 150q8 9 16 0" strokeWidth="2.4" />
        <path d="M120 145v6" strokeWidth="2" opacity="0.8" />
        {/* Jaw sweeps */}
        <path d="M95 128q-2 20 15 30" strokeWidth="2" opacity="0.7" />
        <path d="M145 128q2 20-15 30" strokeWidth="2" opacity="0.7" />
      </g>
    </svg>
  )
}
