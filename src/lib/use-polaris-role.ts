/**
 * Resolve the PolarisRole that drives shell nav visibility.
 *
 * Restricted roles (currently logistics_team) get a scoped nav; every other
 * role keeps the current full-nav behaviour ("global_admin" preview default —
 * real per-role enforcement for the rest lands with the RBAC rollout).
 *
 * Order of precedence:
 *  1. An active "View as" preview whose role is a restricted role.
 *  2. The signed-in user's own user_profiles role.
 *  3. Fallback: global_admin (unchanged behaviour).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewAsRole } from "@/lib/view-as";
import type { PolarisRole } from "@/components/polaris-ui/shell";

const RESTRICTED_ROLES: PolarisRole[] = ["logistics_team"];

export function usePolarisRole(): PolarisRole {
  const { user } = useAuth();
  const viewAs = useViewAsRole();
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
  return ownRole;
}
