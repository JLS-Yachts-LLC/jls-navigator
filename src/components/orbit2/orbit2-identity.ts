/**
 * Orbit 2 — who is using the module, and what they are allowed to override.
 *
 * Two things depend on this: Remarks and Team Comments stamp the author's name,
 * and the admin-only controls (setting "Working On It" / "Complete - Team" from the
 * desktop, correcting a Remark) appear only for an Orbit 2 admin.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type Orbit2Identity = {
  /** The name written into Remarks and Team Comments. */
  name: string;
  /** May override the crew-owned statuses and correct Remarks. */
  isAdmin: boolean;
};

/**
 * Admin is asked of the database — `orbit2_is_admin()`, which is "Admin" on the
 * Orbit module in the Admin panel, or a global admin — rather than decided here.
 * The same function guards the writes (migration 20260928110000), so the page
 * can never offer a control the database would then refuse, or hide one it
 * would allow.
 *
 * It replaces a first-name match against Lovin, Rusty and Keith: none of them has
 * a Polaris account, so in practice nobody in the office qualified, and a name is
 * not a permission.
 */
export function useOrbit2Identity(): Orbit2Identity {
  const { user } = useAuth();
  const [identity, setIdentity] = useState<Orbit2Identity>({ name: "", isAdmin: false });

  useEffect(() => {
    let on = true;
    if (!user?.id) return;
    const fallback = (user.email ?? "user").split("@")[0];
    const sb = supabase as any;

    void Promise.all([
      sb.from("user_profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      sb.rpc("orbit2_is_admin"),
    ]).then(([profile, admin]: any[]) => {
      if (!on) return;
      setIdentity({
        name: (profile?.data?.display_name as string | undefined)?.trim() || fallback,
        // Anything but an explicit true — an error, a missing function — is "no".
        isAdmin: admin?.data === true,
      });
    });

    return () => { on = false; };
  }, [user?.id, user?.email]);

  return identity;
}
