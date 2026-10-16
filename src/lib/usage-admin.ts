import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Whether the signed-in person may see Staff Usage: a global admin or
 * has_role(admin) — the same is_usage_admin() rule the report itself enforces.
 * False while loading, so the menu item and page never flash for anyone else.
 */
export function useIsUsageAdmin(): { allowed: boolean; loading: boolean } {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["is-usage-admin", user?.id],
    enabled: !!user,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("is_usage_admin");
      if (error) return false;
      return data === true;
    },
  });
  return { allowed: data === true, loading: !!user && isLoading };
}
