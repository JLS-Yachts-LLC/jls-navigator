/**
 * Feature Release badges — small lifecycle pills (Beta / In Dev / Active) shown
 * against sidebar nav items. Admins set them under Settings → Feature Release
 * (persisted in the `feature_badges` table, keyed by the shell `screen` key).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BadgeKind = "beta" | "in_development" | "active";

export const BADGE_META: Record<BadgeKind, { label: string; bg: string; color: string; border: string }> = {
  beta:           { label: "Beta",   bg: "rgba(69,144,186,0.18)",  color: "#7cc0e6", border: "rgba(69,144,186,0.45)" },
  in_development: { label: "In Dev", bg: "rgba(232,160,32,0.18)",  color: "#e8b04a", border: "rgba(232,160,32,0.45)" },
  active:         { label: "Active", bg: "rgba(29,158,117,0.18)",  color: "#3fcf8e", border: "rgba(29,158,117,0.45)" },
};

export const BADGE_OPTIONS: { value: "none" | BadgeKind; label: string }[] = [
  { value: "none", label: "No badge" },
  { value: "beta", label: "Beta" },
  { value: "in_development", label: "In Development" },
  { value: "active", label: "Active" },
];

type BadgeMap = Record<string, BadgeKind>;
let cache: BadgeMap | null = null;
const EVENT = "polaris:feature-badges-changed";

async function fetchBadges(): Promise<BadgeMap> {
  const { data } = await (supabase as any).from("feature_badges").select("screen, badge");
  const map: BadgeMap = {};
  for (const r of data ?? []) if (r.badge && r.badge !== "none") map[r.screen] = r.badge as BadgeKind;
  cache = map;
  return map;
}

/** Reactive badge map for the sidebar. Fetches once (cached); refreshes when an
 *  admin saves a change (via notifyBadgesChanged). */
export function useFeatureBadges(): BadgeMap {
  const [map, setMap] = useState<BadgeMap>(cache ?? {});
  useEffect(() => {
    let alive = true;
    const load = () => void fetchBadges().then((m) => { if (alive) setMap(m); });
    if (cache) setMap(cache); else load();
    const onChange = () => load();
    window.addEventListener(EVENT, onChange);
    return () => { alive = false; window.removeEventListener(EVENT, onChange); };
  }, []);
  return map;
}

/** Save a badge for a screen and notify any mounted sidebars to refresh. */
export async function setFeatureBadge(screen: string, badge: "none" | BadgeKind): Promise<void> {
  const { error } = await (supabase as any)
    .from("feature_badges")
    .upsert({ screen, badge, updated_at: new Date().toISOString() }, { onConflict: "screen" });
  if (error) throw error;
  cache = null;
  window.dispatchEvent(new Event(EVENT));
}

export async function loadAllFeatureBadges(): Promise<Record<string, "none" | BadgeKind>> {
  const { data } = await (supabase as any).from("feature_badges").select("screen, badge");
  const map: Record<string, "none" | BadgeKind> = {};
  for (const r of data ?? []) map[r.screen] = r.badge;
  return map;
}
