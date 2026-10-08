/**
 * Staff just did something a client gets a phone notification about (wrote in
 * their chat, replied on or moved a request). The database already queued it;
 * this asks the server to send it now rather than at the next 5-minute tick.
 *
 * Sends nothing itself — the server reads the queue. Fire-and-forget: a failed
 * nudge only means the notification goes out a few minutes later.
 */
import { supabase } from "@/integrations/supabase/client";

export function nudgePortalPush(): void {
  void (async () => {
    try {
      const { data: { session } } = await (supabase as any).auth.getSession();
      if (!session?.access_token) return;
      await fetch("/api/portal/push/flush", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
    } catch { /* fire-and-forget */ }
  })();
}
