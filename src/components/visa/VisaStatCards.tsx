/**
 * VisaStatCards
 *
 * Four metric cards for the Vessel Visa Report screen.
 * Replaces the old navy-header stat blocks from migration 051.
 *
 * Design rules:
 *  - White card surface, coloured left-border accent (4px) encodes status
 *  - Traffic-light system: green = active, amber = expiring, red = expired, blue = total
 *  - Number is the hero — 40px, weight 500, Halis GR
 *  - Label and trend below in DINPro 14px
 *  - Skeleton loader while data fetches (no full-screen spinner)
 *  - Cards are clickable — onClick scrolls to the relevant section
 *
 * Palette:
 *  Jamaica Bay  #96CBC7  (teal accent)
 *  Dodger Blue  #4590BA  (primary — total count)
 *  Teal Blue    #07435E  (nav, dark text)
 *  Active       #22C55E  (green — safe)
 *  Expiring     #F59E0B  (amber — attention)
 *  Expired      #EF4444  (red — critical)
 */

import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VisaStatVariant = 'total' | 'active' | 'expiring' | 'expired';

export interface VisaStatCardProps {
  variant: VisaStatVariant;
  label: string;
  count: number | null;   // null = loading
  subLabel?: string;      // e.g. "3 within 5 working days"
  onClick?: () => void;
}

export interface VisaStatCardsProps {
  total: number | null;
  active: number | null;
  expiring: number | null;
  expired: number | null;
  expiringUrgent?: number;   // count within 5 working days — shown in sub-label
  onCardClick?: (variant: VisaStatVariant) => void;
}

// ─── Token map ────────────────────────────────────────────────────────────────

const VARIANT_TOKENS: Record<
  VisaStatVariant,
  { borderColor: string; iconColor: string; bgTint: string; icon: string; ariaLabel: string }
> = {
  total: {
    borderColor: '#4590BA',
    iconColor:   '#4590BA',
    bgTint:      'rgba(69,144,186,0.06)',
    icon:        'ti-files',
    ariaLabel:   'Total visa records',
  },
  active: {
    borderColor: '#22C55E',
    iconColor:   '#16A34A',
    bgTint:      'rgba(34,197,94,0.06)',
    icon:        'ti-circle-check',
    ariaLabel:   'Active visas',
  },
  expiring: {
    borderColor: '#F59E0B',
    iconColor:   '#D97706',
    bgTint:      'rgba(245,158,11,0.06)',
    icon:        'ti-clock-exclamation',
    ariaLabel:   'Visas expiring soon',
  },
  expired: {
    borderColor: '#EF4444',
    iconColor:   '#DC2626',
    bgTint:      'rgba(239,68,68,0.06)',
    icon:        'ti-alert-circle',
    ariaLabel:   'Expired visas',
  },
};

// ─── Single card ──────────────────────────────────────────────────────────────

export function VisaStatCard({ variant, label, count, subLabel, onClick }: VisaStatCardProps) {
  const tokens = VARIANT_TOKENS[variant];
  const isLoading = count === null;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${tokens.ariaLabel}: ${count ?? 'loading'}. Click to view.` : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      style={{
        position:        'relative',
        background:      '#FFFFFF',
        borderRadius:    '12px',
        border:          '1px solid #E5E7EB',
        borderLeft:      `4px solid ${tokens.borderColor}`,
        padding:         '20px 20px 18px 20px',
        cursor:          onClick ? 'pointer' : 'default',
        transition:      'box-shadow 0.15s ease, transform 0.1s ease',
        flex:            '1 1 0',
        minWidth:        '0',
        backgroundColor: tokens.bgTint,
      }}
      onMouseEnter={(e) => {
        if (!onClick) return;
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(7,67,94,0.10)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Icon */}
      <div style={{ marginBottom: '12px' }}>
        <i
          className={`ti ${tokens.icon}`}
          aria-hidden="true"
          style={{ fontSize: '20px', color: tokens.iconColor }}
        />
      </div>

      {/* Count — hero number */}
      {isLoading ? (
        <div
          aria-busy="true"
          aria-label="Loading"
          style={{
            height:       '40px',
            width:        '60px',
            borderRadius: '6px',
            background:   'linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%)',
            backgroundSize: '200% 100%',
            animation:    'polarisSkeleton 1.4s ease-in-out infinite',
            marginBottom: '8px',
          }}
        />
      ) : (
        <div
          style={{
            fontFamily:  "'Halis GR', 'Inter', sans-serif",
            fontSize:    '40px',
            fontWeight:  '500',
            lineHeight:  '1',
            color:       '#07435E',
            marginBottom: '6px',
            letterSpacing: '-0.5px',
          }}
        >
          {count.toLocaleString()}
        </div>
      )}

      {/* Label */}
      <div
        style={{
          fontFamily: "'DINPro', 'Inter', sans-serif",
          fontSize:   '14px',
          fontWeight: '500',
          color:      '#374151',
          marginBottom: subLabel ? '4px' : '0',
        }}
      >
        {label}
      </div>

      {/* Sub-label */}
      {subLabel && (
        <div
          style={{
            fontFamily: "'DINPro', 'Inter', sans-serif",
            fontSize:   '12px',
            color:      tokens.iconColor,
            fontWeight: '400',
          }}
        >
          {subLabel}
        </div>
      )}

      {/* Clickable arrow indicator */}
      {onClick && !isLoading && (
        <div
          style={{
            position:  'absolute',
            top:       '18px',
            right:     '16px',
            color:     '#9CA3AF',
            fontSize:  '14px',
          }}
          aria-hidden="true"
        >
          <i className="ti ti-chevron-right" />
        </div>
      )}
    </div>
  );
}

// ─── Four-card group ──────────────────────────────────────────────────────────

export function VisaStatCards({
  total,
  active,
  expiring,
  expired,
  expiringUrgent,
  onCardClick,
}: VisaStatCardsProps) {
  return (
    <>
      {/* Skeleton keyframe — injected once */}
      <style>{`
        @keyframes polarisSkeleton {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div
        role="region"
        aria-label="Visa status summary"
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap:                 '16px',
          // Collapse to 2-col on narrow viewports
          // (handled via media query below — inline styles can't do this,
          //  so a wrapper class is added for the responsive override)
        }}
        className="polaris-visa-stat-grid"
      >
        <VisaStatCard
          variant="total"
          label="Total crew visas"
          count={total}
          onClick={onCardClick ? () => onCardClick('total') : undefined}
        />
        <VisaStatCard
          variant="active"
          label="Active"
          count={active}
          subLabel="All clear"
          onClick={onCardClick ? () => onCardClick('active') : undefined}
        />
        <VisaStatCard
          variant="expiring"
          label="Expiring soon"
          count={expiring}
          subLabel={
            expiringUrgent && expiringUrgent > 0
              ? `${expiringUrgent} within 5 working days`
              : undefined
          }
          onClick={onCardClick ? () => onCardClick('expiring') : undefined}
        />
        <VisaStatCard
          variant="expired"
          label="Expired"
          count={expired}
          subLabel={
            expired != null && expired > 0 ? 'Immediate action required' : undefined
          }
          onClick={onCardClick ? () => onCardClick('expired') : undefined}
        />
      </div>

      {/* Responsive grid collapse */}
      <style>{`
        @media (max-width: 900px) {
          .polaris-visa-stat-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 480px) {
          .polaris-visa-stat-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}

export default VisaStatCards;
