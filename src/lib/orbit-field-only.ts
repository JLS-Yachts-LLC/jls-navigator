/**
 * Orbit field crew — the `orbit_field` role — may use the Orbit 2 mobile app
 * (/orbit-app) and nothing else. Any other part of Polaris they open (the New
 * View, the Old View, the Logistics app) sends them straight to the field app.
 *
 * Same approach as portal captains in AppLayout: the redirect lands them
 * somewhere useful; the field app itself needs only a session and a roster name.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ORBIT_FIELD_PATH } from "@/components/orbit2/orbit2-constants";

export const ORBIT_FIELD_ROLE = "orbit_field";

/** True once the signed-in user is known to be field-only (they are being sent
 *  to the field app); callers render a spinner instead of their page. */
export function useOrbitFieldOnlyRedirect(): boolean {
  const { user } = useAuth();
  const [fieldOnly, setFieldOnly] = useState(false);

  useEffect(() => {
    let on = true;
    if (!user?.id) return;
    (supabase as any)
      .from("user_profiles")
      .select("roles:role_id(name)")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (on && data?.roles?.name === ORBIT_FIELD_ROLE) {
          setFieldOnly(true);
          window.location.replace(ORBIT_FIELD_PATH);
        }
      });
    return () => { on = false; };
  }, [user?.id]);

  return fieldOnly;
}
