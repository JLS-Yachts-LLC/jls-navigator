/**
 * POLARIS — Access claims (client-side derivation).
 *
 * This is the in-app replacement for the JWT-custom-claims Edge Function (#130),
 * which is intentionally NOT deployed (Edge Functions are disabled for now).
 * Instead of reading claims off `app_metadata` in the token, we DERIVE the same
 * shape at runtime from the access-control tables created in #128:
 *   user_profiles → roles, user_vessel_access, user_module_access.
 *
 * The result mirrors the `app_metadata` contract from POLARIS_ACCESS_CONTROL.md
 * §5 so that, if/when the Edge Function is later enabled, call sites need not
 * change — only the `deriveClaims` source flips from DB to token.
 *
 * Resilient by design: `user_profiles` is empty during rollout, so unknown users
 * fall back to a sensible default (developer emails / existing admin role →
 * global admin) and the app keeps working.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { DEVELOPER_EMAILS } from "@/lib/leo-access";

/** Roles that get unrestricted platform access. */
export const GLOBAL_ADMIN_ROLES = ["global_admin", "platform_owner", "developer"] as const;

export type PermissionLevel = "view" | "create" | "edit" | "approve" | "finance" | "admin";
export const PERMISSION_ORDER: PermissionLevel[] = ["view", "create", "edit", "approve", "finance", "admin"];

export interface PolarisClaims {
  userId: string;
  email: string;
  displayName: string | null;
  roleName: string | null;          // roles.name e.g. 'captain', 'crew_member'
  roleId: string | null;
  orgId: string | null;
  locationId: string | null;
  vesselIds: string[];
  moduleNames: string[];
  moduleLevels: Record<string, PermissionLevel>;
  isGlobalAdmin: boolean;
  mfaEnabled: boolean;
  active: boolean;
  /** Where the claims came from — useful while user_profiles is being populated. */
  source: "user_profiles" | "developer_fallback" | "admin_role_fallback" | "none";
}

export const ANON_CLAIMS: PolarisClaims = {
  userId: "", email: "", displayName: null, roleName: null, roleId: null,
  orgId: null, locationId: null, vesselIds: [], moduleNames: [], moduleLevels: {},
  isGlobalAdmin: false, mfaEnabled: false, active: false, source: "none",
};

// Normalise the divergent role vocabularies in the codebase (the admin module
// uses short names like 'crew'/'vessel_owner'; the seeded roles table uses
// 'crew_member'/'owner'). getLandingPath understands both via this map.
const ROLE_ALIAS: Record<string, string> = {
  crew: "crew_member",
  vessel_owner: "owner",
  agency: "agency_user",
  port_agent: "agency_user",
  placement_user: "crew_placement",
};
const normRole = (r: string | null): string | null => (r ? ROLE_ALIAS[r] ?? r : null);

/**
 * Derive the current user's claims from the access-control tables.
 * Reads through the authenticated client (RLS lets a user read only their own
 * profile + access rows; roles/modules are readable by any authenticated user).
 */
export async function deriveClaims(sb: SupabaseClient, user: User): Promise<PolarisClaims> {
  const email = (user.email ?? "").toLowerCase();
  const base = { ...ANON_CLAIMS, userId: user.id, email };

  // 1. Canonical source: user_profiles row.
  const { data: profile } = await (sb as any)
    .from("user_profiles")
    .select("display_name, email, role_id, org_id, location_id, mfa_enabled, active, roles:role_id(name)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile) {
    const [vessels, modules] = await Promise.all([
      (sb as any).from("user_vessel_access").select("vessel_id, active").eq("user_id", user.id),
      (sb as any).from("user_module_access").select("permission_level, modules:module_id(name)").eq("user_id", user.id),
    ]);
    const roleName = normRole(profile.roles?.name ?? null);
    const moduleLevels: Record<string, PermissionLevel> = {};
    for (const m of modules.data ?? []) {
      if (m.modules?.name) moduleLevels[m.modules.name] = m.permission_level;
    }
    return {
      ...base,
      displayName: profile.display_name ?? null,
      email: profile.email ?? email,
      roleName,
      roleId: profile.role_id ?? null,
      orgId: profile.org_id ?? null,
      locationId: profile.location_id ?? null,
      vesselIds: (vessels.data ?? []).filter((v: any) => v.active !== false).map((v: any) => v.vessel_id),
      moduleNames: Object.keys(moduleLevels),
      moduleLevels,
      isGlobalAdmin: !!roleName && (GLOBAL_ADMIN_ROLES as readonly string[]).includes(roleName),
      mfaEnabled: !!profile.mfa_enabled,
      active: profile.active !== false,
      source: "user_profiles",
    };
  }

  // 2. No profile yet (rollout). Developer allow-list → full access.
  if (email && DEVELOPER_EMAILS.includes(email)) {
    return { ...base, roleName: "developer", isGlobalAdmin: true, active: true, source: "developer_fallback" };
  }

  // 3. Existing admin role in user_roles → treat as global admin.
  const { data: adminRow } = await (sb as any)
    .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (adminRow) {
    return { ...base, roleName: "global_admin", isGlobalAdmin: true, active: true, source: "admin_role_fallback" };
  }

  // 4. Authenticated but unscoped.
  return { ...base, active: true, source: "none" };
}

