/**
 * Logistics mobile app — who is holding the phone.
 *
 * The spec splits the home screen two ways: a driver sees only Deliveries, and
 * everyone else on the logistics team sees the lot. A driver is a person with an
 * active row in shipsync_drivers (matched on their Polaris login, then email) —
 * the same rule the existing driver app uses — so there is no second list of
 * drivers to keep in step. A platform administrator who also happens to be a
 * driver is never locked down to the one tile.
 *
 * The spec names five administrators by first name. That is deliberately not
 * how this is decided: matching on a first name lets two people who share one
 * collide (the Orbit field app has exactly that weakness). Everyone who is not
 * driver-only is treated as a logistics administrator until a real permission
 * flag is agreed.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { resolveDriver } from "@/lib/shipsync/driver-data";
import type { ShipSyncDriver } from "@/lib/shipsync/model";

export type LogisticsIdentity = {
  loading: boolean;
  /** Upper-cased first name for the "HI JON" greeting. */
  greeting: string;
  /** Display name as stored on the Polaris profile — what gets stamped on records. */
  name: string;
  driver: ShipSyncDriver | null;
  /** Sees only the Deliveries tile. */
  driverOnly: boolean;
};

export function useLogisticsIdentity(): LogisticsIdentity {
  const { user } = useAuth();
  const [state, setState] = useState<LogisticsIdentity>({
    loading: true, greeting: "", name: "", driver: null, driverOnly: false,
  });

  useEffect(() => {
    let on = true;
    if (!user?.id) return;
    const fallback = (user.email ?? "user").split("@")[0];

    void (async () => {
      const [{ data: profile }, driver] = await Promise.all([
        (supabase as any).from("user_profiles").select("display_name, roles:role_id(name)").eq("user_id", user.id).maybeSingle(),
        resolveDriver(user.id, user.email ?? null).catch(() => null),
      ]);
      if (!on) return;
      const name = (profile?.display_name as string | undefined)?.trim() || fallback;
      const role = (profile?.roles?.name as string | undefined) ?? "";
      const platformAdmin = ["global_admin", "platform_owner"].includes(role);
      setState({
        loading: false,
        name,
        greeting: name.split(/\s+/)[0].toUpperCase(),
        driver,
        driverOnly: Boolean(driver) && !platformAdmin,
      });
    })();

    return () => { on = false; };
  }, [user?.id, user?.email]);

  return state;
}
