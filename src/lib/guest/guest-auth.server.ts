/**
 * Server-side identity for the guest feature.
 *
 *   resolveGuest(request)  — the caller is an ACTIVE guest login. Every /api/guest
 *                            request starts here; nothing a guest sees is read
 *                            any other way.
 *   requireStaff(request)  — the caller is a staff member (has a user_profiles
 *                            row) and NOT a portal captain or guest. Sharing is
 *                            open to any staff member, like the documents are.
 *
 * Both run with the service role afterwards, so the check here IS the boundary.
 */
import { createClient } from "@supabase/supabase-js";
import { isLive, type GuestShare, type TreeFolder } from "@/lib/guest/shares";

export function guestAdmin(): any {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export type GuestCaller = {
  guestId: string;
  userId: string;
  email: string;
  displayName: string | null;
  groupIds: string[];
};

export type StaffCaller = { userId: string; email: string; name: string };

type Denied = { ok: false; response: Response };

async function userFromRequest(sb: any, request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const { data, error } = await sb.auth.getUser(auth.slice(7));
  if (error || !data?.user) return null;
  return data.user as { id: string; email?: string };
}

export async function resolveGuest(request: Request): Promise<{ ok: true; guest: GuestCaller; sb: any } | Denied> {
  const sb = guestAdmin();
  const user = await userFromRequest(sb, request);
  if (!user) return { ok: false, response: json({ error: "Please sign in again." }, 401) };

  const { data: acct } = await sb.from("guest_accounts")
    .select("id, email, display_name, active").eq("user_id", user.id).maybeSingle();
  if (!acct || !acct.active) {
    return { ok: false, response: json({ error: "This login is not an active guest account." }, 403) };
  }
  const { data: groups } = await sb.from("guest_group_members").select("group_id").eq("guest_id", acct.id);
  return {
    ok: true, sb,
    guest: {
      guestId: acct.id, userId: user.id, email: acct.email,
      displayName: acct.display_name ?? null,
      groupIds: (groups ?? []).map((g: any) => g.group_id),
    },
  };
}

/** True when this auth user is a Client Portal captain or a guest — never staff. */
export async function isOutsideLogin(sb: any, userId: string): Promise<boolean> {
  const [{ data: cap }, { data: guest }] = await Promise.all([
    sb.from("captain_accounts").select("id").eq("user_id", userId).eq("active", true).limit(1),
    sb.from("guest_accounts").select("id").eq("user_id", userId).eq("active", true).limit(1),
  ]);
  return !!cap?.length || !!guest?.length;
}

export async function requireStaff(request: Request): Promise<{ ok: true; staff: StaffCaller; sb: any } | Denied> {
  const sb = guestAdmin();
  const user = await userFromRequest(sb, request);
  if (!user) return { ok: false, response: json({ error: "Unauthorized" }, 401) };
  const [{ data: profile }, outside] = await Promise.all([
    sb.from("user_profiles").select("display_name, email").eq("user_id", user.id).maybeSingle(),
    isOutsideLogin(sb, user.id),
  ]);
  if (!profile || outside) return { ok: false, response: json({ error: "Forbidden" }, 403) };
  return {
    ok: true, sb,
    staff: { userId: user.id, email: user.email ?? profile.email ?? "", name: profile.display_name ?? user.email ?? "Staff" },
  };
}

/** The whole Training folder tree — a few hundred rows, cheap to hold in memory. */
export async function loadFolderTree(sb: any): Promise<{ folders: TreeFolder[]; byId: Map<string, TreeFolder> }> {
  const folders: TreeFolder[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("training_document_folders")
      .select("id, name, parent_id").order("name").range(from, from + 999);
    if (error) throw error;
    folders.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { folders, byId: new Map(folders.map((f) => [f.id, f])) };
}

/** Every share that currently grants this guest anything, directly or through a group. */
export async function liveSharesFor(sb: any, guest: GuestCaller): Promise<GuestShare[]> {
  const filters = [`guest_id.eq.${guest.guestId}`];
  if (guest.groupIds.length) filters.push(`group_id.in.(${guest.groupIds.join(",")})`);
  const { data, error } = await sb.from("guest_shares").select("*")
    .is("revoked_at", null).or(filters.join(","));
  if (error) throw error;
  return ((data ?? []) as GuestShare[]).filter((s) => isLive(s));
}
