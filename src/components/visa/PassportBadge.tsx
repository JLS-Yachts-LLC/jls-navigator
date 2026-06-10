import React from 'react';
import { COLORS } from '@/lib/tokens';
import type { CrewPassport } from '@/lib/visa/crewMatching';

interface PassportBadgeProps {
  passport: CrewPassport;
  selected?: boolean;
  onClick?: () => void;
  showPrimaryBadge?: boolean;
}

function getFlagEmoji(nationalityCode: string): string {
  if (!nationalityCode || nationalityCode.length !== 2) return '🌐';
  const codePoints = nationalityCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function getExpiryColor(expiryDateStr: string | null | undefined): string {
  if (!expiryDateStr) return COLORS.muted;
  const expiry = new Date(expiryDateStr);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44);
  if (diffMonths < 6) return COLORS.warn;
  if (diffMonths < 12) return COLORS.leoAmber;
  return '#22C55E';
}

function formatExpiry(expiryDateStr: string | null | undefined): string {
  if (!expiryDateStr) return 'No expiry';
  const d = new Date(expiryDateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PassportBadge: React.FC<PassportBadgeProps> = ({
  passport,
  selected = false,
  onClick,
  showPrimaryBadge = false,
}) => {
  const expiryColor = getExpiryColor(passport.expiry_date);
  const flagEmoji = getFlagEmoji(passport.nationality || '');
  const nationalityCode = (passport.nationality || '??').toUpperCase();
  const isPrimary = passport.is_primary && showPrimaryBadge;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 12px',
    height: '48px',
    borderRadius: '24px',
    backgroundColor: COLORS.deep,
    border: `1.5px solid ${selected ? COLORS.signal : COLORS.steel}`,
    cursor: onClick ? 'pointer' : 'default',
    fontFamily: 'Space Grotesk, sans-serif',
    transition: 'border-color 0.15s ease',
    boxShadow: selected ? `0 0 0 1px ${COLORS.signal}33` : 'none',
    position: 'relative',
    userSelect: 'none',
    minWidth: '220px',
    maxWidth: '320px',
    overflow: 'hidden',
    flexShrink: 0,
  };

  const flagNatStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  };

  const flagStyle: React.CSSProperties = {
    fontSize: '16px',
    lineHeight: 1,
  };

  const natCodeStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: COLORS.frost,
    letterSpacing: '0.05em',
    fontFamily: 'Space Grotesk, sans-serif',
  };

  const dividerStyle: React.CSSProperties = {
    width: '1px',
    height: '20px',
    backgroundColor: COLORS.steel,
    flexShrink: 0,
  };

  const passportNumberStyle: React.CSSProperties = {
    fontSize: '11px',
    fontFamily: 'monospace',
    color: COLORS.frost,
    letterSpacing: '0.08em',
    flexGrow: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const expiryStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 500,
    color: expiryColor,
    fontFamily: 'Space Grotesk, sans-serif',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  };

  const primaryBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 5px',
    borderRadius: '4px',
    backgroundColor: `${COLORS.signal}22`,
    border: `1px solid ${COLORS.signal}55`,
    color: COLORS.signal,
    fontSize: '8px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    fontFamily: 'Space Grotesk, sans-serif',
    flexShrink: 0,
  };

  return (
    <div
      style={containerStyle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div style={flagNatStyle}>
        <span style={flagStyle}>{flagEmoji}</span>
        <span style={natCodeStyle}>{nationalityCode}</span>
      </div>

      <div style={dividerStyle} />

      <span style={passportNumberStyle}>
        {passport.passport_number || '—'}
      </span>

      <div style={dividerStyle} />

      <span style={expiryStyle}>
        {formatExpiry(passport.expiry_date)}
      </span>

      {isPrimary && (
        <>
          <div style={dividerStyle} />
          <span style={primaryBadgeStyle}>Primary</span>
        </>
      )}
    </div>
  );
};

export default PassportBadge;
