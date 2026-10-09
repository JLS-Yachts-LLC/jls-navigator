/**
 * Who may call the ShipSync server endpoints (delivery-note PDFs, proof-of-delivery
 * and receipt emails, SharePoint sync).
 *
 * These run with the service role, which bypasses the database's row-level security, so
 * the endpoint itself has to decide. It used to accept ANY signed-in account — including a
 * client-portal captain — which could build any delivery note's PDF, email a proof of
 * delivery to any address, or start a SharePoint sync.
 *
 *   • Staff with ShipSync access (at the level asked for), and global admins: allowed.
 *   • A driver (an active shipsync_drivers record): allowed ONLY for routes that say drivers
 *     may, and only for a delivery note that is theirs.
 *   • Everyone else, and every client-portal captain: refused.
 */
import { createClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/auth/requireAccess.server";
import type { PermissionLevel } from "@/lib/auth/claims";

export type ShipSyncAccess = { ok: true; userId: string; via: "staff" | "driver" } | { ok: false; response: Response };

const deny = (status: number, error: string): ShipSyncAccess => ({
  ok: false, response: new Response(JSON.stringify({ ok: false, error }), { status, headers: { "Content-Type": "application/json" } }),
});

function admin() {
  return createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
}

export async function authorizeShipSync(
  request: Request,
  opts: { level?: PermissionLevel; /** drivers may call this route */ driverOk?: boolean; /** the delivery note being acted on */ noteId?: string } = {},
): Promise<ShipSyncAccess> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return deny(401, "Unauthorized");
  const sb = admin();
  const { data: { user }, error } = await sb.auth.getUser(auth.slice(7));
  if (error || !user) return deny(401, "Unauthorized");

  // A client-portal captain is never staff or a driver here, whatever else the account carries.
  const { data: captain } = await sb.from("captain_accounts").select("id").eq("user_id", user.id).eq("active", true).limit(1);
  if (captain?.length) return deny(403, "Client-portal accounts cannot use this");

  const staff = await requireAccess(request, { module: "shipsync", level: opts.level ?? "view" });
  if (staff.ok) return { ok: true, userId: user.id, via: "staff" };

  if (opts.driverOk) {
    let driver: { id: string } | null = null;
    const byUser = await sb.from("shipsync_drivers").select("id").eq("user_id", user.id).eq("active", true).limit(1);
    driver = (byUser.data?.[0] as { id: string } | undefined) ?? null;
    if (!driver && user.email) {
      const exact = user.email.replace(/[\\%_]/g, (c) => `\\${c}`);
      const byEmail = await sb.from("shipsync_drivers").select("id").ilike("email", exact).eq("active", true).limit(1);
      driver = (byEmail.data?.[0] as { id: string } | undefined) ?? null;
    }
    if (driver) {
      if (!opts.noteId) return { ok: true, userId: user.id, via: "driver" };
      const { data: note } = await sb.from("shipsync_delivery_notes").select("driver_id").eq("id", opts.noteId).maybeSingle();
      if (note && (note as { driver_id: string | null }).driver_id === driver.id) return { ok: true, userId: user.id, via: "driver" };
    }
  }
  return deny(403, "You don't have access to this");
}
