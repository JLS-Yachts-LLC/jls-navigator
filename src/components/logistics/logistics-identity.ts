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
 *
 * Until then, someone who is both an office administrator and a driver is named
 * in LOGISTICS_ADMIN_EMAILS and sees every module (and still counts as a driver
 * for the Deliveries screen). Matched on email, never a first name.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { ShipSyncDriver } from "@/lib/shipsync/model";

/** Drivers who also run the logistics office — never limited to the Deliveries tile. Lower-case. */
const LOGISTICS_ADMIN_EMAILS = ["j.lopez@jlsyachts.com"];

export type LogisticsIdentity = {
  loading: boolean;
  /** Upper-cased first name for the "HI JON" greeting. */
  greeting: string;
  /** Display name as stored on the Polaris profile — what gets stamped on records. */
  name: string;
  driver: ShipSyncDriver | null;
  /** Sees only the Deliveries tile. */
  driverOnly: boolean;
  /** The driver check could not be made (a bad connection): shown the Deliveries tile only, with a prompt to retry. */
  lookupFailed: boolean;
};

/**
 * The active driver record for this login — by user, then by email (with _ and % in an
 * address matched literally). A failed lookup is reported as failed, NOT as "not a driver":
 * reading an error as "no driver record" used to hand a driver every admin tile.
 */
export async function lookupDriver(userId: string, email: string | null): Promise<{ driver: ShipSyncDriver | null; failed: boolean }> {
  const sb = supabase as any;
  const byUser = await sb.from("shipsync_drivers").select("*").eq("user_id", userId).eq("active", true).limit(1);
  if (byUser.error) return { driver: null, failed: true };
  if (byUser.data?.[0]) return { driver: byUser.data[0] as ShipSyncDriver, failed: false };
  if (!email) return { driver: null, failed: false };
  const exact = email.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const byEmail = await sb.from("shipsync_drivers").select("*").ilike("email", exact).eq("active", true).limit(1);
  if (byEmail.error) return { driver: null, failed: true };
  return { driver: (byEmail.data?.[0] as ShipSyncDriver | undefined) ?? null, failed: false };
}

export function useLogisticsIdentity(): LogisticsIdentity {
  const { user } = useAuth();
  const [state, setState] = useState<LogisticsIdentity>({
    loading: true, greeting: "", name: "", driver: null, driverOnly: false, lookupFailed: false,
  });

  useEffect(() => {
    let on = true;
    if (!user?.id) return;
    const fallback = (user.email ?? "user").split("@")[0];

    void (async () => {
      const [{ data: profile }, driver] = await Promise.all([
        (supabase as any).from("user_profiles").select("display_name, roles:role_id(name)").eq("user_id", user.id).maybeSingle(),
        lookupDriver(user.id, user.email ?? null).catch(() => ({ driver: null, failed: true })).then(async (r) => (r.failed ? lookupDriver(user.id, user.email ?? null).catch(() => r) : r)),
      ]);
      if (!on) return;
      const name = (profile?.display_name as string | undefined)?.trim() || fallback;
      const role = (profile?.roles?.name as string | undefined) ?? "";
      const emails = [user.email, driver.driver?.email].map((e) => (e ?? "").trim().toLowerCase());
      const platformAdmin = ["global_admin", "platform_owner"].includes(role) || emails.some((e) => LOGISTICS_ADMIN_EMAILS.includes(e));
      setState({
        loading: false,
        name,
        greeting: name.split(/\s+/)[0].toUpperCase(),
        driver: driver.driver,
        // If we couldn't tell whether this is a driver, show the safe screen rather than guess.
        driverOnly: (Boolean(driver.driver) || driver.failed) && !platformAdmin,
        lookupFailed: driver.failed && !platformAdmin,
      });
    })();

    return () => { on = false; };
  }, [user?.id, user?.email]);

  return state;
}
