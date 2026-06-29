/**
 * VisaCrewTable
 *
 * Replaces the old dense table-first default for Expired / Expiring / Active
 * crew lists on the Vessel Visa Report screen (migration 051).
 *
 * Design rules:
 *  - Default view: card rows (not a table). "View as table" is the secondary option.
 *  - Each row is scannable in < 2 seconds: name, role, nationality, visa status, expiry.
 *  - Status dot + coloured expiry text = traffic-light at a glance.
 *  - "View all" expands from a 5-row preview — no separate navigation.
 *  - Empty state has a call-to-action, never just "No data".
 *  - Row hover state uses Teal Blue tint — no navy.
 *  - Skeleton loaders for initial fetch.
 *
 * Used by: VesselReportScreen for each of the three status sections.
 */

import React, { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VisaStatus = 'active' | 'expiring_30' | 'expiring_10' | 'expiring_5' | 'expired';

export interface VisaCrewRecord {
  id:           string;
  crewName:     string;
  role:         string;
  nationality:  string;
  passportNo:   string;
  visaType:     string;
  expiryDate:   string;          // ISO 8601 — "2026-08-15"
  daysUntil:    number;          // negative = already expired
  workingDays:  number;          // working days remaining (UAE calendar)
  status:       VisaStatus;
  photoUrl?:    string;
}

export type SectionVariant = 'expired' | 'expiring' | 'active';

export interface VisaCrewTableProps {
  variant:      SectionVariant;
  title:        string;
  records:      VisaCrewRecord[] | null;    // null = loading
  defaultRows?: number;                     // rows shown before "View all" — default 5
  onRowClick?:  (record: VisaCrewRecord) => void;
  onAddVisa?:   () => void;                 // empty state CTA
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatExpiry(daysUntil: number, workingDays: number, status: VisaStatus): {
  text:  string;
  color: string;
} {
  if (status === 'expired') {
    const abs = Math.abs(daysUntil);
    return {
      text:  abs === 1 ? 'Expired yesterday' : `Expired ${abs} days ago`,
      color: '#DC2626',
    };
  }
  if (status === 'expiring_5') {
    return {
      text:  `${workingDays} working day${workingDays === 1 ? '' : 's'} left`,
      color: '#DC2626',
    };
  }
  if (status === 'expiring_10') {
    return {
      text:  `${workingDays} working days left`,
      color: '#D97706',
    };
  }
  if (status === 'expiring_30') {
    return {
      text:  `${daysUntil} days left`,
      color: '#D97706',
    };
  }
  return {
    text:  new Date(new Date().getTime() + daysUntil * 86400000).toLocaleDateString('en-AE', {
      day:   '2-digit',
      month: 'short',
      year:  'numeric',
    }),
    color: '#16A34A',
  };
}

function statusDot(status: VisaStatus): string {
  if (status === 'expired')     return '#EF4444';
  if (status === 'expiring_5')  return '#EF4444';
  if (status === 'expiring_10') return '#F59E0B';
  if (status === 'expiring_30') return '#F59E0B';
  return '#22C55E';
}

function sectionAccent(variant: SectionVariant): string {
  if (variant === 'expired')  return '#EF4444';
  if (variant === 'expiring') return '#F59E0B';
  return '#22C55E';
}

function sectionIconClass(variant: SectionVariant): string {
  if (variant === 'expired')  return 'ti-alert-circle';
  if (variant === 'expiring') return 'ti-clock-exclamation';
  return 'ti-circle-check';
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  const bar = (w: number) => (
    <div
      style={{
        height:           '14px',
        width:            `${w}px`,
        borderRadius:     '4px',
        background:       'linear-gradient(90deg,#F3F4F6 25%,#E5E7EB 50%,#F3F4F6 75%)',
        backgroundSize:   '200% 100%',
        animation:        'polarisSkeleton 1.4s ease-in-out infinite',
      }}
    />
  );
  return (
    <div
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:           '16px',
        padding:       '14px 16px',
        borderBottom:  '1px solid #F3F4F6',
      }}
    >
      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#E5E7EB' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {bar(140)} {bar(100)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
        {bar(80)} {bar(60)}
      </div>
    </div>
  );
}

// ─── Crew row ─────────────────────────────────────────────────────────────────

