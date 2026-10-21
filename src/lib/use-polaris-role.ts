/**
 * Resolve the PolarisRole that drives shell nav visibility.
 *
 * Restricted roles (logistics_team, hr) get a scoped nav; every other
 * role keeps the current full-nav behaviour ("global_admin" preview default â
 * real per-role enforcement for the rest lands with the RBAC rollout).
 *
 * Order of precedence:
 *  1. An active "View as" preview whose role is a restricted role.
 *  2. A "View as" preview of a staff member â their restricted role, if any.
 *  3. The signed-in user's own user_profiles role.
 *  4. Fallback: global_admin (unchanged behaviour).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewAsRole } from "@/lib/view-as";
import { useAccess } from "@/lib/auth/useAccess";
import type { PolarisRole } from "@/components/polaris-ui/shell";

const RESTRICTED_ROLES: PolarisRole[] = ["logistics_team", "hr"];

export function usePolarisRole(): PolarisRole {
  const { user } = useAuth();
  const viewAs = useViewAsRole();
  const { previewing, claims } = useAccess();
  const [ownRole, setOwnRole] = useState<PolarisRole>("global_admin");

  useEffect(() => {
    let on = true;
    // Reset to the permissive default whenever the signed-in user changes (e.g.
    // sign-out/sign-in as someone else in the same tab) so a stale restricted
    // role from a previous user can't linger.
    setOwnRole("global_admin");
    if (!user?.id) return;
    (supabase as any)
      .from("user_profiles")
      .select("roles:role_id(name)")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }: any) => {
        if (error) {
          // Surface role-resolution failures instead of failing silently. A
          // user whose profile/role lookup errors (missing row, broken join,
          // RLS denial) previously just kept whatever role was already set,
          // which hides exactly the kind of staff-provisioning gap that can
          // cause downstream "Polaris staff only" rejections (SD-0074).
          console.error("usePolarisRole: failed to resolve role", error);
          return;
        }
        const name = data?.roles?.name as string | undefined;
        if (on && name && (RESTRICTED_ROLES as string[]).includes(name)) {
          setOwnRole(name as PolarisRole);
        }
      });
    return () => { on = false; };
  }, [user?.id]);

  // Admin previewing a restricted role sees that role's scoped nav.
  if (viewAs && (RESTRICTED_ROLES as string[]).includes(viewAs)) return viewAs as PolarisRole;
  // Admin previewing a staff member (View as â a person) gets their role's nav.
  if (previewing) {
    const r = claims.roleName;
    return r && (RESTRICTED_ROLES as string[]).includes(r) ? (r as PolarisRole) : "global_admin";
  }
  return ownRole;
}
