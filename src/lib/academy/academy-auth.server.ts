/**
 * Server-side identity for Crew Academy (POLARIS_CREW_ACADEMY.md).
 *
 *   resolveLearner(request) — the caller is an ACTIVE Crew Academy learner: one
 *                             person on one vessel. Every learner request starts
 *                             here; nothing a learner sees is read any other way.
 *                             It also requires the second sign-in step (an
 *                             authenticator-app code or an emailed code).
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

/** The JWT payload (already verified by auth.getUser before it is trusted). */
function claimsOf(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
  } catch {
    return null;
  }
}

async function userFromRequest(sb: any, request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  const claims = claimsOf(token);
  return {
    user: data.user as { id: string; email?: string },
    aal: typeof claims?.aal === "string" ? claims.aal : "aal1",
    sessionId: typeof claims?.session_id === "string" ? claims.session_id : null,
  };
}

/**
 * Whether this sign-in has passed the second step: an authenticator-app code
 * (Supabase TOTP → the session is aal2) or an emailed code verified through
 * /api/academy/mfa (recorded against the session id).
 */
export async function mfaPassed(sb: any, userId: string, aal: string, sessionId: string | null): Promise<boolean> {
  if (aal === "aal2") return true;
  if (!sessionId) return false;
  const { data } = await sb.from("academy_mfa_sessions").select("session_id")
    .eq("session_id", sessionId).eq("user_id", userId).gt("expires_at", new Date().toISOString()).maybeSingle();
  return !!data;
}

export type ResolvedLearner = { ok: true; learner: LearnerCaller; sb: any; aal: string; sessionId: string | null; mfa: boolean };

/**
 * An ACTIVE learner. By default the second sign-in step must be done too; only
 * /api/academy/mfa (which performs that step) passes { mfa: false }.
 */
export async function resolveLearner(request: Request, opts: { mfa?: boolean } = {}): Promise<ResolvedLearner | Denied> {
  const sb = academyAdmin();
  const who = await userFromRequest(sb, request);
  if (!who) return { ok: false, response: json({ error: "Please sign in again." }, 401) };
  const { user } = who;

  // At most one active row per login (unique index), so this is "their vessel".
  const { data: row } = await sb.from("academy_learners")
    .select("id, yacht_id, crew_member_id, email, display_name, yachts(vessel_name, logo_url)")
    .eq("user_id", user.id).eq("active", true).maybeSingle();
  if (!row) {
    return { ok: false, response: json({ error: "This login doesn't have Crew Academy access." }, 403) };
  }
  const mfa = await mfaPassed(sb, user.id, who.aal, who.sessionId);
  if (opts.mfa !== false && !mfa) {
    return { ok: false, response: json({ error: "Finish the sign-in check first.", mfaRequired: true }, 403) };
  }
  return {
    ok: true, sb, aal: who.aal, sessionId: who.sessionId, mfa,
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
