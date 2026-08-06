/**
 * Public "Forgot your password" endpoint.
 *
 * Supabase's built-in mailer is not configured for this project, so the login
 * page's native resetPasswordForEmail() always fails. This endpoint mints the
 * recovery link via the admin API (no email sent by Supabase) and delivers it
 * through the app's proven SES sender — the same path as admin invites.
 *
 * Unauthenticated by necessity. It never reveals whether an account exists:
 * the response is identical either way, and it only actually emails when the
 * address belongs to a real user.
 */
import { createClient } from '@supabase/supabase-js'
import { sendAuthLinkViaSES } from '@/lib/admin/auth-email.server'

function getAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function authForgotPasswordHandler(request: Request): Promise<Response> {
  const generic = new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
  try {
    const body = await request.json().catch(() => ({})) as { email?: string }
    const email = (body.email ?? '').trim().toLowerCase()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return generic

    const sb = getAdmin()
    // Only send when the profile exists — response stays generic either way.
    const { data: profile } = await sb
      .from('user_profiles').select('user_id').ilike('email', email).maybeSingle()
    if (!profile) return generic

    const base = process.env.VITE_APP_URL ?? new URL(request.url).origin
    await sendAuthLinkViaSES(sb, {
      email,
      type: 'recovery',
      redirectTo: `${base}/auth`,
      subject: 'Reset your Polaris password',
      heading: 'Reset your password',
      intro: 'We received a request to reset the password for your Polaris account. Click below to choose a new password. If you didn’t request this, you can ignore this email.',
      cta: 'Reset my password',
    })
    return generic
  } catch {
    return generic
  }
}
