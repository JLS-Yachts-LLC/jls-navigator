/**
 * Client-portal server auth for small-boat owners — the boat counterpart of
 * resolvePortalYacht() (portal-auth.server.ts).
 *
 * A boat owner is a captain_accounts row with `boat_id` set instead of
 * `yacht_id` (migration 20261005090000). One login may own several boats: one
 * row per boat, same user_id. The Orbit 2 tables stay closed to portal logins
 * at the database (their restrictive portal_captain_block fence), because RLS
 * is row-level and a boat's job rows carry team comments, technician names and
 * internal remarks. So every piece of boat data the portal shows is served by
 * /api/portal/boats with the service role, and this resolver is the only thing
 * between a portal login and Orbit 2 — it must stay strict.
 *
 * Admin preview ("View as", or Preview in Manage Users): the portal page sends
 * `X-Portal-Preview: <captain_account_id>` with the admin's own token, honoured
 * only for a staff admin (requireAdminAccess, which also refuses any portal
 * login). It resolves to everything that owner would see.
 */
import { createClient } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/admin/access'

export type PortalBoatOwner = {
  /** The owner's auth user id — '' when previewing a row with no login yet. */
  userId: string
  email: string
  /** The boats this login owns. Never empty on success. */
  boatIds: string[]
  /** True when a staff admin is previewing an owner's portal read-only. */
  preview: boolean
}

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** Resolve the caller to the boats they own, or a ready-to-return error Response. */
export async function resolvePortalBoats(
  request: Request,
): Promise<{ ok: true; owner: PortalBoatOwner } | { ok: false; response: Response }> {
  const authz = request.headers.get('Authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  if (!token) return { ok: false, response: json({ error: 'Not authenticated' }, 401) }

  const sb = admin()

  const previewId = request.headers.get('X-Portal-Preview')
  if (previewId) {
    const session = await requireAdminAccess(request)
    if (!session.ok) return { ok: false, response: session.response }

    const { data: acct } = await sb
      .from('captain_accounts')
      .select('id, user_id, boat_id, email')
      .eq('id', previewId)
      .eq('active', true)
      .maybeSingle()
    if (!acct?.boat_id) return { ok: false, response: json({ error: 'No boat linked to this account' }, 404) }

    // An owner with a login sees every boat linked to it; a row with no login
    // yet is previewed as just its own boat.
    let boatIds = [acct.boat_id as string]
    if (acct.user_id) boatIds = await ownedBoatIds(sb, acct.user_id as string)
    return {
      ok: true,
      owner: { userId: (acct.user_id as string | null) ?? '', email: (acct.email as string | null) ?? '', boatIds, preview: true },
    }
  }

  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return { ok: false, response: json({ error: 'Not authenticated' }, 401) }

  const boatIds = await ownedBoatIds(sb, user.id)
  if (!boatIds.length) return { ok: false, response: json({ error: 'No boat linked to this account' }, 403) }

  // The portal's RLS requires an MFA-verified session (portal_aal2()); this
  // data bypasses RLS, so the same gate is applied here.
  if (claimsOf(token)?.aal !== 'aal2') {
    return { ok: false, response: json({ error: 'Two-factor verification required' }, 403) }
  }

  return { ok: true, owner: { userId: user.id, email: user.email ?? '', boatIds, preview: false } }
}

async function ownedBoatIds(sb: ReturnType<typeof admin>, userId: string): Promise<string[]> {
  const { data } = await sb
    .from('captain_accounts')
    .select('boat_id')
    .eq('user_id', userId)
    .eq('active', true)
    .not('boat_id', 'is', null)
    .order('created_at', { ascending: true })
  return (data ?? []).map((r: any) => r.boat_id as string)
}

/** The payload of a token Supabase has already verified (getUser above). */
function claimsOf(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1] ?? ''
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')))
  } catch {
    return null
  }
}
