/**
 * POST /api/it-tickets/poll-mail — run the inbound ticket-mail poller now.
 * Admin only. Returns what it scanned/appended so the mailbox wiring can be
 * verified without waiting for the 5-minute cron.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { pollTicketMailbox } from '@/lib/ticket-mail-inbound.server'

export async function itTicketsPollMailHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request)
  if (!session.ok) return session.response
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
  try {
    const result = await pollTicketMailbox()
    if (!result) return json({ ok: false, error: 'Mail credentials are not configured (MAIL_GRAPH_CLIENT_SECRET).' }, 503)
    return json({ ok: true, ...result })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
}
