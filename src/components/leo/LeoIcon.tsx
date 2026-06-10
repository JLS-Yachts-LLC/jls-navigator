import { COLORS } from '@/lib/tokens'

interface LeoIconProps {
  size?: number
  /** 'leo' = leoAmber (AI content), 'signal' = cyan (platform use) */
  variant?: 'leo' | 'signal'
  className?: string
}

// Leo constellation — the Sickle (lion's head/mane, a backwards "?") joined to
// the hindquarters triangle. Regulus and Denebola are the bright anchor stars.
const STARS: { x: number; y: number; r: number; bright?: boolean }[] = [
  { x: 16.6, y: 8.6, r: 0.95 },  // 0 Epsilon (top of mane)
  { x: 14.2, y: 8.0, r: 0.85 },  // 1 Mu
  { x: 12.2, y: 9.7, r: 0.85 },  // 2 Zeta
  { x: 10.7, y: 12.4, r: 1.0 },  // 3 Gamma (Algieba)
  { x: 9.9,  y: 16.2, r: 0.85 }, // 4 Eta
  { x: 10.6, y: 20.4, r: 1.8, bright: true }, // 5 Regulus (heart)
  { x: 19.2, y: 19.0, r: 1.0 },  // 6 Theta (Chort)
  { x: 20.8, y: 12.6, r: 1.0 },  // 7 Delta (Zosma)
  { x: 27.0, y: 21.6, r: 1.55, bright: true }, // 8 Denebola (tail)
]
const LINES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], // the sickle (head + mane)
  [5, 6], [6, 7], [7, 8], [6, 8],         // body + hindquarters triangle
]
// Faint background star-field for the "AI star-map" feel.
const DUST: [number, number, number][] = [
  [4, 6, 0.5], [24.5, 6.5, 0.55], [29.5, 12, 0.5], [5.5, 25.5, 0.5],
  [23, 27, 0.55], [30, 27.5, 0.45], [3, 14.5, 0.45], [16, 28.5, 0.5],
]

export function LeoIcon({ size = 24, variant = 'leo', className }: LeoIconProps) {
  const c = variant === 'leo' ? COLORS.leoAmber : COLORS.signal

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-label="Leo"
    >
      {/* faint star dust */}
      {DUST.map(([x, y, r], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r={r} fill={c} opacity="0.22" />
      ))}

      {/* constellation lines */}
      {LINES.map(([a, b], i) => (
        <line
          key={`l${i}`}
          x1={STARS[a].x} y1={STARS[a].y}
          x2={STARS[b].x} y2={STARS[b].y}
          stroke={c}
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.5"
        />
      ))}

      {/* star nodes (bright stars get a soft glow halo) */}
      {STARS.map((s, i) => (
        <g key={`s${i}`}>
          {s.bright && <circle cx={s.x} cy={s.y} r={s.r * 2.6} fill={c} opacity="0.16" />}
          {s.bright && <circle cx={s.x} cy={s.y} r={s.r * 1.7} fill={c} opacity="0.22" />}
          <circle cx={s.x} cy={s.y} r={s.r} fill={s.bright ? c : c} opacity={s.bright ? 1 : 0.9} />
          {s.bright && <circle cx={s.x} cy={s.y} r={s.r * 0.45} fill={COLORS.void} opacity="0.35" />}
        </g>
      ))}
    </svg>
  )
}
