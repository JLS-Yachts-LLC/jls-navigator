/**
 * Ask the server to email a ticket's requester (and, on "created", the support
 * mailbox) from itsupport@jlsyachts.com.
 *
 * The endpoint requires a signed-in staff member, so this sends the session
 * token. It sends no message text: the server reads what to say from the ticket
 * itself, so a reply email can only ever contain a reply that was really posted.
 *
 * Fire-and-forget — a failed notification must never block saving the ticket.
 */
import { supabase } from "@/integrations/supabase/client";

export type TicketEvent = "created" | "reply" | "resolved";

export function notifyTicket(ticketId: string, event: TicketEvent): void {
  void (async () => {
    try {
      const { data: { session } } = await (supabase as any).auth.getSession();
      if (!session?.access_token) return; // not signed in: the server would refuse anyway
      await fetch("/api/it-tickets/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ticketId, event }),
      });
    } catch { /* fire-and-forget */ }
  })();
}
