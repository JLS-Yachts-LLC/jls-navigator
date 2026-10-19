/**
 * Server-side identity for Crew Academy (POLARIS_CREW_ACADEMY.md).
 *
 *   resolveLearner(request) — the caller is an ACTIVE Crew Academy learner: one
 *                             person on one vessel. Every learner request starts
 *                             here; nothing a learner sees is read any other way.
 *
 * No academy table has a permissive RLS policy — learners, vessel managers and
 * JLS staff all come through /api/academy* routes, which run with the service
 * role. So the check here IS the boundary: after it, every query must stay
 * inside the learner's own vessel and their own enrolments.
 */
import { createClient } from "@supabase/supabase-js";

export function academyAdmin(): any {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export type LearnerCaller = {
  learnerId: string;
  userId: string;
  yachtId: string;
  vesselName: string;
  vesselLogo: string | null;
  email: string;
  displayName: string | null;
  crewMemberId: string | null;
};

type Denied = { ok: false; response: Response };

async function userFromRequest(sb: any, request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const { data, error } = await sb.auth.getUser(auth.slice(7));
  if (error || !data?.user) return null;
  return data.user as { id: string; email?: string };
}

export async function resolveLearner(request: Request): Promise<{ ok: true; learner: LearnerCaller; sb: any } | Denied> {
  const sb = academyAdmin();
  const user = await userFromRequest(sb, request);
  if (!user) return { ok: false, response: json({ error: "Please sign in again." }, 401) };

  // At most one active row per login (unique index), so this is "their vessel".
  const { data: row } = await sb.from("academy_learners")
    .select("id, yacht_id, crew_member_id, email, display_name, yachts(vessel_name, logo_url)")
    .eq("user_id", user.id).eq("active", true).maybeSingle();
  if (!row) {
    return { ok: false, response: json({ error: "This login doesn't have Crew Academy access." }, 403) };
  }
  return {
    ok: true, sb,
    learner: {
      learnerId: row.id,
      userId: user.id,
      yachtId: row.yacht_id,
      vesselName: row.yachts?.vessel_name ?? "",
      vesselLogo: row.yachts?.logo_url ?? null,
      email: row.email,
      displayName: row.display_name ?? null,
      crewMemberId: row.crew_member_id ?? null,
    },
  };
}
