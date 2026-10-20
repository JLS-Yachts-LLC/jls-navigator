/**
 * Sidebar Favourites — each person pins menu items to a Favourites group at the
 * top of the left sidebar (user_sidebar_favourites, private to them, so the same
 * pins follow them to any device).
 *
 * A favourite is only the item's screen key: it's resolved against the items the
 * normal sidebar is showing right now, so a pin for a page someone can no longer
 * see (flag back on Dev, module access removed) simply doesn't appear — it comes
 * back if access does.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** The pinned items the person can see, in their order. */
export function resolveFavourites<T extends { screen: string }>(keys: readonly string[], visible: readonly T[]): T[] {
  const byScreen = new Map(visible.map((i) => [i.screen, i]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const k of keys) {
    const item = byScreen.get(k);
    if (item && !seen.has(k)) { seen.add(k); out.push(item); }
  }
  return out;
}

/** Pin (to the end) or unpin. */
export function toggleFavourite(keys: readonly string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
}

/** Move one pin up (-1) or down (+1) among the pins the person can see; hidden
 *  pins keep their place in the saved list. */
export function moveFavourite(keys: readonly string[], key: string, dir: -1 | 1, visible: ReadonlySet<string>): string[] {
  const shown = keys.filter((k) => visible.has(k));
  const at = shown.indexOf(key);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= shown.length) return [...keys];
  return dropFavourite(keys, key, shown[to], dir > 0 ? "after" : "before");
}

/** Drag-and-drop: put `key` just before or after `target`. */
export function dropFavourite(keys: readonly string[], key: string, target: string, where: "before" | "after"): string[] {
  if (key === target || !keys.includes(key) || !keys.includes(target)) return [...keys];
  const rest = keys.filter((k) => k !== key);
  const i = rest.indexOf(target) + (where === "after" ? 1 : 0);
  return [...rest.slice(0, i), key, ...rest.slice(i)];
}

const qk = (uid: string | null | undefined) => ["sidebar-favourites", uid] as const;

/** This person's pinned screen keys (in order) and a setter that saves them. */
export function useSidebarFavourites(userId: string | null | undefined) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: qk(userId),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any)
        .from("user_sidebar_favourites")
        .select("item_key")
        .order("position")
        .order("created_at");
      if (error) throw error;
      return ((data ?? []) as { item_key: string }[]).map((r) => r.item_key);
    },
  });
  const keys = data ?? [];

  const save = useCallback(
    async (next: string[]) => {
      if (!userId) return;
      const prev = qc.getQueryData<string[]>(qk(userId));
      qc.setQueryData(qk(userId), next); // show it straight away
      const { error } = await (supabase as any).rpc("set_my_sidebar_favourites", { p_keys: next });
      if (error) {
        qc.setQueryData(qk(userId), prev);
        toast.error("Couldn't save your Favourites — please try again.");
        void qc.invalidateQueries({ queryKey: qk(userId) });
      }
    },
    [qc, userId],
  );

  return { keys, save };
}
