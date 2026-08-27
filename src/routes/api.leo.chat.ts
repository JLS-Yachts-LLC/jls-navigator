/**
 * Leo Chat API — Streaming follow-up conversation
 * POST /api/leo/chat
 *
 * Continues a conversation with Leo after the initial briefing.
 * Maintains full message history for context continuity.
 *
 * Security: ANTHROPIC_API_KEY is a Wrangler secret.
 */

import { createClient } from '@supabase/supabase-js'
import { getAccessLevel, ACCESS_LABELS } from '@/lib/leo-access'
import { assembleLeoContext } from './api.leo.briefing'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const LEO_MODEL     = 'claude-sonnet-4-6'

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Cross-module context awareness: every chat turn gets the same live,
// access-scoped operational data the briefing uses (fleet, permits, tasks,
// crew/visas, finance, agency/port calls) rather than answering purely from
// whatever happens to be in the client-carried conversation history.
// Prompt caching: the request is a prefix match, so the STABLE persona/rules
// come first (cached across every user and conversation) and the volatile
// per-user live context comes last, behind its own breakpoint. The context
// timestamp is rounded to the hour — a per-second timestamp silently
// invalidated the whole prefix on every single turn.
const CHAT_PERSONA = `You are Leo — the active intelligence engine inside Polaris, the JLS Yachts management platform.

You are the in-app assistant. The user identified in the LIVE CONTEXT block is asking you questions while working inside Polaris.

SCOPE — stay within the platform:
Only answer questions relevant to Polaris and yacht operations: the fleet/vessels, crew,
visas & immigration, permits, seaport sign-on/off, provisioning, logistics, finance/invoicing,
training, and how to use the platform's modules and screens.
If asked something outside this scope (general knowledge, coding, world facts, personal advice),
politely decline in one sentence and steer back to what you can help with inside Polaris.

Respond directly and operationally. Answer from the live context above wherever it's relevant —
name real vessels, figures, and dates from it rather than speaking generically.
If the answer isn't in the context, say so plainly — never fabricate operational details.
Stay in character: confident, direct, no filler phrases.
Keep responses concise — 2-4 sentences unless more detail is clearly needed.
Use plain text only, no markdown headers, no bullet lists.`

const CHAT_LIVE = (userName: string, accessLabel: string, context: any) => {
  const hourStamp = new Date(Math.floor(Date.now() / 36e5) * 36e5).toUTCString()
  return `USER: ${userName} (${accessLabel})

LIVE CONTEXT (updated ${hourStamp}, scoped to what this user can access):
${JSON.stringify(context, null, 2)}`
}

// ── Handler (called directly from worker-entry.ts) ───────────────────────────
export async function leoChatHandler(request: Request): Promise<Response> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }

    let token: string
    let messages: { role: string; content: string }[] = []
    let userName = 'there'

    try {
      const body = await request.json()
      token    = body.token
      messages = body.messages ?? []
      userName = body.userName ?? 'there'
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate session
    let userEmail = ''
    let userId    = ''
    try {
      const admin = getAdmin()
      const { data: { user }, error } = await admin.auth.getUser(token)
      if (error || !user) throw new Error('Unauthorized')
      userEmail = user.email ?? ''
      userId    = user.id
    } catch {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const accessLabel = ACCESS_LABELS[getAccessLevel(userEmail)]

    let context: any
    try {
      context = await assembleLeoContext(userId, userEmail)
    } catch (e) {
      console.error('Leo chat context assembly failed:', e)
      context = { error: 'Context assembly failed' }
    }

    // Two cache breakpoints: the persona block hits for every user; the context
    // block hits again on follow-up turns while the underlying data is unchanged.
    const systemPrompt = [
      { type: 'text', text: CHAT_PERSONA, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: CHAT_LIVE(userName, accessLabel, context), cache_control: { type: 'ephemeral' } },
    ]

    // Validate messages format — only 'user' and 'assistant' roles
    const safeMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .filter(m => typeof m.content === 'string' && m.content.trim().length > 0)
      .slice(-20)

    if (safeMessages.length === 0 || safeMessages[safeMessages.length - 1].role !== 'user') {
      return new Response(JSON.stringify({ error: 'Last message must be from user' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let anthropicRes: Response
    try {
      anthropicRes = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      LEO_MODEL,
          max_tokens: 800,
          stream:     true,
          system:     systemPrompt,
          messages:   safeMessages,
        }),
      })
    } catch (e: any) {
      return new Response(
        JSON.stringify({ error: `Failed to reach Anthropic: ${e?.message ?? 'network error'}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      return new Response(
        JSON.stringify({ error: `Anthropic error ${anthropicRes.status}: ${err}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const reader  = anthropicRes.body!.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let buf = ''
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const json = line.slice(6).trim()
              if (json === '[DONE]') continue
              try {
                const evt = JSON.parse(json)
                if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                  controller.enqueue(encoder.encode(evt.delta.text))
                }
              } catch { /* skip malformed */ }
            }
          }
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type':      'text/plain; charset=utf-8',
        'Cache-Control':     'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
}
