/**
 * Resolve the PolarisRole that drives shell nav visibility.
 *
 * Restricted roles get a scoped nav (RESTRICTED_NAV in shell.tsx); every other
 * role keeps the current full-nav behaviour ("global_admin" preview default —
 * real per-role enforcement for the rest lands with the RBAC rollout).
 *
 *  - logistics_team — a user_profiles role.
 *  - port_bunkering — not a database role: anyone with the `orbit2_bunkering`
 *    module and no `orbit` (the Port Agency team). Their menu is just Orbit 2
 *    (Bunkering only) and the Bunkering screen. Their real role (jls_staff) is
 *    left alone, since API routes and permissions still key on it.
 *
 * Order of precedence:
 *  1. An active "View as" preview whose role is a restricted role.
 *  2. A "View as" preview of a staff member — their role / bunkering-only access.
 *  3. The signed-in user's own role / bunkering-only access.
 *  4. Fallback: global_admin (unchanged behaviour).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewAsRole } from "@/lib/view-as";
import { useAccess } from "@/lib/auth/useAccess";
import { canAccessModule, type PolarisClaims } from "@/lib/auth/claims";
import type { PolarisRole } from "@/components/polaris-ui/shell";

const RESTRICTED_ROLES: PolarisRole[] = ["logistics_team"];

/** Bunkering-only staff: the Orbit 2 Bunkering grant without full Orbit. */
const isPortBunkering = (c: PolarisClaims) =>
  !c.isGlobalAdmin && canAccessModule(c, "orbit2_bunkering") && !canAccessModule(c, "orbit");

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
  // Admin previewing a staff member (View as → a person) gets their nav.
  if (previewing) {
    const r = claims.roleName;
    if (r && (RESTRICTED_ROLES as string[]).includes(r)) return r as PolarisRole;
    return isPortBunkering(claims) ? "port_bunkering" : "global_admin";
  }
  if (ownRole !== "global_admin") return ownRole;
  return isPortBunkering(claims) ? "port_bunkering" : ownRole;
}
