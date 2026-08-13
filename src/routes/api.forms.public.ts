/**
 * Public form fill API — the only thing the tokenised page talks to.
 *
 *   GET  /api/forms/public?token=…   → the form definition + saved answers
 *   POST /api/forms/public           → { token, data, submit? } saves the answers
 *
 * Deliberately NOT the browser Supabase client: form_submissions is closed to anon
 * by RLS, and a policy loose enough for a token-holder to read their row would let
 * anyone list every row. This endpoint uses the service role and will only ever
 * touch the single submission whose share_token was presented, so the token is the
 * authorisation and nothing else is reachable.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** Tokens are 48 hex chars; reject anything else without touching the database. */
const validToken = (t: string) => /^[a-f0-9]{32,64}$/i.test(t)

export async function formsPublicHandler(request: Request): Promise<Response> {
  const db = supabaseAdmin as any
  const url = new URL(request.url)

  if (request.method === 'GET') {
    const token = (url.searchParams.get('token') ?? '').trim()
    if (!validToken(token)) return json({ ok: false, error: 'invalid link' }, 400)

    const { data: sub } = await db.from('form_submissions')
      .select('id, data, status, vessel_name, submitted_at, forms(title, description, definition)')
      .eq('share_token', token).maybeSingle()
    if (!sub) return json({ ok: false, error: 'invalid link' }, 404)

    return json({
      ok: true,
      title: sub.forms?.title ?? 'Form',
      description: sub.forms?.description ?? null,
      sections: sub.forms?.definition ?? [],
      vessel: sub.vessel_name ?? null,
      data: sub.data ?? {},
      submitted: !!sub.submitted_at,
    })
  }

  if (request.method === 'POST') {
    let body: any = {}
    try { body = await request.json() } catch { return json({ ok: false, error: 'bad body' }, 400) }
    const token = String(body.token ?? '').trim()
    if (!validToken(token)) return json({ ok: false, error: 'invalid link' }, 400)
    if (typeof body.data !== 'object' || body.data === null) return json({ ok: false, error: 'bad data' }, 400)

    const { data: sub } = await db.from('form_submissions')
      .select('id, submitted_at').eq('share_token', token).maybeSingle()
    if (!sub) return json({ ok: false, error: 'invalid link' }, 404)
    // Once submitted the copy is closed — a stale tab must not overwrite it.
    if (sub.submitted_at) return json({ ok: false, error: 'This form has already been submitted.' }, 409)

    const submit = body.submit === true
    const patch: Record<string, any> = {
      data: body.data,
      status: submit ? 'submitted' : 'in_progress',
      updated_at: new Date().toISOString(),
    }
    if (submit) patch.submitted_at = new Date().toISOString()

    const { error } = await db.from('form_submissions').update(patch).eq('id', sub.id)
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, submitted: submit })
  }

  return json({ ok: false, error: 'method not allowed' }, 405)
}
