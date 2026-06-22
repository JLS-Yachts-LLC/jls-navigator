import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DEVELOPER_EMAILS } from "@/lib/leo-access";

export type DevUser = { user_id: string; note: string | null; granted_at: string };

/** Admin-tier roles (in the roles catalog) that grant dev-stage visibility. */
const DEV_ACCESS_ROLES = ["global_admin", "org_admin", "platform_owner", "developer"];

/**
 * Whether the current viewer can see dev-stage features. True when the user is:
 *  - on the built-in developer allow-list (leo-access), OR
 *  - assigned an admin-tier role in user_profiles (global_admin / org_admin /
 *    platform_owner / developer), OR
 *  - explicitly granted the Dev role (dev_users).
 */
export function useDevAccess(): boolean {
  const { user } = useAuth();
  const email = (user?.email ?? "").toLowerCase().trim();
  const isDevEmail = !!email && DEVELOPER_EMAILS.includes(email);

  const { data: granted = false } = useQuery({
    queryKey: ["dev-access", user?.id],
    enabled: !!user && !isDevEmail,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const db = supabase as any;
      const [{ data: profile }, { data: dev }] = await Promise.all([
        db.from("user_profiles").select("roles:role_id(name)").eq("user_id", user!.id).maybeSingle(),
        db.from("dev_users").select("user_id").eq("user_id", user!.id).maybeSingle(),
      ]);
      const roleName = (profile as any)?.roles?.name as string | undefined;
      return (!!roleName && DEV_ACCESS_ROLES.includes(roleName)) || !!dev;
    },
  });

  return isDevEmail || granted;
}

export function useDevUsers() {
  return useQuery({
    queryKey: ["dev-users"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dev_users").select("user_id, note, granted_at").order("granted_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as DevUser[];
    },
  });
}

export function useGrantDevRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, note }: { userId: string; note?: string }) => {
      const { error } = await (supabase as any).from("dev_users")
        .upsert({ user_id: userId, note: note ?? null }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dev-users"] }),
  });
}

export function useRevokeDevRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase as any).from("dev_users").delete().eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dev-users"] }),
  });
}
