import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { DEVELOPER_EMAILS } from "@/lib/leo-access";

// ── "View as / impersonate" preview state ─────────────────────────────────────
// Admin-only client-view preview. This is a UI preview: it re-scopes the sidebar
// nav (and shows a banner) so an admin can see the simplified layout a client/
// crew role gets. It does NOT change the user's actual identity or data access —
// true data-level impersonation needs a backend session swap + the RBAC layer.

const STORAGE_KEY = "polaris.viewAsRole";
const LABEL_KEY = "polaris.viewAsLabel";
const EVENT_KEY = "polaris:view-as-change";

export const VIEW_AS_OPTIONS = [
  { role: "vessel_owner", label: "Client (Vessel Owner)" },
  { role: "captain",      label: "Captain" },
  { role: "crew",         label: "Crew" },
] as const;

export const ROLE_LABEL: Record<string, string> = {
  vessel_owner: "Client (Vessel Owner)",
  captain: "Captain",
  crew: "Crew",
};

// Allowed top-level route prefixes per previewed role. A null result means "no
// filtering" (full admin/staff nav). Tunable as the client portal scope firms up.
const ROLE_NAV_ALLOW: Record<string, string[]> = {
  vessel_owner: ["/dashboard", "/yachts", "/my-fleet", "/crew-immigration", "/permits", "/finance", "/esign", "/guides", "/changelog"],
  captain:      ["/dashboard", "/yachts", "/my-fleet", "/crew-immigration", "/permits", "/orbit", "/packages", "/fleet-tracking", "/esign", "/guides", "/changelog"],
  crew:         ["/dashboard", "/crew-immigration", "/esign", "/guides", "/changelog"],
};

export function getViewAsRole(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function getViewAsLabel(): string | null {
  try { return localStorage.getItem(LABEL_KEY); } catch { return null; }
}

/**
 * Set the previewed role. Pass `label` to preview as a specific person (e.g. their
 * email/name) — shown in the trigger + banner; the role still drives nav scoping.
 */
export function setViewAsRole(role: string | null, label?: string | null) {
  try {
    if (role) {
      localStorage.setItem(STORAGE_KEY, role);
      if (label) localStorage.setItem(LABEL_KEY, label); else localStorage.removeItem(LABEL_KEY);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LABEL_KEY);
    }
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: role }));
}

/** Reactive hook — the currently previewed role, or null when not impersonating. */
export function useViewAsRole(): string | null {
  const [role, setRole] = useState<string | null>(() =>
    typeof window !== "undefined" ? getViewAsRole() : null,
  );
  useEffect(() => {
    const handler = (e: Event) => setRole((e as CustomEvent).detail ?? null);
    window.addEventListener(EVENT_KEY, handler);
    return () => window.removeEventListener(EVENT_KEY, handler);
  }, []);
  return role;
}

/** Reactive hook — the previewed person's display label (email/name), if any. */
export function useViewAsLabel(): string | null {
  const [label, setLabel] = useState<string | null>(() =>
    typeof window !== "undefined" ? getViewAsLabel() : null,
  );
  useEffect(() => {
    const handler = () => setLabel(getViewAsLabel());
    window.addEventListener(EVENT_KEY, handler);
    return () => window.removeEventListener(EVENT_KEY, handler);
  }, []);
  return label;
}

/** Allowed route prefixes for a previewed role; null = show everything.
 *  Roles without an explicit allow-list (e.g. jls_staff, global_admin) are not
 *  route-restricted — their visibility is governed by the feature-flag stages. */
export function navAllowedFor(role: string | null): string[] | null {
  if (!role) return null;
  return ROLE_NAV_ALLOW[role] ?? null;
}

/** Whether the current user may use the client-view preview (admins/staff/dev). */
export function useCanImpersonate(): boolean {
  const { user } = useAuth();
  if (import.meta.env.DEV) return true;
  const email = user?.email?.toLowerCase() ?? "";
  const role: string = (user as any)?.app_metadata?.role ?? (DEVELOPER_EMAILS.includes(email) ? "global_admin" : "");
  return ["global_admin", "org_admin", "jls_staff"].includes(role);
}