// ─── Permission helpers ───────────────────────────────────────────────────────

/** Cumulative check — 'edit' satisfies a 'view' requirement, etc. */
export function permissionMet(have: PermissionLevel | undefined, required: PermissionLevel): boolean {
  if (!have) return false;
  return PERMISSION_ORDER.indexOf(have) >= PERMISSION_ORDER.indexOf(required);
}

export function canAccessModule(claims: PolarisClaims, moduleName: string, required: PermissionLevel = "view"): boolean {
  if (claims.isGlobalAdmin) return true;
  return permissionMet(claims.moduleLevels[moduleName], required);
}

export function hasVesselAccess(claims: PolarisClaims, vesselId: string): boolean {
  return claims.isGlobalAdmin || claims.vesselIds.includes(vesselId);
}

// ─── Landing page routing (#131) ──────────────────────────────────────────────

/**
 * The post-login destination for a user, by role/scope. Mirrors
 * POLARIS_ACCESS_CONTROL.md §6, adapted to this app's TanStack routes.
 *
 * NOTE: some targets (vessel/location dashboards, stakeholder portals) are built
 * under tickets #139–#144. Until those exist, `resolveLandingPath` below degrades
 * any not-yet-built target to '/dashboard' so login never lands on a 404.
 */
export function getLandingPath(claims: PolarisClaims): string {
  const role = claims.roleName;
  const modules = claims.moduleNames;
  const onlyModule = (m: string) => modules.length === 1 && modules[0] === m;

  // Beta (Polaris redesign) is the default/main view for staff/admins.
  if (role && (GLOBAL_ADMIN_ROLES as readonly string[]).includes(role)) return "/polaris-redesign";
  if (role === "regional_admin") return claims.locationId ? `/dashboard/location/${claims.locationId}` : "/polaris-redesign";
  if (role === "captain" || role === "vessel_admin") {
    return claims.vesselIds[0] ? `/dashboard/vessel/${claims.vesselIds[0]}` : "/dashboard/vessel/unassigned";
  }
  if (role === "crew_member" || role === "senior_crew") return "/portal/crew";
  if (role === "owner" || role === "family_office") return "/portal/owner";
  if (role === "supplier" || role === "supplier_admin") return "/portal/supplier";
  if (onlyModule("training")) return "/portal/training";
  if (onlyModule("crew_placement")) return "/portal/crew-placement";
  if (onlyModule("finance")) return "/portal/finance";
  if (onlyModule("agency")) return "/portal/agency";
  if (role === "crew_manager" || role === "technical_mgr") {
    return claims.vesselIds[0] ? `/dashboard/vessel/${claims.vesselIds[0]}` : "/polaris-redesign";
  }
  return "/polaris-redesign";
}

/**
 * Whether a landing path corresponds to a route that actually exists today.
 * Extend as the remaining dashboards/portals (#144+) land. Shared by the
 * workspace engine so both degrade consistently.
 */
export function isBuiltRoute(path: string): boolean {
  if (path === "/polaris-redesign") return true;
  if (path === "/dashboard") return true;
  if (["/portal/crew", "/portal/owner", "/portal/supplier", "/portal/shipsync", "/portal/training"].includes(path)) return true;
  if (/^\/dashboard\/vessel\/[^/]+/.test(path)) return true;
  if (/^\/dashboard\/location\/[^/]+/.test(path)) return true;
  return false;
}

/** getLandingPath, but never returns a route that isn't built yet. */
export function resolveLandingPath(claims: PolarisClaims): string {
  const target = getLandingPath(claims);
  return isBuiltRoute(target) ? target : "/polaris-redesign";
}
