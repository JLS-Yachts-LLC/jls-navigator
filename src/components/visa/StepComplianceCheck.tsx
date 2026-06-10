import React, { useEffect, useState } from 'react'
import { COLORS } from '@/lib/tokens'
import { runComplianceChecks, hasBlockingIssues, type ComplianceResult } from '@/lib/visa/complianceChecks'
import type { CrewMember, CrewPassport } from '@/lib/visa/crewMatching'
import type { CountryVisaConfig } from '@/lib/visa/countryConfig'

interface WizardState {
  step: number
  countryCode: string
  crew: CrewMember | null
  isNewCrew: boolean
  passport: CrewPassport | null
  passports: CrewPassport[]
  countryFields: Record<string, string>
  uploadedDocs: Record<string, string>
  complianceResults: ComplianceResult[]
  complianceAcknowledged: boolean
}

interface Props {
  state: WizardState
  onUpdate: (partial: Partial<WizardState>) => void
  onNext: () => void
  onBack: () => void
}

export default function StepComplianceCheck({ state, onUpdate, onNext, onBack }: Props) {
  const [results, setResults] = useState<ComplianceResult[]>(state.complianceResults ?? [])
  const [loading, setLoading] = useState(false)
  const [acknowledged, setAcknowledged] = useState<Record<number, boolean>>({})

  useEffect(() => {
    if (!state.passport) return
    setLoading(true)
    try {
      const r = runComplianceChecks(state.passport, state.countryCode)
      setResults(r)
      onUpdate({ complianceResults: r })
    } finally {
      setLoading(false)
    }
  }, [state.passport?.id, state.countryCode])

  const blocking = results.filter(r => r.blocks)
  const warnings = results.filter(r => !r.blocks)
  const allWarningsAcknowledged = warnings.length === 0 || warnings.every((_, i) => acknowledged[i])
  const canContinue = !loading && blocking.length === 0 && allWarningsAcknowledged

  function handleAcknowledge(index: number, checked: boolean) {
    const next = { ...acknowledged, [index]: checked }
    setAcknowledged(next)
    const allAck = warnings.every((_, i) => next[i])
    if (allAck) onUpdate({ complianceAcknowledged: true })
  }

  return (
    <div
      style={{
        fontFamily: 'Space Grotesk, sans-serif',
        color: COLORS.frost,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: COLORS.frost, margin: 0 }}>
          Compliance Check
        </h2>
        <p style={{ marginTop: 6, color: COLORS.muted, fontSize: 14 }}>
          Reviewing requirements before submission.
        </p>
      </div>

      {loading && (
        <div
          style={{
            backgroundColor: COLORS.abyss,
            border: `1px solid ${COLORS.deep}`,
            borderRadius: 8,
            padding: '20px 24px',
            color: COLORS.muted,
            fontSize: 14,
          }}
        >
          Running compliance checks…
        </div>
      )}

      {!loading && results.length === 0 && (
        <div
          style={{
            backgroundColor: '#0D2018',
            border: '1px solid #1A5030',
            borderRadius: 8,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <CheckCircleIcon color="#22C55E" />
          <span style={{ color: '#22C55E', fontWeight: 600, fontSize: 15 }}>
            All compliance checks passed
          </span>
        </div>
      )}

      {!loading && blocking.length > 0 && (
        <div
          style={{
            backgroundColor: '#1A0A08',
            border: `1px solid ${COLORS.warn}`,
            borderRadius: 8,
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <XCircleIcon color={COLORS.warn} />
            <span style={{ color: COLORS.warn, fontWeight: 700, fontSize: 15 }}>
              Blocking Issues
            </span>
          </div>
          <p style={{ color: COLORS.muted, fontSize: 13, margin: 0 }}>
            The following issues must be resolved before this application can be submitted.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {blocking.map((r, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  backgroundColor: '#220E0A',
                  borderRadius: 6,
                  padding: '10px 14px',
                }}
              >
                <XCircleIcon color={COLORS.warn} size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ color: COLORS.frost, fontSize: 14, lineHeight: '1.5' }}>{r.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && warnings.length > 0 && (
        <div
          style={{
            backgroundColor: '#1A1205',
            border: `1px solid ${COLORS.leoAmber}`,
            borderRadius: 8,
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <WarningIcon color={COLORS.leoAmber} />
            <span style={{ color: COLORS.leoAmber, fontWeight: 700, fontSize: 15 }}>
              Warnings
            </span>
          </div>
          <p style={{ color: COLORS.muted, fontSize: 13, margin: 0 }}>
            Please review and acknowledge each of the following before proceeding.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {warnings.map((r, i) => (
              <li
                key={i}
                style={{
                  backgroundColor: '#1F1608',
                  borderRadius: 6,
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <WarningIcon color={COLORS.leoAmber} size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ color: COLORS.frost, fontSize: 14, lineHeight: '1.5' }}>{r.message}</span>
                </div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    paddingLeft: 26,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!acknowledged[i]}
                    onChange={e => handleAcknowledge(i, e.target.checked)}
                    style={{
                      accentColor: COLORS.leoAmber,
                      width: 16,
                      height: 16,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: COLORS.muted, fontSize: 13 }}>
                    I acknowledge this warning and confirm I understand the requirement.
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', paddingTop: 8 }}>
        <button
          onClick={onBack}
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            backgroundColor: 'transparent',
            border: `1px solid ${COLORS.deep}`,
            borderRadius: 8,
            color: COLORS.muted,
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Back
        </button>
        <button
          onClick={canContinue ? onNext : undefined}
          disabled={!canContinue}
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            backgroundColor: canContinue ? COLORS.signal : COLORS.ocean,
            border: 'none',
            borderRadius: 8,
            color: canContinue ? COLORS.void : COLORS.muted,
            padding: '10px 32px',
            fontSize: 14,
            fontWeight: 700,
            cursor: canContinue ? 'pointer' : 'not-allowed',
            opacity: canContinue ? 1 : 0.6,
            transition: 'background-color 0.15s, color 0.15s',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

// ── Inline SVG icon helpers ───────────────────────────────────────────────────

function XCircleIcon({ color, size = 18, style }: { color: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

function CheckCircleIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

function WarningIcon({ color, size = 18, style }: { color: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
