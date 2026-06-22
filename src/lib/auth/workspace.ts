/**
 * POLARIS — Workspace routing engine.  Ticket #138.
 *
 * A "workspace" is the org/vessel/module context a user picks after login when
 * they have access to more than one. POLARIS_PLATFORM_UX.md §1.3 + the routing
 * extension (§ "lib/auth/routing.ts — extend with workspace context").
 *
 * Builds on the claims layer (#130 workaround) and getLandingPath (#131).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PolarisClaims } from "@/lib/auth/claims";

export interface WorkspaceContext {
  type: "organisation" | "vessel" | "module";
  id: string;
  label: string;
  sub?: string;
}

/** Module → portal route. Mirrors POLARIS_PLATFORM_UX.md getModulePath(). */
const MODULE_PORTAL: Record<string, string> = {
  agency: "/portal/agency",
  superyacht_me: "/portal/agency",
  shipsync: "/portal/shipsync",
  waypoint: "/portal/waypoint",
  crew_portal: "/portal/crew",
  crew_placement: "/portal/crew-placement",
  training: "/portal/training",
  finance: "/portal/finance",
};

const MODULE_LABEL: Record<string, string> = {
  agency: "Agency & Destinations",
  shipsync: "ShipSync",
  waypoint: "Waypoint",
  crew_placement: "Crew Placement",
  training: "JLS Yacht Training",
  finance: "Finance",
};

/** Which vessel-dashboard variant a role lands on. */
export function getDashboardType(role: string | null): string {
  const map: Record<string, string> = {
    captain: "captain", senior_crew: "captain",
    crew_member: "crew",
    owner: "owner", family_office: "owner",
    crew_manager: "operations", technical_mgr: "technical",
  };
  return (role && map[role]) || "overview";
}

export function getModulePath(moduleId: string): string {
  return MODULE_PORTAL[moduleId] ?? "/dashboard";
}

/** The intended landing path for a chosen workspace. */
export function getWorkspaceLandingPath(claims: PolarisClaims, ws: WorkspaceContext): string {
  switch (ws.type) {
    case "organisation": return `/dashboard/location/${ws.id}`;
    case "vessel":       return `/dashboard/vessel/${ws.id}/${getDashboardType(claims.roleName)}`;
    case "module":       return getModulePath(ws.id);
    default:             return "/dashboard";
  }
}

/** Routes that actually exist today — keep in sync with claims.ts BUILT_ROUTES. */
const BUILT_ROUTES = new Set<string>(["/dashboard"]);

/** getWorkspaceLandingPath, but never returns a not-yet-built route (#139–#144). */
export function resolveWorkspaceLandingPath(claims: PolarisClaims, ws: WorkspaceContext): string {
  const target = getWorkspaceLandingPath(claims, ws);
  return BUILT_ROUTES.has(target) ? target : "/dashboard";
}

/**
 * The workspaces this user can enter, derived from their access rows.
 * Reads through the authenticated client (RLS scopes to the user's own rows).
 */
export async function getAvailableWorkspaces(sb: SupabaseClient, claims: PolarisClaims): Promise<WorkspaceContext[]> {
  if (!claims.userId) return [];
  const out: WorkspaceContext[] = [];

  // Organisations / regional offices — from user_location_access.
  const { data: locs } = await (sb as any)
    .from("user_location_access")
    .select("location_id, locations:location_id(name, country_code)")
    .eq("user_id", claims.userId);
  for (const l of locs ?? []) {
    out.push({ type: "organisation", id: l.location_id, label: l.locations?.name ?? "Office", sub: l.locations?.country_code ?? undefined });
  }

  // Vessels — from claims.vesselIds, labelled from yachts.
  if (claims.vesselIds.length) {
    const { data: ys } = await (sb as any)
      .from("yachts").select("id, vessel_name, vessel_type").in("id", claims.vesselIds);
    for (const y of ys ?? []) {
      out.push({ type: "vessel", id: y.id, label: y.vessel_name ?? "Vessel", sub: y.vessel_type ?? undefined });
    }
  }

  // Module portals the user can enter.
  for (const m of claims.moduleNames) {
    if (MODULE_PORTAL[m]) out.push({ type: "module", id: m, label: MODULE_LABEL[m] ?? m });
  }
  return out;
}

// ─── Selected-workspace session storage ───────────────────────────────────────

const STORAGE_KEY = "polaris.workspace";

export function storeWorkspace(ws: WorkspaceContext): void {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ws)); } catch { /* ignore */ }
}

export function getStoredWorkspace(): WorkspaceContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkspaceContext) : null;
  } catch { return null; }
}

export function clearWorkspace(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
