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

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const LEO_MODEL     = 'claude-sonnet-4-6'

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

const CHAT_SYSTEM = (userName: string, accessLabel: string) => `You are Leo — the active intelligence engine inside Polaris, the JLS Yachts management platform.

You are in chat mode. The user ${userName} (${accessLabel}) is asking a follow-up question after their briefing.

Respond directly and operationally. Answer from what you know about the platform context.
If you don't have specific data, say so plainly — never fabricate operational details.
Stay in character: confident, direct, no filler phrases.
Keep responses concise — 2-4 sentences unless more detail is clearly needed.
Use plain text only, no markdown headers, no bullet lists.`

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
    try {
      const admin = getAdmin()
      const { data: { user }, error } = await admin.auth.getUser(token)
      if (error || !user) throw new Error('Unauthorized')
      userEmail = user.email ?? ''
    } catch {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const accessLabel = ACCESS_LABELS[getAccessLevel(userEmail)]
    const systemPrompt = CHAT_SYSTEM(userName, accessLabel)

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
