'use client'

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ShieldCheck, PackageSearch, UserSearch, FileCheck2, AlertTriangle, ArrowRight, X } from 'lucide-react'
import { COLORS } from '@/lib/tokens'
import { LeoIcon } from './LeoIcon'
import type { LeoBehaviorState } from './leo.types'

interface Message {
  role:      'user' | 'assistant'
  content:   string
  streaming?: boolean
  severity?: 'info' | 'warn' | 'critical'
  actionUrl?: string | null
  module?:    string | null
}

interface LeoChatProps {
  token:       string
  userName:    string
  /** Initial assistant message. Optional — when omitted (floating chat), Leo
   *  opens with a short greeting instead of a full briefing. */
  briefingText?: string
  /** Shows a close (×) button in the header when the widget is collapsible. */
  onClose?: () => void
}

const DEFAULT_GREETING =
  "Hi, I'm Leo. Ask me anything about your fleet, crew, visas, permits, or day-to-day operations — I'll answer from what's in Polaris."

const MODULE_LABEL: Record<string, string> = {
  crew_immigration: 'Crew Immigration',
  permits:          'Permits',
  finance:          'Finance',
  agency:           'Port Calls',
  orbit:            'Tasks',
}

interface QuickAction {
  label: string
  sub:   string
  icon:  typeof ShieldCheck
  to:    string
  search?: Record<string, unknown>
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Check Crew Visas', sub: 'Verify visa status',  icon: ShieldCheck,   to: '/crew-immigration/visas' },
  { label: 'Track Shipment',   sub: 'Search shipments',    icon: PackageSearch, to: '/shipsync' },
  { label: 'Find Driver',      sub: 'Search drivers',      icon: UserSearch,    to: '/shipsync', search: { tab: 'drivers' } },
  { label: 'Check Permits',    sub: 'Permits & docs',      icon: FileCheck2,    to: '/permits/command-centre' },
]

