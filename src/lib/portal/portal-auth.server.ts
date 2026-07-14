/**
 * Client-portal server auth. Every portal API route calls resolvePortalYacht()
 * to turn the caller's Supabase JWT into the ONE vessel they're allowed to see —
 * mirroring the hard RLS isolation the portal UI relies on, but for data that
 * lives outside Supabase (QuickBooks) or under service-role-only tables.
 *
 * The caller must send `Authorization: Bearer <supabase access_token>`.
 */
import { createClient } from '@supabase/supabase-js'

export type PortalYacht = {
  userId: string
  yachtId: string
  vesselName: string
  qboCustomerId: string | null
}

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

/** Resolve the authenticated portal user to their active vessel, or a ready-to-return error Response. */
export async function resolvePortalYacht(
  request: Request,
): Promise<{ ok: true; yacht: PortalYacht } | { ok: false; response: Response }> {
  const authz = request.headers.get('Authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  if (!token) return { ok: false, response: json({ error: 'Not authenticated' }, 401) }

  const sb = admin()
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return { ok: false, response: json({ error: 'Not authenticated' }, 401) }

  // The user must have an ACTIVE captain account — this is the isolation boundary.
  const { data: acct } = await sb
    .from('captain_accounts')
    .select('yacht_id')
    .eq('user_id', user.id)
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  if (!acct?.yacht_id) return { ok: false, response: json({ error: 'No vessel linked to this account' }, 403) }

  const { data: yacht } = await sb
    .from('yachts')
    .select('id, vessel_name, qbo_customer_id')
    .eq('id', acct.yacht_id)
    .maybeSingle()
  if (!yacht) return { ok: false, response: json({ error: 'Vessel not found' }, 404) }

  return {
    ok: true,
    yacht: {
      userId: user.id,
      yachtId: yacht.id,
      vesselName: yacht.vessel_name,
      qboCustomerId: (yacht as any).qbo_customer_id ?? null,
    },
  }
}
