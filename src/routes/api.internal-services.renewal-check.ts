/**
 * Internal-services renewal alert — POST /api/internal-services/renewal-check
 *
 * Finds active internal services within 90 days of renewal that haven't been
 * alerted yet, claims each one atomically (so concurrent callers don't double-
 * send), and emails the support mailbox prompting a vendor quotation + Yacht
 * quotation prep. Idempotent — safe to call on page load and/or from a cron.
 */
import { createClient } from '@supabase/supabase-js'
import { sendTicketEmail, TICKET_MAIL_SENDER, serviceRenewalEmail } from '@/lib/graph-mail.server'

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

const DAY = 86_400_000

export async function internalServicesRenewalCheckHandler(_request: Request): Promise<Response> {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
  try {
    const db = getAdmin() as any
    const today = new Date().toISOString().slice(0, 10)
    const in90 = new Date(Date.now() + 90 * DAY).toISOString().slice(0, 10)

    // Candidates: active, renewing within 90 days, not yet alerted.
    const { data: candidates } = await db
      .from('internal_services')
      .select('id, service_name, vendor, renewal_date, seats, owner')
      .eq('status', 'active')
      .is('renewal_alert_sent_at', null)
      .not('renewal_date', 'is', null)
      .gte('renewal_date', today)
      .lte('renewal_date', in90)

    const list = (candidates ?? []) as any[]
    if (list.length === 0) return json({ ok: true, alerted: 0 })

    // Claim each row atomically — only those we successfully flip from null are ours.
    const claimed: any[] = []
    for (const s of list) {
      const { data: upd } = await db
        .from('internal_services')
        .update({ renewal_alert_sent_at: new Date().toISOString() })
        .eq('id', s.id)
        .is('renewal_alert_sent_at', null)
        .select('id')
      if (upd && upd.length) claimed.push(s)
    }
    if (claimed.length === 0) return json({ ok: true, alerted: 0 })

    const items = claimed.map((s) => ({
      name: s.service_name,
      vendor: s.vendor,
      renewal_date: s.renewal_date,
      days: s.renewal_date ? Math.ceil((new Date(s.renewal_date).getTime() - Date.now()) / DAY) : null,
      seats: s.seats,
      owner: s.owner,
    }))

    const email = serviceRenewalEmail(items)
    try {
      await sendTicketEmail({ to: TICKET_MAIL_SENDER, subject: email.subject, html: email.html })
    } catch (e) {
      // Email failed — roll back the claim so the next run retries.
      await db.from('internal_services')
        .update({ renewal_alert_sent_at: null })
        .in('id', claimed.map((s) => s.id))
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
    }

    return json({ ok: true, alerted: claimed.length })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
}
