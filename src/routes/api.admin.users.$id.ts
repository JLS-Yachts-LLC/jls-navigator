import { createClient } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/admin/access'
import { logAuditEvent } from '@/lib/admin/audit'

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

// `id` is the user's auth user_id (the user_profiles primary key).
const handlers = {
  PATCH: async ({ request, params }: { request: Request; params: { id: string } }) => {
    const session = await requireAdminAccess(request)
    if (!session.ok) return session.response

    const { id } = params
    const body = await request.json() as {
      action: 'role' | 'suspend' | 'unsuspend' | 'reset_password' | 'resend_invite'
      role?: string          // a roles.name value
    }

    const sb = getAdmin()

    // Account actions that email the user — email lives on the profile.
    if (body.action === 'reset_password' || body.action === 'resend_invite') {
      const { data: profile } = await sb
        .from('user_profiles').select('email').eq('user_id', id).maybeSingle()
      const email = profile?.email
      if (!email) return json({ error: 'No email on file for this user' }, 404)

      const base = process.env.VITE_APP_URL ?? new URL(request.url).origin
      const { error: mailErr } = body.action === 'reset_password'
        ? await sb.auth.resetPasswordForEmail(email, { redirectTo: `${base}/auth` })
        : await sb.auth.admin.inviteUserByEmail(email, { redirectTo: `${base}/auth/mfa-setup` })
      if (mailErr) return json({ error: mailErr.message }, 400)

      await logAuditEvent({
        event_type:  body.action === 'reset_password' ? 'AUTH' : 'PERM',
        actor_id:    session.user.id,
        actor_email: session.user.email,
        actor_role:  session.user.role,
        target_type: 'user',
        target_id:   id,
        detail:      body.action === 'reset_password'
          ? `Password reset email sent to ${email}`
          : `Invite re-sent to ${email}`,
        ip_address:  request.headers.get('x-forwarded-for'),
        result:      'success',
      })
      return json({ success: true })
    }

    if (body.action === 'role' && body.role) {
      const { data: roleRow } = await sb
        .from('roles').select('role_id').eq('name', body.role).maybeSingle()
      if (!roleRow) return json({ error: `Unknown role: ${body.role}` }, 400)

      const { error } = await sb.from('user_profiles').update({ role_id: roleRow.role_id }).eq('user_id', id)
      if (error) return json({ error: error.message }, 500)

      await logAuditEvent({
        event_type:  'PERM',
        actor_id:    session.user.id,
        actor_email: session.user.email,
        actor_role:  session.user.role,
        target_type: 'user',
        target_id:   id,
        detail:      `Role updated → ${body.role}`,
        ip_address:  request.headers.get('x-forwarded-for'),
        result:      'success',
      })
      return json({ success: true })
    }

    if (body.action === 'suspend' || body.action === 'unsuspend') {
      const active = body.action === 'unsuspend'
      const { error } = await sb.from('user_profiles').update({ active }).eq('user_id', id)
      if (error) return json({ error: error.message }, 500)

      await logAuditEvent({
        event_type:  'ADMIN',
        actor_id:    session.user.id,
        actor_email: session.user.email,
        actor_role:  session.user.role,
        target_type: 'user',
        target_id:   id,
        detail:      `User ${active ? 'unsuspended' : 'suspended'}`,
        ip_address:  request.headers.get('x-forwarded-for'),
        result:      'success',
      })
      return json({ success: true })
    }

    return json({ error: 'Unknown action' }, 400)
  },

  DELETE: async ({ request, params }: { request: Request; params: { id: string } }) => {
    const session = await requireAdminAccess(request)
    if (!session.ok) return session.response

    const { id } = params
    const sb = getAdmin()

    const { error } = await sb.from('user_profiles').update({ active: false }).eq('user_id', id)
    if (error) return json({ error: error.message }, 500)

    await logAuditEvent({
      event_type:  'ADMIN',
      actor_id:    session.user.id,
      actor_email: session.user.email,
      actor_role:  session.user.role,
      target_type: 'user',
      target_id:   id,
      detail:      'User deactivated (soft delete)',
      ip_address:  request.headers.get('x-forwarded-for'),
      result:      'success',
    })
    return json({ success: true })
  },
}

/** Worker-entry dispatcher for /api/admin/users/:id (PATCH role/suspend, DELETE). */
export async function adminUserByIdHandler(request: Request, id: string): Promise<Response> {
  if (request.method === 'PATCH')  return handlers.PATCH({ request, params: { id } })
  if (request.method === 'DELETE') return handlers.DELETE({ request, params: { id } })
  return json({ error: 'Method not allowed' }, 405)
}
