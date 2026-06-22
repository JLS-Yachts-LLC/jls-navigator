'use client'

import { useEffect, useRef, useState } from 'react'
import { COLORS } from '@/lib/tokens'
import { LeoIcon } from './LeoIcon'

interface Message {
  role:      'user' | 'assistant'
  content:   string
  streaming?: boolean
}

interface LeoChatProps {
  token:       string
  userName:    string
  /** Initial assistant message — the briefing text */
  briefingText: string
}

export function LeoChat({ token, userName, briefingText }: LeoChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: briefingText },
  ])
  const [input,     setInput]     = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages])

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

    } catch (e: unknown) {
      const errText = e instanceof Error ? e.message : 'Leo is unavailable'
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: `[${errText}]` }
        return next
      })
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
        minHeight:     300,
      }}
    >
      {/* Header */}
      <div
        style={{
          background:   COLORS.void,
          borderBottom: `1px solid ${COLORS.deep}`,
          padding:      '8px 16px',
          display:      'flex',
          alignItems:   'center',
          gap:          8,
        }}
      >
        <div
          style={{
            fontFamily:    "'Space Grotesk', sans-serif",
            fontSize:      14,
            fontWeight:    700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            color:         COLORS.steel,
          }}
        >
          Ask Leo
        </div>
        <div
          style={{
            width:      1,
            height:     10,
            background: COLORS.deep,
          }}
        />
        <div
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize:   14,
            color:      COLORS.steel,
          }}
        >
          Ask anything about the fleet, permits, crew, or operations
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex:       1,
          overflowY:  'auto',
          padding:    '12px 0',
        }}
      >
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
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

// ── Message component ──────────────────────────────────────────────────────

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div
      style={{
        display:     'flex',
        gap:         10,
        padding:     '8px 16px',
        alignItems:  'flex-start',
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
          color:      isUser ? COLORS.frost : '#C8D8E8',
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
              background:    COLORS.leoAmber,
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
