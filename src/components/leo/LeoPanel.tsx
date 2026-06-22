'use client'

import { useEffect, useRef, useState } from 'react'
import { COLORS } from '@/lib/tokens'
import { LeoIcon } from './LeoIcon'
import { getStoredWorkspace } from '@/lib/auth/workspace'

type LeoStatus = 'idle' | 'loading' | 'streaming' | 'ready' | 'error'

type Insights = {
  lean:  string
  ops:   string
  alert: string
}

interface LeoPanelProps {
  token:    string
  userName: string
  /** Called when briefing is complete — allows parent to enable chat */
  onReady?: (briefingText: string) => void
}

export function LeoPanel({ token, userName, onReady }: LeoPanelProps) {
  const [status,   setStatus]   = useState<LeoStatus>('idle')
  const [text,     setText]     = useState('')
  const [insights, setInsights] = useState<Insights | null>(null)
  const [error,    setError]    = useState('')
  const bufRef = useRef('')
  const didFetch = useRef(false)

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true
    streamBriefing()
  }, [])

  async function streamBriefing() {
    setStatus('loading')
    bufRef.current = ''
    setText('')
    setInsights(null)
    setError('')

    try {
      const res = await fetch('/api/leo/briefing', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, userName, workspace: getStoredWorkspace() }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errBody.error ?? `HTTP ${res.status}`)
      }

      setStatus('streaming')
      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bufRef.current += decoder.decode(value, { stream: true })

        // Hide the <insights> block from the prose text
        const insightStart = bufRef.current.indexOf('<insights>')
        const visibleText  = insightStart === -1
          ? bufRef.current
          : bufRef.current.slice(0, insightStart)
        setText(visibleText.trimStart())

        // Parse insights when closing tag arrives
        const insightEnd = bufRef.current.indexOf('</insights>')
        if (insightStart !== -1 && insightEnd !== -1 && !insights) {
          const json = bufRef.current.slice(insightStart + 10, insightEnd).trim()
          try {
            const parsed = JSON.parse(json)
            setInsights(parsed)
          } catch { /* retry on next chunk */ }
        }
      }

      setStatus('ready')
      onReady?.(bufRef.current.split('<insights>')[0].trim())

    } catch (e: unknown) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Leo is unavailable')
    }
  }

  return (
    <div
      style={{
        background: COLORS.abyss,
        border:     `1px solid ${COLORS.deep}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div
        style={{
          background:   COLORS.void,
          borderBottom: `1px solid ${COLORS.deep}`,
          padding:      '10px 16px',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LeoIcon size={22} variant="leo" />
          <div>
            <span
              style={{
                fontFamily:    "'Space Grotesk', sans-serif",
                fontSize:      13,
                fontWeight:    700,
                color:         COLORS.leoAmber,
                letterSpacing: '0.14em',
              }}
            >
              LEO
            </span>
            <span
              style={{
                fontFamily:    "'Space Grotesk', sans-serif",
                fontSize:      10,
                color:         COLORS.steel,
                letterSpacing: '0.08em',
                marginLeft:    8,
              }}
            >
              Active Intelligence · Polaris
            </span>
          </div>
        </div>

        {/* Status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width:        6,
              height:       6,
              borderRadius: '50%',
              background:   status === 'error'
                ? COLORS.warn
                : status === 'ready'
                  ? COLORS.signal
                  : COLORS.leoAmber,
              display:    'inline-block',
              animation:  status === 'streaming' || status === 'loading'
                ? 'pulse 1.2s ease-in-out infinite'
                : 'none',
            }}
          />
          <span
            style={{
              fontFamily:    "'Space Grotesk', sans-serif",
              fontSize:      10,
              color:         COLORS.steel,
              letterSpacing: '0.06em',
            }}
          >
            {status === 'idle'      && 'Standby'}
            {status === 'loading'   && 'Connecting…'}
            {status === 'streaming' && 'Generating briefing…'}
            {status === 'ready'     && 'Briefing ready'}
            {status === 'error'     && 'Unavailable'}
          </span>
        </div>
      </div>

      {/* ── Briefing text ────────────────────────────────────────── */}
      <div style={{ padding: '16px 18px 12px' }}>
        {status === 'error' ? (
          <div
            style={{
              padding:      '12px 14px',
              borderRadius: 6,
              background:   `rgba(232,112,32,0.08)`,
              border:       `1px solid rgba(232,112,32,0.25)`,
            }}
          >
            <p
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize:   12,
                color:      COLORS.warn,
                margin:     0,
              }}
            >
              {error}
            </p>
            <button
              onClick={() => { didFetch.current = false; streamBriefing() }}
              style={{
                marginTop:    8,
                fontFamily:   "'Space Grotesk', sans-serif",
                fontSize:     11,
                fontWeight:   600,
                color:        COLORS.signal,
                background:   'none',
                border:       'none',
                cursor:       'pointer',
                padding:      0,
                letterSpacing:'0.06em',
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <p
              style={{
                fontFamily:  "'Inter', sans-serif",
                fontSize:    16,
                color:       COLORS.frost,
                lineHeight:  1.78,
                margin:      0,
                whiteSpace:  'pre-wrap',
                minHeight:   status === 'loading' ? 80 : undefined,
              }}
            >
              {status === 'loading' ? (
                <LoadingShimmer />
              ) : (
                <>
                  {text}
                  {status === 'streaming' && <BlinkCursor />}
                </>
              )}
            </p>

            {/* ── Insight cards ─────────────────────────────────── */}
            {insights && (
              <div
                style={{
                  display:             'grid',
                  // #121 — wrap to 1–2 columns under ~768px, 3 across on desktop.
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap:                 10,
                  marginTop:           16,
                }}
              >
                <InsightCard
                  label="Lean Signal"
                  text={insights.lean}
                  color={COLORS.leoAmber}
                />
                <InsightCard
                  label="Ops Health"
                  text={insights.ops}
                  color={COLORS.signal}
                />
                <InsightCard
                  label="Attention"
                  text={insights.alert}
                  color={COLORS.warn}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function InsightCard({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div
      style={{
        background:   COLORS.void,
        border:       `1px solid ${COLORS.deep}`,
        borderRadius: 5,
        padding:      '10px 12px',
      }}
    >
      <div
        style={{
          fontFamily:    "'Space Grotesk', sans-serif",
          fontSize:      14,
          fontWeight:    700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          color,
          marginBottom:  6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize:   14,
          color:      '#C8D8E8',
          lineHeight: 1.6,
        }}
      >
        {text}
      </div>
    </div>
  )
}

function BlinkCursor() {
  return (
    <span
      style={{
        display:        'inline-block',
        width:          2,
        height:         13,
        background:     COLORS.leoAmber,
        marginLeft:     2,
        verticalAlign:  'middle',
        animation:      'blink 0.75s step-end infinite',
      }}
    />
  )
}

function LoadingShimmer() {
  return (
    <span
      style={{
        display:     'flex',
        gap:         6,
        alignItems:  'center',
        paddingTop:  4,
      }}
    >
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width:        6,
            height:       6,
            borderRadius: '50%',
            background:   COLORS.leoAmber,
            opacity:      0.7,
            animation:    `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  )
}
