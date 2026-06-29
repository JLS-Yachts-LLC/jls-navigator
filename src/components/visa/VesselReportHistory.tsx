/**
 * VesselReportHistory
 *
 * Historical report list for the Vessel Visa Report screen (migration 051).
 * Replaces the old list that used old design tokens throughout.
 *
 * Design rules:
 *  - Each report entry is a card row — timestamp, vessel name, sent-by, channel, status chip.
 *  - Status chip: Sent (green), Failed (red), Pending (amber), Draft (neutral).
 *  - "View snapshot" opens the read-only historical record (snapshot_data is write-once).
 *  - Generate and Send are separate — this component only shows history, never triggers send.
 *  - Empty state explains that history appears after the first report is sent.
 *  - Skeleton loaders for initial fetch.
 *  - Pagination: 10 per page with Prev/Next (no infinite scroll).
 *
 * ARCHITECTURE NOTE:
 *  snapshot_data in visa_report_log is write-once — never mutate once written.
 *  This component reads from visa_report_log only. Never writes.
 */

import React, { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportSendStatus = 'sent' | 'failed' | 'pending' | 'draft';
export type ReportChannel    = 'email' | 'whatsapp' | 'both';

export interface ReportHistoryRecord {
  id:            string;
  generatedAt:   string;           // ISO 8601
  sentAt?:       string;           // ISO 8601 — null if draft/pending
  vesselName:    string;
  sentBy?:       string;           // User display name
  channel?:      ReportChannel;
  recipientEmail?: string;
  status:        ReportSendStatus;
  crewCount:     number;
  expiredCount:  number;
  expiringCount: number;
}

export interface VesselReportHistoryProps {
  records:        ReportHistoryRecord[] | null;   // null = loading
  onViewSnapshot: (record: ReportHistoryRecord) => void;
  pageSize?:      number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AE', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AE', {
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days} days ago`;
  return formatDate(iso);
}

const STATUS_TOKENS: Record<
  ReportSendStatus,
  { label: string; bg: string; color: string; border: string; icon: string }
> = {
  sent: {
    label:  'Sent',
    bg:     'rgba(34,197,94,0.08)',
    color:  '#16A34A',
    border: 'rgba(34,197,94,0.30)',
    icon:   'ti-circle-check',
  },
  failed: {
    label:  'Failed',
    bg:     'rgba(239,68,68,0.08)',
    color:  '#DC2626',
    border: 'rgba(239,68,68,0.30)',
    icon:   'ti-alert-circle',
  },
  pending: {
    label:  'Pending',
    bg:     'rgba(245,158,11,0.08)',
    color:  '#D97706',
    border: 'rgba(245,158,11,0.30)',
    icon:   'ti-clock',
  },
  draft: {
    label:  'Draft',
    bg:     'rgba(107,114,128,0.08)',
    color:  '#6B7280',
    border: 'rgba(107,114,128,0.25)',
    icon:   'ti-file',
  },
};

const CHANNEL_ICON: Record<ReportChannel, string> = {
  email:    'ti-mail',
  whatsapp: 'ti-brand-whatsapp',
  both:     'ti-layout-grid',
};

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({ isLast }: { isLast: boolean }) {
  const bar = (w: number, h = 13) => (
    <div
      style={{
        height:         `${h}px`,
        width:          `${w}px`,
        borderRadius:   '4px',
        background:     'linear-gradient(90deg,#F3F4F6 25%,#E5E7EB 50%,#F3F4F6 75%)',
        backgroundSize: '200% 100%',
        animation:      'polarisSkeleton 1.4s ease-in-out infinite',
      }}
    />
  );
  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '14px',
        padding:      '14px 16px',
        borderBottom: isLast ? 'none' : '1px solid #F3F4F6',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {bar(180)} {bar(120)}
      </div>
      {bar(60, 24)}
      {bar(64)}
    </div>
  );
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: ReportSendStatus }) {
  const t = STATUS_TOKENS[status];
  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          '4px',
        fontFamily:   "'DINPro','Inter',sans-serif",
        fontSize:     '12px',
        fontWeight:   '500',
        padding:      '3px 10px',
        borderRadius: '20px',
        background:   t.bg,
        color:        t.color,
        border:       `1px solid ${t.border}`,
        whiteSpace:   'nowrap',
      }}
    >
      <i className={`ti ${t.icon}`} aria-hidden="true" style={{ fontSize: '11px' }} />
      {t.label}
    </span>
  );
}

// ─── Report row ───────────────────────────────────────────────────────────────

interface ReportRowProps {
  record:  ReportHistoryRecord;
  onView:  (r: ReportHistoryRecord) => void;
  isLast:  boolean;
}

function ReportRow({ record, onView, isLast }: ReportRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '14px',
        padding:      '13px 16px',
        borderBottom: isLast ? 'none' : '1px solid #F3F4F6',
        background:   hovered ? 'rgba(7,67,94,0.03)' : 'transparent',
        transition:   'background 0.12s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Date icon block */}
      <div
        aria-hidden="true"
        style={{
          flexShrink:    0,
          width:         '40px',
          height:        '40px',
          borderRadius:  '8px',
          background:    'rgba(7,67,94,0.06)',
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          justifyContent:'center',
          gap:           '1px',
        }}
      >
        <span
          style={{
            fontFamily: "'DINPro','Inter',sans-serif",
            fontSize:   '16px',
            fontWeight: '500',
            color:      '#07435E',
            lineHeight: '1',
          }}
        >
          {new Date(record.generatedAt).getDate().toString().padStart(2, '0')}
        </span>
        <span
          style={{
            fontFamily:    "'DINPro','Inter',sans-serif",
            fontSize:      '10px',
            color:         '#6B7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {new Date(record.generatedAt).toLocaleDateString('en-AE', { month: 'short' })}
        </span>
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '8px',
            marginBottom: '3px',
          }}
        >
          <span
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
            {record.vesselName}
          </span>

          {/* Channel icon */}
          {record.channel && (
            <i
              className={`ti ${CHANNEL_ICON[record.channel]}`}
              aria-label={`Sent via ${record.channel}`}
              style={{ fontSize: '14px', color: '#9CA3AF', flexShrink: 0 }}
            />
          )}
        </div>

        <div
          style={{
            fontFamily: "'DINPro','Inter',sans-serif",
            fontSize:   '13px',
            color:      '#9CA3AF',
          }}
        >
          {record.sentAt
            ? `${relativeDate(record.sentAt)} at ${formatTime(record.sentAt)}`
            : `Generated ${relativeDate(record.generatedAt)}`}
          {record.sentBy && ` · ${record.sentBy}`}
          {' · '}
          {record.crewCount} crew
          {record.expiredCount > 0  && ` · `}
          {record.expiredCount > 0  && (
            <span style={{ color: '#DC2626' }}>{record.expiredCount} expired</span>
          )}
          {record.expiringCount > 0 && ` · `}
          {record.expiringCount > 0 && (
            <span style={{ color: '#D97706' }}>{record.expiringCount} expiring</span>
          )}
        </div>
      </div>

      {/* Status + view */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <StatusChip status={record.status} />

        <button
          onClick={() => onView(record)}
          aria-label={`View snapshot for ${record.vesselName} report from ${formatDate(record.generatedAt)}`}
          style={{
            fontFamily:   "'DINPro','Inter',sans-serif",
            fontSize:     '13px',
            fontWeight:   '500',
            padding:      '6px 12px',
            borderRadius: '8px',
            border:       '1px solid #E5E7EB',
            background:   '#FFFFFF',
            color:        '#4590BA',
            cursor:       'pointer',
            whiteSpace:   'nowrap',
            transition:   'border-color 0.12s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget).style.borderColor = '#4590BA';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget).style.borderColor = '#E5E7EB';
          }}
        >
          View
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VesselReportHistory({
  records,
  onViewSnapshot,
  pageSize = 10,
}: VesselReportHistoryProps) {
  const [page, setPage] = useState(1);

  const isLoading   = records === null;
  const total       = records?.length ?? 0;
  const totalPages  = Math.max(1, Math.ceil(total / pageSize));
  const pageRecords = records?.slice((page - 1) * pageSize, page * pageSize) ?? [];

  return (
    <>
      <style>{`
        @keyframes polarisSkeleton {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <section aria-label="Report history">
        {/* Header */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            marginBottom:   '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i
              className="ti ti-history"
              aria-hidden="true"
              style={{ fontSize: '16px', color: '#4590BA' }}
            />
            <span
              style={{
                fontFamily: "'Halis GR','Inter',sans-serif",
                fontSize:   '16px',
                fontWeight: '500',
                color:      '#07435E',
              }}
            >
              Report history
            </span>
          </div>

          {!isLoading && total > 0 && (
            <span
              style={{
                fontFamily: "'DINPro','Inter',sans-serif",
                fontSize:   '13px',
                color:      '#9CA3AF',
              }}
            >
              {total} {total === 1 ? 'report' : 'reports'}
            </span>
          )}
        </div>

        {/* Card */}
        <div
          style={{
            background:   '#FFFFFF',
            borderRadius: '12px',
            border:       '1px solid #E5E7EB',
            overflow:     'hidden',
          }}
        >
          {isLoading ? (
            <>
              <SkeletonRow isLast={false} />
              <SkeletonRow isLast={false} />
              <SkeletonRow isLast={true} />
            </>
          ) : total === 0 ? (
            // ── Empty state ────────────────────────────────────────────────
            <div style={{ padding: '48px 16px', textAlign: 'center' }}>
              <i
                className="ti ti-history"
                aria-hidden="true"
                style={{ fontSize: '32px', color: '#D1D5DB', marginBottom: '12px' }}
              />
              <div
                style={{
                  fontFamily:   "'DINPro','Inter',sans-serif",
                  fontSize:     '15px',
                  fontWeight:   '500',
                  color:        '#374151',
                  marginBottom: '6px',
                }}
              >
                No reports sent yet
              </div>
              <div
                style={{
                  fontFamily: "'DINPro','Inter',sans-serif",
                  fontSize:   '13px',
                  color:      '#9CA3AF',
                }}
              >
                Generate and send your first vessel visa report to see the history here.
              </div>
            </div>
          ) : (
            // ── Report rows ────────────────────────────────────────────────
            <>
              {pageRecords.map((record, i) => (
                <ReportRow
                  key={record.id}
                  record={record}
                  onView={onViewSnapshot}
                  isLast={i === pageRecords.length - 1}
                />
              ))}
            </>
          )}
        </div>

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              marginTop:      '12px',
              padding:        '0 4px',
            }}
          >
            <span
              style={{
                fontFamily: "'DINPro','Inter',sans-serif",
                fontSize:   '13px',
                color:      '#9CA3AF',
              }}
            >
              Page {page} of {totalPages}
            </span>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '4px',
                  fontFamily:   "'DINPro','Inter',sans-serif",
                  fontSize:     '13px',
                  fontWeight:   '500',
                  padding:      '7px 12px',
                  borderRadius: '8px',
                  border:       '1px solid #E5E7EB',
                  background:   '#FFFFFF',
                  color:        page === 1 ? '#D1D5DB' : '#4590BA',
                  cursor:       page === 1 ? 'default' : 'pointer',
                }}
              >
                <i className="ti ti-arrow-left" aria-hidden="true" />
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Next page"
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '4px',
                  fontFamily:   "'DINPro','Inter',sans-serif",
                  fontSize:     '13px',
                  fontWeight:   '500',
                  padding:      '7px 12px',
                  borderRadius: '8px',
                  border:       '1px solid #E5E7EB',
                  background:   '#FFFFFF',
                  color:        page === totalPages ? '#D1D5DB' : '#4590BA',
                  cursor:       page === totalPages ? 'default' : 'pointer',
                }}
              >
                Next
                <i className="ti ti-arrow-right" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

export default VesselReportHistory;