interface CrewRowProps {
  record:    VisaCrewRecord;
  onClick?:  (r: VisaCrewRecord) => void;
  isLast:    boolean;
}

function CrewRow({ record, onClick, isLast }: CrewRowProps) {
  const [hovered, setHovered] = useState(false);
  const expiry = formatExpiry(record.daysUntil, record.workingDays, record.status);
  const dot    = statusDot(record.status);

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={
        onClick
          ? `${record.crewName}, ${record.role}. Visa ${expiry.text}. Click to view.`
          : undefined
      }
      onClick={() => onClick?.(record)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(record); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            '14px',
        padding:        '13px 16px',
        borderBottom:   isLast ? 'none' : '1px solid #F3F4F6',
        cursor:         onClick ? 'pointer' : 'default',
        background:     hovered && onClick ? 'rgba(7,67,94,0.04)' : 'transparent',
        transition:     'background 0.12s ease',
        borderRadius:   isLast ? '0 0 12px 12px' : '0',
      }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {record.photoUrl ? (
          <img
            src={record.photoUrl}
            alt={`${record.crewName} photo`}
            style={{
              width:        '36px',
              height:       '36px',
              borderRadius: '50%',
              objectFit:    'cover',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width:        '36px',
              height:       '36px',
              borderRadius: '50%',
              background:   'rgba(7,67,94,0.10)',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              fontFamily:   "'DINPro','Inter',sans-serif",
              fontSize:     '13px',
              fontWeight:   '500',
              color:        '#07435E',
            }}
          >
            {initials(record.crewName)}
          </div>
        )}
        {/* Status dot */}
        <span
          aria-hidden="true"
          style={{
            position:    'absolute',
            bottom:      '0',
            right:       '0',
            width:       '10px',
            height:      '10px',
            borderRadius:'50%',
            background:  dot,
            border:      '2px solid #FFFFFF',
          }}
        />
      </div>

      {/* Name + role */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily:   "'DINPro','Inter',sans-serif",
            fontSize:     '15px',
            fontWeight:   '500',
            color:        '#07435E',
            whiteSpace:   'nowrap',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {record.crewName}
        </div>
        <div
          style={{
            fontFamily: "'DINPro','Inter',sans-serif",
            fontSize:   '13px',
            color:      '#6B7280',
            marginTop:  '2px',
          }}
        >
          {record.role} · {record.nationality}
        </div>
      </div>

      {/* Visa type */}
      <div
        style={{
          fontFamily: "'DINPro','Inter',sans-serif",
          fontSize:   '13px',
          color:      '#6B7280',
          flexShrink: 0,
          display:    'none', // hidden on mobile, shown on md+
        }}
        className="polaris-visa-col-md"
      >
        {record.visaType}
      </div>

      {/* Expiry */}
      <div
        style={{
          textAlign:  'right',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: "'DINPro','Inter',sans-serif",
            fontSize:   '13px',
            fontWeight: '500',
            color:      expiry.color,
          }}
        >
          {expiry.text}
        </div>
        <div
          style={{
            fontFamily: "'DINPro','Inter',sans-serif",
            fontSize:   '12px',
            color:      '#9CA3AF',
            marginTop:  '2px',
          }}
        >
          {new Date(record.expiryDate).toLocaleDateString('en-AE', {
            day: '2-digit', month: 'short', year: 'numeric',
          })}
        </div>
      </div>

      {/* Chevron */}
      {onClick && (
        <i
          className="ti ti-chevron-right"
          aria-hidden="true"
          style={{ fontSize: '14px', color: '#D1D5DB', flexShrink: 0 }}
        />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VisaCrewTable({
  variant,
  title,
  records,
  defaultRows = 5,
  onRowClick,
  onAddVisa,
}: VisaCrewTableProps) {
  const [expanded, setExpanded] = useState(false);

  const accent    = sectionAccent(variant);
  const iconClass = sectionIconClass(variant);
  const isLoading = records === null;
  const count     = records?.length ?? 0;
  const visible   = isLoading
    ? 5
    : expanded
      ? count
      : Math.min(defaultRows, count);

  return (
    <>
      <style>{`
        @keyframes polarisSkeleton {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (min-width: 768px) {
          .polaris-visa-col-md { display: block !important; }
        }
      `}</style>

      <section
        aria-label={title}
        style={{
          background:   '#FFFFFF',
          borderRadius: '12px',
          border:       '1px solid #E5E7EB',
          overflow:     'hidden',
        }}
      >
        {/* Section header */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '14px 16px',
            borderBottom:   '1px solid #F3F4F6',
            background:     '#FAFAFA',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i
              className={`ti ${iconClass}`}
              aria-hidden="true"
              style={{ fontSize: '16px', color: accent }}
            />
            <span
              style={{
                fontFamily: "'Halis GR','Inter',sans-serif",
                fontSize:   '15px',
                fontWeight: '500',
                color:      '#07435E',
              }}
            >
              {title}
            </span>
          </div>

          {/* Count badge */}
          {!isLoading && (
            <span
              aria-label={`${count} records`}
              style={{
                fontFamily:  "'DINPro','Inter',sans-serif",
                fontSize:    '12px',
                fontWeight:  '500',
                padding:     '3px 10px',
                borderRadius:'20px',
                background:  count === 0 ? '#F3F4F6' : `${accent}18`,
                color:       count === 0 ? '#9CA3AF' : accent,
                border:      `1px solid ${count === 0 ? '#E5E7EB' : `${accent}40`}`,
              }}
            >
              {count} {count === 1 ? 'record' : 'records'}
            </span>
          )}
        </div>

        {/* Body */}
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : count === 0 ? (
          // ── Empty state ──────────────────────────────────────────────────
          <div
            style={{
              padding:    '40px 16px',
              textAlign:  'center',
            }}
          >
            <i
              className="ti ti-circle-check"
              aria-hidden="true"
              style={{ fontSize: '32px', color: '#22C55E', marginBottom: '10px' }}
            />
            <div
              style={{
                fontFamily: "'DINPro','Inter',sans-serif",
                fontSize:   '15px',
                fontWeight: '500',
                color:      '#374151',
                marginBottom: '6px',
              }}
            >
              {variant === 'expired'  ? 'No expired visas' :
               variant === 'expiring' ? 'No visas expiring soon' :
               'All visas active'}
            </div>
            <div
              style={{
                fontFamily: "'DINPro','Inter',sans-serif",
                fontSize:   '13px',
                color:      '#9CA3AF',
                marginBottom: onAddVisa ? '16px' : '0',
              }}
            >
              {variant === 'active'
                ? 'Crew visa records will appear here once applications are added.'
                : 'Check back after the next expiry flag run (daily, 07:00 UAE).'}
            </div>
            {onAddVisa && variant === 'active' && (
              <button
                onClick={onAddVisa}
                style={{
                  fontFamily:   "'DINPro','Inter',sans-serif",
                  fontSize:     '14px',
                  fontWeight:   '500',
                  padding:      '8px 18px',
                  borderRadius: '8px',
                  border:       'none',
                  background:   '#4590BA',
                  color:        '#FFFFFF',
                  cursor:       'pointer',
                }}
              >
                <i className="ti ti-plus" aria-hidden="true" style={{ marginRight: '6px' }} />
                Add visa application
              </button>
            )}
          </div>
        ) : (
          // ── Crew rows ────────────────────────────────────────────────────
          <>
            {records!.slice(0, visible).map((record, i) => (
              <CrewRow
                key={record.id}
                record={record}
                onClick={onRowClick}
                isLast={i === visible - 1 && (expanded || count <= defaultRows)}
              />
            ))}

            {/* Expand / collapse */}
            {count > defaultRows && (
              <button
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            '6px',
                  width:          '100%',
                  padding:        '12px',
                  border:         'none',
                  borderTop:      '1px solid #F3F4F6',
                  background:     '#FAFAFA',
                  fontFamily:     "'DINPro','Inter',sans-serif",
                  fontSize:       '13px',
                  fontWeight:     '500',
                  color:          '#4590BA',
                  cursor:         'pointer',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget).style.background = 'rgba(69,144,186,0.06)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget).style.background = '#FAFAFA';
                }}
              >
                <i
                  className={`ti ${expanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                  aria-hidden="true"
                />
                {expanded
                  ? 'Show less'
                  : `View all ${count} records`}
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}

export default VisaCrewTable;
