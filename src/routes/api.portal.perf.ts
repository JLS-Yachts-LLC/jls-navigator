/**
 * POST /api/portal/perf — files one client-portal start-up timing report
 * (lib/portal/portal-perf.ts) in client_logs, source "portal-perf". Portal
 * logins can't write client_logs themselves, so it goes through here.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht } from '@/lib/portal/portal-auth.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function portalPerfHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const raw = await request.text()
  if (raw.length > 20_000) return json({ error: 'Too large' }, 413)
  let body: any
  try { body = JSON.parse(raw) } catch { return json({ error: 'Bad JSON' }, 400) }

  const long: Array<[number, number]> = Array.isArray(body?.long) ? body.long : []
  const inputs: Array<[string, number, number, number]> = Array.isArray(body?.inputs) ? body.inputs : []
  const blocked = long.reduce((s, t) => s + (Number(t?.[1]) || 0), 0)
  const worstWait = Math.max(0, ...inputs.map((i) => Number(i?.[2]) || 0))
  const { error } = await admin().from('client_logs').insert({
    // Always info: warn/error rows in client_logs are escalated as app errors.
    level: 'info',
    message: `Portal start-up timing — ${auth.yacht.vesselName}: ${blocked}ms main thread blocked, slowest click waited ${worstWait}ms`,
    source: 'portal-perf',
    url: typeof body?.url === 'string' ? body.url.slice(0, 500) : null,
    user_email: auth.yacht.email || null,
    user_agent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
    breadcrumbs: { marks: body?.marks ?? [], long, inputs, nav: body?.nav ?? null, scripts: body?.scripts ?? null },
  })
  // Say so when it isn't filed — every report was once lost silently to a level check.
  if (error) {
    console.error('[portal-perf] not filed:', error.message)
    return json({ error: 'Not filed' }, 500)
  }
  return json({ ok: true })
}
