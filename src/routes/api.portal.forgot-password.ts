/**
 * Public "Forgot your password" for the Client Portal.
 *
 *   POST /api/portal/forgot-password   { email } → always { ok: true }
 *
 * Mints a recovery link with the admin API and emails it through Polaris's own
 * mailer (Supabase's mailer isn't configured — same approach as the staff
 * /api/auth/forgot-password). The link lands back on /portal, where the client
 * confirms their authenticator code (if they have one) and sets a new password.
 *
 * Unauthenticated by necessity, so it never reveals whether an address has a
 * login (the response is identical either way), only emails active portal
 * logins, and is rate limited per address and per IP via portal_auth_requests.
 * Delivery to client addresses is still governed by CLIENT_EMAIL_ENABLED.
 */
import { createClient } from '@supabase/supabase-js'
import { sendAuthLinkViaSES } from '@/lib/admin/auth-email.server'
import { appBaseUrl } from '@/lib/app-url.server'

const generic = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })

/** One link per address per 10 minutes, and no more than 10 requests an hour from one IP. */
const PER_EMAIL_MINUTES = 10
const PER_IP_PER_HOUR = 10

export async function portalForgotPasswordHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string }
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return generic()

    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any
    const ip = request.headers.get('cf-connecting-ip')

    const since10 = new Date(Date.now() - PER_EMAIL_MINUTES * 60_000).toISOString()
    const sinceHour = new Date(Date.now() - 3_600_000).toISOString()
    const [{ count: recentForEmail }, { count: recentForIp }] = await Promise.all([
      sb.from('portal_auth_requests').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', since10),
      ip ? sb.from('portal_auth_requests').select('id', { count: 'exact', head: true }).eq('ip_address', ip).gte('created_at', sinceHour)
         : Promise.resolve({ count: 0 }),
    ])
    const limited = (recentForEmail ?? 0) > 0 || (recentForIp ?? 0) >= PER_IP_PER_HOUR

    // Only an active portal login (with an auth user) gets a link.
    const { data: acct } = limited ? { data: null } : await sb.from('captain_accounts')
      .select('id').ilike('email', email).eq('active', true).not('user_id', 'is', null).limit(1).maybeSingle()

    let sent = false
    if (acct) {
      const res = await sendAuthLinkViaSES(sb, {
        email,
        type: 'recovery',
        redirectTo: `${appBaseUrl()}/portal`,
        subject: 'Reset your JLS Yachts Client Portal password',
        heading: 'Reset your password',
        intro: 'We received a request to reset the password for your JLS Yachts Client Portal. Click below to choose a new one. If you didn’t ask for this, you can ignore this email — your password stays the same.',
        cta: 'Choose a new password',
      })
      sent = res.sent
      if (!res.sent) console.error('[portal-forgot-password] not sent:', res.error)
    }
    await sb.from('portal_auth_requests').insert({ email, ip_address: ip, kind: 'recovery', sent })
    return generic()
  } catch (e) {
    console.error('[portal-forgot-password]', e)
    return generic()
  }
}
