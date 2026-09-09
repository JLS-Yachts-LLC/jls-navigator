import { createClient } from '@supabase/supabase-js'
import type { PolarisRole } from './types'
import { DEVELOPER_EMAILS } from '@/lib/leo-access'

export interface AdminSession {
  ok: true
  user: {
    id: string
    email: string
    role: PolarisRole
    org_id: string | null
  }
}

export interface AdminDenied {
  ok: false
  response: Response
}

export type AccessResult = AdminSession | AdminDenied

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

function denied(status: number, message: string): AdminDenied {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  }
}

export async function requireAdminAccess(
  request: Request,
  allowedRoles: PolarisRole[] = ['global_admin', 'org_admin'],
): Promise<AccessResult> {
  const authHeader = request.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return denied(401, 'Unauthorized')

  const token = authHeader.slice(7)
  const sb    = getAdmin()

  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return denied(401, 'Invalid token')

  const email = user.email ?? ''

  // A client-portal captain is never an admin, whatever else the account carries.
  //
  // This check exists because everything below runs with the SERVICE ROLE, which
  // bypasses RLS — so the database-level captain isolation that protects the rest
  // of the app does nothing here. An account that is both a captain and a staff
  // profile (the AQUILA test login was exactly that: an old global_admin
  // repurposed as a captain) would otherwise pass every admin guard in the app,
  // including user management and document revocation.
  const { data: captainAcct } = await sb
    .from('captain_accounts')
    .select('id')
    .eq('user_id', user.id)
    .eq('active', true)
    .limit(1)
  if (captainAcct?.length) return denied(403, 'Client-portal accounts cannot access staff areas')

  // Resolve role + org. Source order:
  //   1. app_metadata (set by the JWT hook — not deployed yet, Edge Fns off)
  //   2. user_profiles (the access-control table from #128) — server-side claims
  //   3. developer allow-list fallback for the current build phase
  let role = user.app_metadata?.role as PolarisRole | undefined
  let org_id: string | null = user.app_metadata?.org_id ?? null

  if (!role) {
    const { data: profile } = await sb
      .from('user_profiles')
      .select('org_id, roles:role_id(name)')
      .eq('user_id', user.id)
      .maybeSingle()
    const roleName = (profile as any)?.roles?.name as string | undefined
    if (roleName) {
      // Global-tier roles all satisfy admin-access checks.
      role = (['global_admin', 'platform_owner', 'developer'].includes(roleName)
        ? 'global_admin'
        : roleName) as PolarisRole
      org_id = org_id ?? ((profile as any)?.org_id ?? null)
    }
  }

  if (!role && DEVELOPER_EMAILS.includes(email.toLowerCase())) {
    role = 'global_admin'
  }

  if (!role || !allowedRoles.includes(role)) {
    return denied(403, 'Forbidden — insufficient role')
  }

  return {
    ok: true,
    user: { id: user.id, email, role, org_id },
  }
}
