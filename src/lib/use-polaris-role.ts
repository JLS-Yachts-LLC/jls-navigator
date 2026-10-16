/**
 * Resolve the PolarisRole that drives shell nav visibility.
 *
 * Restricted roles (logistics_team, hr) get a scoped nav; every other
 * role keeps the current full-nav behaviour ("global_admin" preview default —
 * real per-role enforcement for the rest lands with the RBAC rollout).
 *
 * Order of precedence:
 *  1. An active "View as" preview whose role is a restricted role.
 *  2. A "View as" preview of a staff member — their restricted role, if any.
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
    if (!user?.id) return;
    (supabase as any)
      .from("user_profiles")
      .select("roles:role_id(name)")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        const name = data?.roles?.name as string | undefined;
        if (on && name && (RESTRICTED_ROLES as string[]).includes(name)) {
          setOwnRole(name as PolarisRole);
        }
      });
    return () => { on = false; };
  }, [user?.id]);

  // Admin previewing a restricted role sees that role's scoped nav.
  if (viewAs && (RESTRICTED_ROLES as string[]).includes(viewAs)) return viewAs as PolarisRole;
  // Admin previewing a staff member (View as → a person) gets their role's nav.
  if (previewing) {
    const r = claims.roleName;
    return r && (RESTRICTED_ROLES as string[]).includes(r) ? (r as PolarisRole) : "global_admin";
  }
  return ownRole;
}
