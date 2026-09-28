/**
 * Orbit 2 — who is using the module, and what they are allowed to override.
 *
 * Two things depend on this: Remarks and Team Comments stamp the author's name,
 * and the two statuses the mobile app owns ("Working On It", "Complete") may
 * only be set by hand by an Orbit 2 admin.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ORBIT2_ADMINS } from "./orbit2-constants";

export type Orbit2Identity = {
  /** The name written into Remarks and Team Comments. */
  name: string;
  /** May override a status the field crew normally sets from the mobile app. */
  isAdmin: boolean;
};

/**
 * The spec names three people who may override a status: Lovin, Rusty and Keith.
 * Those are operations names, not Polaris accounts, so the match is on the
 * signed-in user's display name. A platform administrator also qualifies —
 * someone who can already edit every record in the module should not be locked
 * out of correcting a status in it.
 */
export function useOrbit2Identity(): Orbit2Identity {
  const { user } = useAuth();
  const [identity, setIdentity] = useState<Orbit2Identity>({ name: "", isAdmin: false });

  useEffect(() => {
    let on = true;
    if (!user?.id) return;
    const fallback = (user.email ?? "user").split("@")[0];

    (supabase as any)
      .from("user_profiles")
      .select("display_name, roles:role_id(name)")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (!on) return;
        const name = (data?.display_name as string | undefined)?.trim() || fallback;
        const role = (data?.roles?.name as string | undefined) ?? "";
        const firstName = name.split(/\s+/)[0].toLowerCase();
        setIdentity({
          name,
          isAdmin:
            ORBIT2_ADMINS.some((a) => a.toLowerCase() === firstName) ||
            ["global_admin", "platform_owner"].includes(role),
        });
      });

    return () => { on = false; };
  }, [user?.id, user?.email]);

  return identity;
}
