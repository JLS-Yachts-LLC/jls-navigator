import { createClient } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/admin/access'
import { logAuditEvent } from '@/lib/admin/audit'
import { sendAuthLinkViaSES } from '@/lib/admin/auth-email.server'

function getAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

const handlers = {
  // List platform users from user_profiles (the real RBAC store — the same table
  // requireAdminAccess reads), joined to the roles catalog. Email / MFA / last-login
  // / active all live on the profile, so no auth.users join is needed.
  GET: async ({ request }: { request: Request }) => {
    const session = await requireAdminAccess(request)
    if (!session.ok) return session.response

    const { searchParams } = new URL(request.url)
    const page     = parseInt(searchParams.get('page')     ?? '1')
    const pageSize = parseInt(searchParams.get('pageSize') ?? '25')
    const search   = searchParams.get('search') ?? ''

    const sb = getAdmin()

    // Role catalog drives the UI dropdowns + badge labels.
    const { data: roleRows } = await sb
      .from('roles').select('name, display_name, scope').order('display_name')

    let query = sb
      .from('user_profiles')
      .select(
        'user_id, email, active, mfa_enabled, last_login, created_at, org_id, location_id, role_id, roles:role_id(name, display_name, scope)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (search) query = query.ilike('email', `%${search}%`)
    if (session.user.role === 'org_admin' && session.user.org_id) {
      query = query.eq('org_id', session.user.org_id)
    }

    const { data, error, count } = await query
    if (error) return json({ error: error.message }, 500)

    const users = (data ?? []).map((p: any) => {
      const roleName = p.roles?.name ?? null
      // Pending invite = inactive profile for someone who has never signed in.
      const status: 'invited' | 'active' | 'suspended' =
        p.active ? 'active' : (p.last_login ? 'suspended' : 'invited')
      return {
        id:           p.user_id,
        user_id:      p.user_id,
        role:         roleName,
        role_display: p.roles?.display_name ?? roleName,
        org_id:       p.org_id ?? null,
        vessel_id:    null,
        location_id:  p.location_id ?? null,
        is_active:    !!p.active,
        status,
        granted_at:   p.created_at,
        user: { id: p.user_id, email: p.email ?? p.user_id, last_sign_in_at: p.last_login ?? null, created_at: p.created_at ?? null },
        // user_profiles.mfa_enabled is the source of truth; surface it as a factor.
        mfa_factors: p.mfa_enabled ? [{ id: 'mfa', factor_type: 'totp', status: 'verified' }] : [],
      }
    })

    return json({ users, total: count ?? 0, page, pageSize, roles: roleRows ?? [] })
  },

  // Invite a user: create the auth user (sends the email) + create their profile
  // with the chosen role. The profile starts inactive — it flips to active when
  // they accept and sign in.
  POST: async ({ request }: { request: Request }) => {
    const session = await requireAdminAccess(request)
    if (!session.ok) return session.response

    const body = await request.json() as {
      email: string
      role: string            // a roles.name value
      org_id?: string
      location_id?: string
    }
    const { email, role, org_id, location_id } = body

    if (!email || !role) return json({ error: 'email and role are required' }, 400)

    const sb = getAdmin()

    const { data: roleRow } = await sb
      .from('roles').select('role_id, scope').eq('name', role).maybeSingle()
    if (!roleRow) return json({ error: `Unknown role: ${role}` }, 400)

    // Org admins may not grant global-scope roles.
    if (session.user.role === 'org_admin' && roleRow.scope === 'global') {
      return json({ error: 'Insufficient permission to grant this role' }, 403)
    }

    const base = process.env.VITE_APP_URL ?? new URL(request.url).origin

    // Resolve/create the auth user WITHOUT sending Supabase's default email — we
    // deliver a branded Polaris invite via SES ourselves (below).
    let userId: string | undefined
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email, email_confirm: false, user_metadata: { role },
    })
    userId = created?.user?.id
    if (!userId) {
      // Already registered (or create failed) — find the existing user.
      const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
      userId = (list?.users ?? []).find((u: any) => (u.email ?? '').toLowerCase() === email.toLowerCase())?.id
      if (!userId) return json({ error: createErr?.message ?? 'Invite failed' }, 400)
    }

    // Primary: branded Polaris invite via SES. Fallback: Supabase's native invite.
    let emailSent = await sendAuthLinkViaSES(sb, {
      email,
      type: 'recovery',
      redirectTo: `${base}/auth`,
      subject: 'Your Polaris invitation',
      heading: 'You have been invited to Polaris',
      intro: 'An administrator has invited you to the Polaris operational platform. Set your password to activate your account.',
      cta: 'Set up my account',
    })
    if (!emailSent) {
      const { error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email, {
        data: { role }, redirectTo: `${base}/auth/mfa-setup`,
      })
      emailSent = !inviteErr
    }

    const { error: profileErr } = await sb.from('user_profiles').upsert({
      user_id:      userId,
      email,
      // display_name is NOT NULL — seed from the email local part; the user can
      // refine it once they accept and complete their profile.
      display_name: email.split('@')[0],
      role_id:      roleRow.role_id,
      org_id:       org_id ?? (session.user.org_id ?? null),
      location_id:  location_id ?? null,
      active:       false,
    }, { onConflict: 'user_id' })
    if (profileErr) return json({ error: `Invited, but profile setup failed: ${profileErr.message}` }, 500)

    await logAuditEvent({
      event_type:  'PERM',
      actor_id:    session.user.id,
      actor_email: session.user.email,
      actor_role:  session.user.role,
      target_type: 'user',
      target_label: email,
      detail:      `User invited: ${email} — role: ${role}${emailSent ? '' : ' (email NOT delivered)'}`,
      ip_address:  request.headers.get('x-forwarded-for'),
      result:      'pending',
    })

    return json({
      success: true,
      emailSent,
      warning: emailSent ? undefined : 'User created, but the invite email could not be sent. Use "Resend invite" once email is configured.',
    })
  },
}

/** Worker-entry dispatcher — TanStack API routes aren't served by the CF handler. */
export async function adminUsersHandler(request: Request): Promise<Response> {
  if (request.method === 'GET')  return handlers.GET({ request })
  if (request.method === 'POST') return handlers.POST({ request })
  return json({ error: 'Method not allowed' }, 405)
}
