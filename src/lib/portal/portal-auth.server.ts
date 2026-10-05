/**
 * Client-portal server auth. Every portal API route calls resolvePortalYacht()
 * to turn the caller's Supabase JWT into the ONE vessel they're allowed to see —
 * mirroring the hard RLS isolation the portal UI relies on, but for data that
 * lives outside Supabase (QuickBooks) or under service-role-only tables.
 *
 * The caller must send `Authorization: Bearer <supabase access_token>`.
 *
 * Admin preview ("View as" → a client account): the portal page sends
 * `X-Portal-Preview: <captain_account_id>` with the ADMIN's own token. That is
 * only honoured for a staff admin (requireAdminAccess, which also refuses any
 * captain login), and resolves to the previewed account's vessel. The routes are
 * read-only, and anything they record is recorded under the admin's own id.
 */
import { createClient } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/admin/access'

export type PortalYacht = {
  userId: string
  /** From the JWT — how a portal caller is named in staff-facing logs, which
   *  cannot reference their id the way a staff account can. */
  email: string
  yachtId: string
  vesselName: string
  qboCustomerId: string | null
  /** True when a staff admin is previewing this vessel's portal. */
  preview: boolean
  /** captain_accounts.position of the (previewed) account — see portal-positions. */
  position: string | null
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
  const previewAccountId = request.headers.get('X-Portal-Preview')?.trim()

  let caller: { id: string; email: string }
  let yachtId: string
  let position: string | null
  if (previewAccountId) {
    const access = await requireAdminAccess(request)
    if (!access.ok) return { ok: false, response: access.response }
    const { data: acct } = await sb
      .from('captain_accounts')
      .select('yacht_id, position')
      .eq('id', previewAccountId)
      .eq('active', true)
      .not('yacht_id', 'is', null)
      .maybeSingle()
    if (!acct?.yacht_id) return { ok: false, response: json({ error: 'Client account not found' }, 404) }
    caller = { id: access.user.id, email: access.user.email }
    yachtId = acct.yacht_id
    position = acct.position ?? null
  } else {
    const { data: { user }, error } = await sb.auth.getUser(token)
    if (error || !user) return { ok: false, response: json({ error: 'Not authenticated' }, 401) }

    // The user must have an ACTIVE captain account — this is the isolation boundary.
    const { data: acct } = await sb
      .from('captain_accounts')
      .select('yacht_id, position')
      .eq('user_id', user.id)
      .eq('active', true)
      // A boat-owner link has no yacht — see resolvePortalBoats() for those.
      .not('yacht_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (!acct?.yacht_id) return { ok: false, response: json({ error: 'No vessel linked to this account' }, 403) }
    caller = { id: user.id, email: user.email ?? '' }
    yachtId = acct.yacht_id
    position = acct.position ?? null
  }

  const { data: yacht } = await sb
    .from('yachts')
    .select('id, vessel_name, qbo_customer_id')
    .eq('id', yachtId)
    .maybeSingle()
  if (!yacht) return { ok: false, response: json({ error: 'Vessel not found' }, 404) }

  return {
    ok: true,
    yacht: {
      userId: caller.id,
      email: caller.email,
      yachtId: yacht.id,
      vesselName: yacht.vessel_name,
      qboCustomerId: (yacht as any).qbo_customer_id ?? null,
      preview: !!previewAccountId,
      position,
    },
  }
}
