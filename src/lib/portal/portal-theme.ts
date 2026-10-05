/**
 * Client Portal themes — which look a person sees, and saving their choice.
 *
 * Order of precedence: the person's own choice (user_preferences.prefs.portal_theme,
 * set from Appearance in the portal) → their vessel's default (portal_vessel_settings,
 * set by staff) → Bridge.
 */
import { supabase } from "@/integrations/supabase/client";

export type PortalTheme = "bridge" | "midnight" | "private_office";

export const PORTAL_THEMES: Array<{ value: PortalTheme; label: string; blurb: string; swatch: [string, string, string] }> = [
  { value: "bridge", label: "Bridge", blurb: "Navy and gold — the JLS house look", swatch: ["#0D1E44", "#C9A227", "#f0f4f8"] },
  { value: "midnight", label: "Midnight", blurb: "Near-black and brass, easy on the eyes at night", swatch: ["#0A0D13", "#C9A96A", "#ECE6DA"] },
  { value: "private_office", label: "Private Office", blurb: "Ivory and ink — light and editorial", swatch: ["#F5F2EC", "#15181D", "#8C6F3A"] },
];

export const isPortalTheme = (v: unknown): v is PortalTheme =>
  v === "bridge" || v === "midnight" || v === "private_office";

/** The class on the portal root for a theme, and whether it's a dark theme. */
export function themeClasses(theme: PortalTheme): { className: string; dark: boolean } {
  switch (theme) {
    case "midnight": return { className: "portal-theme-midnight", dark: true };
    case "private_office": return { className: "portal-theme-office", dark: false };
    default: return { className: "", dark: true };
  }
}

const FONT_HREF: Partial<Record<PortalTheme, string>> = {
  private_office: "https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500;6..96,600&family=Albert+Sans:wght@400;500;600;700&display=swap",
};

/** Load a theme's web fonts once (the Bridge/Midnight fonts are already on every page). */
export function ensureThemeFonts(theme: PortalTheme) {
  const href = FONT_HREF[theme];
  if (!href || typeof document === "undefined") return;
  if (document.querySelector(`link[data-portal-theme-font="${theme}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.portalThemeFont = theme;
  document.head.appendChild(link);
}

/** The theme this person should see. */
export async function resolvePortalTheme(opts: { userId: string | null; yachtId: string | null; preview: boolean }): Promise<PortalTheme> {
  const db = supabase as any;
  // In staff preview, show what the client sees by default (their own pick is private to them).
  if (opts.userId && !opts.preview) {
    const { data } = await db.from("user_preferences").select("prefs").eq("user_id", opts.userId).maybeSingle();
    const mine = data?.prefs?.portal_theme;
    if (isPortalTheme(mine)) return mine;
  }
  if (opts.yachtId) {
    const { data } = await db.from("portal_vessel_settings").select("theme").eq("yacht_id", opts.yachtId).maybeSingle();
    if (isPortalTheme(data?.theme)) return data.theme;
  }
  return "bridge";
}

const LOCAL_KEY = 'polaris.portal.theme'

/** The last look this browser showed — used for the first paint, so there's no flash of Bridge. */
export function cachedPortalTheme(): PortalTheme {
  try {
    const v = typeof window === 'undefined' ? null : window.localStorage.getItem(LOCAL_KEY)
    return isPortalTheme(v) ? v : 'bridge'
  } catch { return 'bridge' }
}
export function rememberPortalTheme(theme: PortalTheme) {
  try { window.localStorage.setItem(LOCAL_KEY, theme) } catch { /* private mode */ }
}

/** Save this person's choice to their account. */
export async function savePortalTheme(theme: PortalTheme) {
  await (supabase as any).rpc("set_my_preference", { p_key: "portal_theme", p_value: theme });
}
