/**
 * Staff usage tracking — one usage_events row per screen a person opens, read by
 * Admin → Usage. Fire-and-forget: it never blocks navigation and never surfaces
 * an error. The same screen opened again within 60 seconds isn't logged twice
 * (tab flicking, refreshes, the in-shell ?screen= replace).
 *
 * Screens are the Polaris home's in-shell keys (`?screen=immigration`) or the
 * app route with ids collapsed (`/crew-immigration/visas/:id`); the module is the
 * sidebar label from polaris-ui/shell.tsx, so the report reads like the menu.
 */
import { supabase } from "@/integrations/supabase/client";
import { NAV_GROUPS, activeScreenForPath } from "@/components/polaris-ui/shell";
import { getViewAsRole, getViewAsUser } from "@/lib/view-as";

const DEDUPE_MS = 60_000;
const DEDUPE_KEY = "polaris.usage.last";

/** Routes that aren't sidebar items, by first path segment → the module they belong to. */
const SEGMENT_MODULE: Record<string, string> = {
  "polaris-redesign": "Dashboard",
  dashboard: "Dashboard",
  "crew-immigration": "Immigration",
  yachts: "Vessels",
  "my-fleet": "Vessels",
  "fleet-tracking": "Vessels",
  "it-tickets": "Yacht IT Solutions",
  "it-solutions": "Yacht IT Solutions",
  "it-yachts": "Yacht IT Solutions",
  "yacht-it": "Yacht IT Solutions",
  esign: "Anchor",
  orbit: "Orbit",
  orbit2: "Orbit 2",
  permits: "Permits",
  shipsync: "Logistics",
  "ship-spares": "Logistics",
  packages: "Logistics",
  finance: "Finance",
  "qb-import": "Finance",
  training: "Training Institute",
  "crew-placement": "Crew Placement",
  admin: "Admin",
  settings: "Settings",
  "dev-settings": "Dev Settings",
  automations: "Automations",
  "error-log": "Error & Warnings",
  changelog: "Changelog",
  feedback: "Feedback",
  integrations: "Settings",
};

function labelForScreen(screen: string): string | null {
  for (const g of NAV_GROUPS) for (const i of g.items) if (i.screen === screen) return i.label;
  return null;
}

/** Collapse ids so every visa/crew/ticket detail page counts as one screen. */
function normalisePath(pathname: string): string {
  return pathname
    .split("/")
    .map((seg) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) || /^\d+$/.test(seg) || /^[A-Z]{2,5}-\d+$/.test(seg)
        ? ":id"
        : seg,
    )
    .join("/")
    .replace(/\/+$/, "") || "/";
}

/** The screen key + module for a location. */
export function usageScreenFor(pathname: string, screenParam?: string | null): { screen: string; module: string } {
  if (pathname.startsWith("/polaris-redesign")) {
    const s = screenParam || "dashboard";
    return { screen: s, module: labelForScreen(s) ?? "Dashboard" };
  }
  const path = normalisePath(pathname);
  const navScreen = activeScreenForPath(pathname);
  const label = navScreen ? labelForScreen(navScreen) : null;
  if (label) return { screen: path, module: label };
  const seg = path.split("/")[1] ?? "";
  const mod = SEGMENT_MODULE[seg] ?? (seg ? seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Dashboard");
  return { screen: path, module: mod };
}

function readLast(): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem(DEDUPE_KEY) ?? "{}") ?? {}; } catch { return {}; }
}
let memLast: Record<string, number> = {};

/** Record that `userId` opened this location. Never throws, never awaits. */
export function trackScreen(userId: string, pathname: string, screenParam?: string | null): void {
  try {
    // An admin previewing another role/person isn't that person using Polaris.
    if (getViewAsRole() || getViewAsUser()) return;
    const { screen, module } = usageScreenFor(pathname, screenParam);
    const now = Date.now();
    const last = { ...readLast(), ...memLast };
    const key = `${userId}|${screen}`;
    if (last[key] && now - last[key] < DEDUPE_MS) return;
    // Keep only recent keys so the store stays tiny.
    const next: Record<string, number> = {};
    for (const [k, t] of Object.entries(last)) if (now - t < DEDUPE_MS) next[k] = t;
    next[key] = now;
    memLast = next;
    try { sessionStorage.setItem(DEDUPE_KEY, JSON.stringify(next)); } catch { /* private mode etc. */ }

    void (supabase as any)
      .from("usage_events")
      .insert({ user_id: userId, screen, module })
      .then(() => undefined, () => undefined);
  } catch {
    /* tracking must never break the app */
  }
}
