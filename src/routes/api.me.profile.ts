/**
 * PATCH /api/me/profile  { display_name?, avatar_url? }
 *
 * Lets a signed-in person edit their OWN name and picture.
 *
 * It has to run server-side: RLS on user_profiles gives a user SELECT on their
 * own row but no UPDATE — writes are admin-only — so the browser cannot do this
 * directly. The user id comes from the bearer token and is the only row touched,
 * so this endpoint can never edit anybody else, whatever it is sent.
 */
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function myProfileHandler(request: Request): Promise<Response> {
  if (request.method !== 'PATCH') return json({ error: 'Method not allowed' }, 405)

  const authz = request.headers.get('Authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  if (!token) return json({ error: 'Not authenticated' }, 401)

  const sb = getAdmin()
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Not authenticated' }, 401)

  let body: { display_name?: string | null; avatar_url?: string | null }
  try { body = await request.json() } catch { return json({ error: 'Invalid request body' }, 400) }

  const patch: Record<string, any> = { updated_at: new Date().toISOString() }

  if (body.display_name !== undefined) {
    const name = String(body.display_name ?? '').trim()
    // display_name is NOT NULL and is what every picker in the app shows, so an
    // empty one is rejected rather than quietly stored.
    if (!name) return json({ error: 'Your name cannot be empty' }, 400)
    if (name.length > 80) return json({ error: 'That name is too long' }, 400)
    patch.display_name = name
  }

  if (body.avatar_url !== undefined) {
    const url = body.avatar_url === null ? null : String(body.avatar_url).trim()
    // Only a storage reference we manage — never an arbitrary URL, which would
    // let someone point their avatar at a tracker or an external host.
    if (url && !/^permit-documents\/staff-avatars\/[A-Za-z0-9._/-]+$/.test(url)) {
      return json({ error: 'That image location is not allowed' }, 400)
    }
    patch.avatar_url = url || null
  }

  const { error } = await sb.from('user_profiles').update(patch).eq('user_id', user.id)
  if (error) return json({ error: error.message }, 500)

  const { data: after } = await sb
    .from('user_profiles').select('display_name, avatar_url').eq('user_id', user.id).maybeSingle()
  return json({ success: true, ...(after ?? {}) })
}