function greetingPhrase(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function LeoChat({ token, userName, briefingText, onClose }: LeoChatProps) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: briefingText ?? DEFAULT_GREETING },
  ])
  const [input,     setInput]     = useState('')
  const [streaming, setStreaming] = useState(false)
  const [leoState,  setLeoState]  = useState<LeoBehaviorState>('waiting')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages])

  // Floating chat (no briefingText — the user hasn't just read a briefing):
  // swap the static greeting for a live, non-repeating operational signal
  // once it loads. Falls back to the static greeting on any failure, and
  // never touches the message once the user has started typing/chatting.
  useEffect(() => {
    if (briefingText || !token) return
    let cancelled = false
    fetch('/api/leo/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.message) return
        setMessages((prev) =>
          prev.length === 1 && prev[0].role === 'assistant' && !prev[0].streaming
            ? [{ role: 'assistant', content: data.message, severity: data.severity, actionUrl: data.action_url, module: data.module }]
            : prev
        )
      })
      .catch(() => { /* keep the static greeting */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function send() {
    const userText = input.trim()
    if (!userText || streaming) return

    setInput('')
    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: userText },
      { role: 'assistant', content: '', streaming: true },
    ]
    setMessages(newMessages)
    setStreaming(true)
    setLeoState('thinking')

    try {
      // Build message list for Anthropic (exclude the empty streaming placeholder)
      const apiMessages = newMessages
        .filter(m => !m.streaming)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/leo/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, userName, messages: apiMessages }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error ?? 'Leo is unavailable')
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let   reply   = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply += decoder.decode(value, { stream: true })
        setLeoState('speaking')
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: reply, streaming: true }
          return next
        })
      }

      // Mark streaming complete
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: reply }
        return next
      })
      setLeoState('waiting')

    } catch (e: unknown) {
      const errText = e instanceof Error ? e.message : 'Leo is unavailable'
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: `[${errText}]` }
        return next
      })
      setLeoState('confused')
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        background:    COLORS.abyss,
        border:        `1px solid ${COLORS.deep}`,
        borderRadius:  8,
        overflow:      'hidden',
        height:        '100%',
        minHeight:     300,
      }}
    >
      {/* Header */}
      <div
        style={{
          background:   COLORS.void,
          borderBottom: `1px solid ${COLORS.deep}`,
          padding:      '6px 14px',
          display:      'flex',
          alignItems:   'center',
          gap:          10,
        }}
      >
        {/* Leo avatar — a soft pulse while thinking/speaking, still otherwise */}
        <div
          style={{
            flexShrink: 0, width: 40, height: 40, borderRadius: '50%',
            background: `radial-gradient(circle at 32% 28%, #C9A8F0, ${COLORS.leoViolet} 65%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, border: `1px solid ${COLORS.deep}`,
            animation: leoState === 'thinking' || leoState === 'speaking' ? 'pulse 1.2s ease-in-out infinite' : 'none',
          }}
        >
          🦁
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontFamily:    "'Space Grotesk', sans-serif",
                fontSize:      14,
                fontWeight:    700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                color:         COLORS.leoViolet,
              }}
            >
              Leo
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.success, display: 'inline-block' }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.steel }}>Online</span>
            </span>
          </div>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize:   12,
              color:      COLORS.steel,
              whiteSpace: 'nowrap',
              overflow:   'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Fleet Operations AI
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
              color: COLORS.steel, display: 'flex', alignItems: 'center', padding: 4,
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Messages — before the first reply, show the richer welcome view;
          once a conversation has started, switch to the plain thread. */}
      <div
        style={{
          flex:       1,
          overflowY:  'auto',
          padding:    messages.length === 1 && !briefingText ? '18px 16px' : '12px 0',
        }}
      >
        {messages.length === 1 && !briefingText ? (
          <WelcomeView userName={userName} signal={messages[0]} navigate={navigate} />
        ) : (
          messages.map((msg, i) => <ChatMessage key={i} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop:  `1px solid ${COLORS.deep}`,
          padding:    '10px 14px',
          display:    'flex',
          gap:        8,
          alignItems: 'flex-end',
          background: COLORS.void,
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask Leo about the fleet, a permit, a crew issue…"
          rows={1}
          disabled={streaming}
          style={{
            flex:         1,
            background:   COLORS.deep,
            border:       `1px solid ${COLORS.deep}`,
            borderRadius: 6,
            padding:      '8px 12px',
            fontFamily:   "'Inter', sans-serif",
            fontSize:     16,
            color:        COLORS.frost,
            resize:       'none',
            outline:      'none',
            lineHeight:   1.5,
            minHeight:    36,
            maxHeight:    120,
          }}
          onInput={e => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = `rgba(0,196,204,0.40)`
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = COLORS.deep
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || streaming}
          style={{
            background:   input.trim() && !streaming ? COLORS.signal : COLORS.deep,
            border:       'none',
            borderRadius: 6,
            width:        36,
            height:       36,
            cursor:       input.trim() && !streaming ? 'pointer' : 'not-allowed',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            flexShrink:   0,
            transition:   'background 150ms ease',
          }}
          aria-label="Send"
        >
          <SendIcon active={!!(input.trim() && !streaming)} />
        </button>
      </div>
    </div>
  )
}

// ── Welcome view (shown before the first reply) ────────────────────────────

function WelcomeView({
  userName, signal, navigate,
}: {
  userName: string
  signal: Message
  navigate: (opts: { to: string; search?: Record<string, unknown> }) => void
}) {
  const initials = (userName || 'U').slice(0, 2).toUpperCase()
  const isAlert = signal.severity === 'critical' || signal.severity === 'warn'
  const accentColor = signal.severity === 'critical' ? COLORS.error : COLORS.warn

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 700, color: COLORS.frost, margin: 0 }}>
          {greetingPhrase()}, {initials} 👋
        </p>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: COLORS.steel, margin: '4px 0 0' }}>
          Here's what I found in your operations.
        </p>
      </div>

      {isAlert ? (
        <div
          style={{
            border: `1px solid ${accentColor}40`, background: `${accentColor}14`,
            borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} color={accentColor} style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.frost, flex: 1 }}>
              {signal.module ? MODULE_LABEL[signal.module] ?? 'Alert' : 'Alert'}
            </span>
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: accentColor,
                border: `1px solid ${accentColor}60`, borderRadius: 4, padding: '2px 6px', flexShrink: 0,
              }}
            >
              {signal.severity}
            </span>
          </div>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: COLORS.steel, margin: 0, lineHeight: 1.55 }}>
            {signal.content}
          </p>
          {signal.actionUrl && (
            <button
              onClick={() => navigate({ to: signal.actionUrl! })}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, alignSelf: 'flex-start',
                fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 600, color: COLORS.signal,
              }}
            >
              View details <ArrowRight size={12} />
            </button>
          )}
        </div>
      ) : (
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: COLORS.steel, margin: 0, lineHeight: 1.65 }}>
          {signal.content}
        </p>
      )}

      <div>
        <div
          style={{
            fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: COLORS.steel, marginBottom: 8,
          }}
        >
          Quick actions
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {QUICK_ACTIONS.map(({ label, sub, icon: ActionIcon, to, search }) => (
            <button
              key={label}
              onClick={() => navigate({ to, search })}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                background: COLORS.void, border: `1px solid ${COLORS.deep}`, borderRadius: 8,
                padding: '10px 10px', cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${COLORS.signal}60` }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.deep }}
            >
              <ActionIcon size={16} color={COLORS.signal} style={{ flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 600, color: COLORS.frost }}>
                  {label}
                </span>
                <span style={{ display: 'block', fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.steel }}>
                  {sub}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Message component ──────────────────────────────────────────────────────

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  // Critical/warn signals (e.g. compliance alerts) need to visibly stand out
  // from routine tips — but as a restrained accent, not a full alarm banner.
  const accentColor =
    message.severity === 'critical' ? COLORS.error :
    message.severity === 'warn'     ? COLORS.warn  :
    undefined

  return (
    <div
      style={{
        display:     'flex',
        gap:         10,
        padding:     accentColor ? '8px 16px 8px 13px' : '8px 16px',
        alignItems:  'flex-start',
        borderLeft:  accentColor ? `3px solid ${accentColor}` : undefined,
        background:  accentColor ? `${accentColor}14` : undefined,
      }}
    >
      {/* Avatar */}
      {isUser ? (
        <div
          style={{
            width:        24,
            height:       24,
            borderRadius: '50%',
            background:   COLORS.ocean,
            border:       `1px solid ${COLORS.deep}`,
            flexShrink:   0,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            fontFamily:   "'Space Grotesk', sans-serif",
            fontSize:     10,
            fontWeight:   700,
            color:        COLORS.frost,
            marginTop:    1,
          }}
        >
          U
        </div>
      ) : (
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          <LeoIcon size={22} variant="leo" />
        </div>
      )}

      {/* Content */}
      <p
        style={{
          fontFamily: isUser ? "'Space Grotesk', sans-serif" : "'Inter', sans-serif",
          fontSize:   16,
          color:      isUser || accentColor ? COLORS.frost : COLORS.steel,
          lineHeight: isUser ? 1.55 : 1.78,
          margin:     0,
          whiteSpace: 'pre-wrap',
          flex:       1,
          paddingTop: 2,
        }}
      >
        {message.content}
        {message.streaming && (
          <span
            style={{
              display:       'inline-block',
              width:         2,
              height:        12,
              background:    COLORS.leoViolet,
              marginLeft:    2,
              verticalAlign: 'middle',
              animation:     'blink 0.75s step-end infinite',
            }}
          />
        )}
      </p>
    </div>
  )
}

function SendIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M14 8L2 2l2.5 6L2 14l12-6z"
        fill={active ? COLORS.void : COLORS.steel}
        strokeLinejoin="round"
      />
    </svg>
  )
}
