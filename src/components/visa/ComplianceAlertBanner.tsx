import React from 'react';
import { COLORS } from '@/lib/tokens';

interface ComplianceAlert {
  alert_type: string;
  severity: 'info' | 'warn' | 'critical';
  message: string;
  due_date?: string | null;
  crew?: string | null;
}

interface ComplianceAlertBannerProps {
  alert: ComplianceAlert;
  onResolve?: () => void;
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const CriticalIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const WarnIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const InfoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const SEVERITY_CONFIG = {
  critical: {
    bg: 'rgba(232, 112, 32, 0.12)',
    border: 'rgba(232, 112, 32, 0.35)',
    iconColor: COLORS.warn,
    labelColor: COLORS.warn,
    label: 'CRITICAL',
    Icon: CriticalIcon,
  },
  warn: {
    bg: 'rgba(232, 160, 32, 0.12)',
    border: 'rgba(232, 160, 32, 0.35)',
    iconColor: COLORS.leoAmber,
    labelColor: COLORS.leoAmber,
    label: 'WARNING',
    Icon: WarnIcon,
  },
  info: {
    bg: 'rgba(0, 196, 204, 0.10)',
    border: 'rgba(0, 196, 204, 0.30)',
    iconColor: COLORS.signal,
    labelColor: COLORS.signal,
    label: 'INFO',
    Icon: InfoIcon,
  },
};

export function ComplianceAlertBanner({ alert, onResolve }: ComplianceAlertBannerProps) {
  const config = SEVERITY_CONFIG[alert.severity];
  const { Icon } = config;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '8px',
        background: config.bg,
        border: `1px solid ${config.border}`,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <div style={{ color: config.iconColor, flexShrink: 0, marginTop: '1px' }}>
        <Icon />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              color: config.labelColor,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {config.label}
          </span>
          {alert.crew && (
            <span
              style={{
                fontSize: '11px',
                color: COLORS.muted,
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              · {alert.crew}
            </span>
          )}
        </div>

        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: COLORS.frost,
            lineHeight: '1.45',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {alert.message}
        </p>

        {alert.due_date && (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '12px',
              color: COLORS.muted,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Due: {formatDueDate(alert.due_date)}
          </p>
        )}
      </div>

      {onResolve && (
        <button
          onClick={onResolve}
          style={{
            flexShrink: 0,
            padding: '4px 10px',
            borderRadius: '5px',
            border: `1px solid ${config.border}`,
            background: 'transparent',
            color: config.labelColor,
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Space Grotesk', sans-serif",
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = config.bg;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          Resolve
        </button>
      )}
    </div>
  );
}

export default ComplianceAlertBanner;
