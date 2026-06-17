import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FlagStage = "dev" | "beta" | "live";

export type FeatureFlag = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  stage: FlagStage;
  released_at: string | null;
  created_at: string;
  updated_at: string;
};

export const STAGE_META: Record<FlagStage, { label: string; description: string; colour: string }> = {
  dev:  { label: "Dev Only", description: "Not visible to end users — dev team only", colour: "#f59e0b" },
  beta: { label: "Beta",     description: "Released to end users with a Beta badge",   colour: "#3b82f6" },
  live: { label: "Live",     description: "Fully released — no badge shown",           colour: "#22c55e" },
};

const KEY = ["feature-flags"] as const;

export function useFeatureFlags() {
  return useQuery({
    queryKey: KEY,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("feature_flags").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as FeatureFlag[];
    },
  });
}

/** key → flag, for quick gating lookups. */
export function useFlagMap(): { map: Map<string, FeatureFlag>; loading: boolean } {
  const { data, isLoading } = useFeatureFlags();
  const map = new Map<string, FeatureFlag>((data ?? []).map((f) => [f.key, f]));
  return { map, loading: isLoading };
}

export function useSetFlagStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: FlagStage }) => {
      const patch: Record<string, unknown> = { stage, updated_at: new Date().toISOString() };
      if (stage === "beta" || stage === "live") patch.released_at = new Date().toISOString();
      const { error } = await (supabase as any).from("feature_flags").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; name: string; description?: string; icon?: string }) => {
      const { error } = await (supabase as any).from("feature_flags").insert({
        key: input.key.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        icon: input.icon || "🚀",
        stage: "dev",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("feature_flags").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
