/**
 * Leo Briefing API — Streaming endpoint
 * POST /api/leo/briefing
 *
 * Validates Supabase session, assembles operational context based on access
 * level, and streams a personalised briefing from the Anthropic API.
 *
 * Security: ANTHROPIC_API_KEY is a Wrangler secret — never exposed to client.
 * Set it with: wrangler secret put ANTHROPIC_API_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { getAccessLevel, ACCESS_CAPS, ACCESS_LABELS } from '@/lib/leo-access'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const LEO_MODEL     = 'claude-sonnet-4-6'

// ── Supabase admin client (server-only) ─────────────────────────────────────
function getAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ── Context assembly ─────────────────────────────────────────────────────────
async function assembleLeoContext(userId: string, userEmail: string) {
  const sb    = getAdmin()
  const level = getAccessLevel(userEmail)
  const caps  = ACCESS_CAPS[level]
  const today = new Date().toISOString().split('T')[0]
  const in90  = new Date(Date.now() + 90 * 864e5).toISOString().split('T')[0]
  const in30  = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0]

  const [
    yachtsRes,
    permitsRes,
    tasksRes,
    projectsRes,
    ticketsRes,
    visasRes,
    esignRes,
    complianceAlertsRes,
  ] = await Promise.all([
    // ── Fleet ────────────────────────────────────────────────────────────────
    caps.allVessels
      ? (sb as any).from('yachts')
          .select('vessel_name, status, location, eta, etd, berth, ais_speed, ais_destination, ais_position_at, cruising_permit_expiry')
          .eq('archive', false)
          .order('vessel_name')
      : Promise.resolve({ data: [], error: null }),

    // ── Permits expiring within 90 days ──────────────────────────────────────
    caps.permitData
      ? (sb as any).from('permits')
          .select('permit_type, expiry_date, status, holder_name, yacht_id, yachts(vessel_name)')
          .gte('expiry_date', today)
          .lte('expiry_date', in90)
          .neq('status', 'cancelled')
          .order('expiry_date')
      : Promise.resolve({ data: [], error: null }),

    // ── Orbit tasks overdue or due within 14 days ────────────────────────────
    caps.tasksData
      ? (sb as any).from('orbit_tasks')
          .select('title, status, priority, due_date, orbit_projects(name, yacht_id, yachts(vessel_name))')
          .in('status', ['todo', 'in_progress', 'review'])
          .lte('due_date', new Date(Date.now() + 14 * 864e5).toISOString().split('T')[0])
          .order('due_date')
          .limit(15)
      : Promise.resolve({ data: [], error: null }),

    // ── High/urgent orbit projects ────────────────────────────────────────────
    caps.tasksData
      ? (sb as any).from('orbit_projects')
          .select('name, status, priority, due_date, yachts(vessel_name)')
          .in('priority', ['high', 'urgent'])
          .in('status', ['active', 'on_hold'])
          .order('priority')
          .limit(10)
      : Promise.resolve({ data: [], error: null }),

    // ── Open IT tickets ───────────────────────────────────────────────────────
    caps.ticketsData
      ? (sb as any).from('it_tickets')
          .select('ticket_no, subject, priority, status, created_at, yachts(vessel_name)')
          .in('status', ['open', 'in_progress'])
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),

    // ── Pending visa applications ─────────────────────────────────────────────
    caps.crewData
      ? (sb as any).from('visa_applications')
          .select('visa_type, status, submitted_at, crew_members(first_name, last_name, rank, yachts(vessel_name))')
          .in('status', ['draft', 'submitted'])
          .order('submitted_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),

    // ── eSign documents awaiting signature ────────────────────────────────────
    caps.esign
      ? (sb as any).from('esign_documents')
          .select('reference, title, signer_name, signer_email, sent_at, status')
          .in('status', ['sent'])
          .order('sent_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),

    // ── Visa compliance alerts (critical + warn, unresolved, due soonest) ─────
    caps.crewData
      ? (sb as any).from('compliance_alerts')
          .select('alert_type, severity, message, due_date, crew_members(full_name, first_name, last_name)')
          .eq('resolved', false)
          .in('severity', ['warn', 'critical'])
          .order('due_date', { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
  ])

  // ── Compute days-to-expiry helper ─────────────────────────────────────────
  const daysUntil = (dateStr: string) =>
    Math.ceil((new Date(dateStr).getTime() - Date.now()) / 864e5)

  const permits = (permitsRes.data ?? []).map((p: any) => ({
    vessel:     p.yachts?.vessel_name ?? 'Unknown',
    type:       p.permit_type,
    expiry:     p.expiry_date,
    daysLeft:   daysUntil(p.expiry_date),
    status:     p.status,
  }))

  const criticalPermits = permits.filter((p: any) => p.daysLeft <= 14)

  return {
    accessLevel: level,
    generatedAt: new Date().toISOString(),
    fleet: {
      total:    (yachtsRes.data ?? []).length,
      active:   (yachtsRes.data ?? []).filter((y: any) => y.status === 'Active').length,
      underway: (yachtsRes.data ?? []).filter((y: any) => (y.ais_speed ?? 0) > 1).length,
      vessels:  (yachtsRes.data ?? []).map((y: any) => ({
        name:        y.vessel_name,
        status:      y.status,
        location:    y.location,
        berth:       y.berth,
        eta:         y.eta,
        etd:         y.etd,
        speedKnots:  y.ais_speed,
        destination: y.ais_destination,
        lastAIS:     y.ais_position_at,
      })),
    },
    permits: {
      expiringIn90Days: permits.length,
      critical:         criticalPermits.length,
      list:             permits.slice(0, 12),
    },
    tasks: {
      total:     (tasksRes.data ?? []).length,
      overdue:   (tasksRes.data ?? []).filter((t: any) => t.due_date < today).length,
      list:      (tasksRes.data ?? []).map((t: any) => ({
        title:   t.title,
        project: t.orbit_projects?.name,
        vessel:  t.orbit_projects?.yachts?.vessel_name,
        due:     t.due_date,
        status:  t.status,
        priority:t.priority,
      })),
    },
    projects: {
      total: (projectsRes.data ?? []).length,
      list:  (projectsRes.data ?? []).map((p: any) => ({
        name:     p.name,
        vessel:   p.yachts?.vessel_name,
        status:   p.status,
        priority: p.priority,
        due:      p.due_date,
      })),
    },
    tickets: {
      open: (ticketsRes.data ?? []).length,
      list: (ticketsRes.data ?? []).map((t: any) => ({
        ref:     t.ticket_no,
        subject: t.subject,
        priority:t.priority,
        vessel:  t.yachts?.vessel_name,
      })),
    },
    visas: {
      pending: (visasRes.data ?? []).length,
      list:    (visasRes.data ?? []).map((v: any) => ({
        crew:    `${v.crew_members?.first_name} ${v.crew_members?.last_name}`,
        rank:    v.crew_members?.rank,
        vessel:  v.crew_members?.yachts?.vessel_name,
        type:    v.visa_type,
        status:  v.status,
      })),
    },
    esign: {
      awaitingSignature: (esignRes.data ?? []).length,
      list: (esignRes.data ?? []).map((d: any) => ({
        ref:    d.reference,
        title:  d.title,
        signer: d.signer_name,
      })),
    },
    visaCompliance: {
      criticalCount: (complianceAlertsRes.data ?? []).filter((a: any) => a.severity === 'critical').length,
      alerts: (complianceAlertsRes.data ?? []).map((a: any) => ({
        type:     a.alert_type,
        severity: a.severity,
        message:  a.message,
        due:      a.due_date,
        crew:     a.crew_members?.full_name ?? ((a.crew_members?.first_name ?? '') + ' ' + (a.crew_members?.last_name ?? '')).trim(),
      })),
    },
  }
}

// ── System prompt builder ─────────────────────────────────────────────────────
function buildSystemPrompt(userName: string, accessLabel: string, context: any): string {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  return `You are Leo — the active intelligence engine inside Polaris, the yacht management and concierge platform operated by JLS Yachts.

You are not a chatbot or assistant. You are a proactive operational briefing officer. You speak first. You deliver intelligence.

USER: ${userName} | ACCESS: ${accessLabel} | TIME: ${greeting}
LIVE CONTEXT (as of ${new Date().toUTCString()}):
${JSON.stringify(context, null, 2)}

BRIEFING STRUCTURE (follow exactly when delivering an initial briefing):

1. GREETING — One sentence. Address ${userName} by first name. Acknowledge the time.

2. FLEET STATUS — Current vessel positions, movements, and anything notable. Be specific: name vessels, speeds, destinations. Flag anything unusual.

3. CRITICAL ATTENTION — Permits or certs expiring within 14 days. Name the vessel, permit type, and exact days remaining. This is the most operationally urgent section.

4. ACTIVE WORK — Highlight the 2-3 most important tasks or projects. Name the vessel, the project, and why it matters now.

5. CREW & DOCUMENTS — Any pending visa applications or documents requiring action.

6. OPEN ITEMS — Open IT tickets, unsigned esign documents, or anything else requiring human decision.

THEN — on a new line after the prose — output this JSON block:
<insights>
{"lean":"One sentence: the single most important process or workflow signal.","ops":"One sentence: overall operational health of the fleet right now.","alert":"One sentence: the single most urgent thing requiring action today."}
</insights>

TONE: Direct. Confident. Like a knowledgeable first officer delivering a bridge handover.
Not an assistant. Not helpful. Operational.
No "I can help with", no "would you like me to", no hedging.

FORMAT: Plain prose. No markdown headers. No bullet points. No asterisks.
Target 150–220 words for a briefing. Shorter is better than longer.
Numbers matter. Name vessels. Be specific.

VISA & COMPLIANCE ALERTS:
If visa_compliance contains critical items, surface the single most urgent one in the briefing.
Name the crew member and the exact date. Be specific. Example: "Ahmed Al Rashidi's UAE visa expires in 4 days — renewal has not been initiated."
Do not list every alert. One maximum in the briefing prose. Prioritise critical over warn.

When in CHAT mode (follow-up questions after the briefing):
Answer directly from the context provided. If data is not in context, say so plainly.
Stay in character as Leo. Operational. Precise. No filler.`
}

// ── Handler (called directly from worker-entry.ts) ───────────────────────────
export async function leoBriefingHandler(request: Request): Promise<Response> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured. Run: wrangler secret put ANTHROPIC_API_KEY' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }

    let token: string
    let userName = 'there'
    try {
      const body = await request.json()
      token    = body.token
      userName = body.userName ?? 'there'
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate Supabase session
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

    // Assemble context
    let context: any
    try {
      context = await assembleLeoContext(userId, userEmail)
    } catch (e) {
      console.error('Leo context assembly failed:', e)
      context = { error: 'Context assembly failed', accessLevel: getAccessLevel(userEmail) }
    }

    const accessLabel = ACCESS_LABELS[getAccessLevel(userEmail)]
    const systemPrompt = buildSystemPrompt(userName, accessLabel, context)

    // Call Anthropic — stream the response
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
          max_tokens: 1200,
          stream:     true,
          system:     systemPrompt,
          messages:   [{ role: 'user', content: 'Deliver my briefing now.' }],
        }),
      })
    } catch (e: any) {
      console.error('Leo Anthropic fetch failed:', e)
      return new Response(
        JSON.stringify({ error: `Failed to reach Anthropic: ${e?.message ?? 'network error'}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      console.error('Leo Anthropic non-OK:', anthropicRes.status, err)
      return new Response(
        JSON.stringify({ error: `Anthropic error ${anthropicRes.status}: ${err}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Pipe SSE → plain text stream (extract text_delta only)
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
              } catch { /* malformed SSE chunk — skip */ }
            }
          }
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type':   'text/plain; charset=utf-8',
        'Cache-Control':  'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
}
