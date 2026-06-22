/**
 * ExpiryFlagBadge — Ticket #182
 *
 * Shows the highest-urgency visa expiry flag that has fired for an application.
 * Three tiers: 5 working days (red), 10 working days (amber), 30 calendar days (cyan).
 * Renders nothing if the visa is renewed or no flag is active.
 *
 * Adapted to the app's inline-token style (no Tailwind / no emoji).
 */

import { COLORS, FONTS } from '@/lib/tokens'

const RED = '#E0524F'

interface ExpiryFlagBadgeProps {
  visaRenewed: boolean
  // expiry_flags_sent shape: { "30_day": iso|null, "10_working": iso|null, "5_working": iso|null }
  expiryFlagsSent: Record<string, string | null> | null | undefined
}

const TIER = {
  '5_working':  { label: 'Expires in 5 working days',  color: RED },
  '10_working': { label: 'Expires in 10 working days', color: COLORS.leoAmber },
  '30_day':     { label: 'Expires in 30 days',         color: COLORS.signal },
} as const

export function ExpiryFlagBadge({ visaRenewed, expiryFlagsSent }: ExpiryFlagBadgeProps) {
  if (visaRenewed) return null
  const sent = expiryFlagsSent ?? {}

  const tier = sent['5_working'] ? '5_working'
    : sent['10_working'] ? '10_working'
    : sent['30_day'] ? '30_day'
    : null
  if (!tier) return null

  const { label, color } = TIER[tier]

  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 9px', borderRadius: 999,
        background: `${color}1A`, border: `1px solid ${color}55`,
        fontFamily: FONTS.display, fontSize: 11, fontWeight: 600, color,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}
