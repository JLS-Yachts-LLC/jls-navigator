/**
 * Polaris Redesign — app shell (#195).
 * PolarisTopBar · PolarisSideNav · mobile overlay + bottom tab bar · PolarisShell.
 * Mobile-first: side nav hidden < 768px (hamburger overlay + bottom tabs); desktop
 * shows the fixed side nav. Role-based nav visibility per the redesign spec.
 */
import { ProfileMenu, ProfileAvatar } from "@/components/profile/profile-menu";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useUserPreference } from "@/lib/user-preferences";
import { useAuth } from "@/lib/auth";
import { TIcon } from "./primitives";
import { PolarisMark } from "@/components/brand/PolarisMark";
import { useFeatureBadges, BADGE_META } from "@/lib/feature-badges";
import { ViewAsSwitcher, OnlineUsers } from "@/components/top-bar";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { GlobalSearch } from "./global-search";
import { useTheme } from "@/lib/theme";
import { useAccess } from "@/lib/auth/useAccess";
import { ViewAsBanner } from "@/components/view-as-banner";
import { canAccessModule, type PolarisClaims } from "@/lib/auth/claims";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsUsageAdmin } from "@/lib/usage-admin";
import { useFlagMap } from "@/lib/release-flags";
import { useDevAccess } from "@/lib/dev-access";
import { dropFavourite, moveFavourite, resolveFavourites, toggleFavourite, useSidebarFavourites } from "@/lib/sidebar-favourites";

export type PolarisRole =
  | "global_admin"
  | "crew_immigration"
  | "captain"
  | "crew"
  | "logistics_team"
  | "hr";

export interface NavItem {
  label: string;
  icon: string;
  screen: string;
  roles?: PolarisRole[]; // undefined = all roles
  /** modules.name this item belongs to — hidden when the user's module grants
   *  (department defaults + per-user overrides) don't include view access.
   *  Only enforced once the user HAS module grants; a user with none configured
   *  sees everything, so the permissions rollout can't blank anyone's sidebar. */
  module?: string;
  /** Route-backed item: navigates to this app route (rendered inside the same
   *  Polaris chrome by AppLayout) instead of switching an in-shell screen. */
  route?: string;
  /** Shown only to people actually granted `module` (and global admins) — never
   *  to someone with no grants yet. For areas that reach clients directly. */
  grantOnly?: boolean;
  /** Shown only to admins (global admin or has_role admin — is_usage_admin()). */
  adminOnly?: boolean;
  /** feature_flags key (Dev Settings): hidden while the flag is on Dev, except to dev access. */
  flag?: string;
  /** Other names people search for this page by (top-bar search), e.g. ShipSync for Logistics. */
  keywords?: string[];
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard", icon: "layout-dashboard", screen: "dashboard" },
      {
        label: "Vessels",
        module: "agency",
        icon: "ship",
        screen: "vessels",
        roles: ["global_admin", "crew_immigration", "captain", "logistics_team"],
      },
      {
        label: "Crew",
        module: "crew_immigration",
        icon: "users",
        screen: "crew",
        roles: ["global_admin", "crew_immigration", "captain", "crew"],
      },
      {
        label: "Compliance",
        module: "crew_immigration",
        icon: "shield-check",
        screen: "compliance",
        roles: ["global_admin", "crew_immigration", "captain"],
      },
      {
        // Permits hub — Command Centre + one mini tab per permit type
        // (gate pass, cruising, exit & entry, …).
        label: "Permits",
        module: "agency",
        icon: "license",
        screen: "permits",
        roles: ["global_admin", "crew_immigration", "captain"],
      },
      // Port Operations TV board (/wall) — pair a screen with its code here.
      { label: "Wall Displays", module: "agency", icon: "device-tv", screen: "route-wall-displays", route: "/wall-displays", roles: ["global_admin", "crew_immigration", "logistics_team"], flag: "wall-displays" },
    ],
  },
  {
    label: "Services",
    items: [
      {
        // Immigration hub — tabs into Visa + Sign On/Off (the real pages).
        label: "Immigration",
        module: "crew_immigration",
        icon: "id-badge",
        screen: "immigration",
        keywords: ["visa", "visas", "sign on", "sign off"],
        roles: ["global_admin", "crew_immigration"],
      },
      { label: "Logistics", module: "shipsync", icon: "truck", screen: "logistics", keywords: ["ShipSync", "parcels", "packages", "warehouse", "deliveries", "dispatch", "drivers", "import", "export", "gate pass", "EDAS"] },
      { label: "Crew Care", module: "transport", icon: "car", screen: "route-crew-cab", route: "/crew-cab/jobs" },
      // Compass Card sign-ups, vendor requests and offers, sent from compasscard.online.
      { label: "Compass Card", module: "compass_card", icon: "credit-card", screen: "route-compass-card", route: "/compass-card" },
      { label: "Agency", module: "agency", icon: "world", screen: "route-agency", route: "/agency" },
      { label: "Provisioning", module: "provisioning", icon: "tools-kitchen-2", screen: "route-provisioning", route: "/provisioning" },
      { label: "Waypoint Chandlery", module: "waypoint", icon: "shopping-cart", screen: "route-waypoint", route: "/waypoint" },
      { label: "Yacht Shipments", module: "shipsync", icon: "package", screen: "route-yacht-shipments", route: "/yacht-shipments" },
      { label: "Seaport Immigration", module: "seaport", icon: "building-lighthouse", screen: "route-seaport", route: "/seaport", roles: ["global_admin", "crew_immigration"] },
      // Training staff only (students' personal details) — hidden even from staff with no module grants yet.
      { label: "Training", module: "training", icon: "certificate", screen: "training", grantOnly: true },
      { label: "Training Institute", module: "training", icon: "school", screen: "route-training", route: "/training", grantOnly: true },
      // Crew Academy — online courses JLS publishes for vessels' crew (Client Portal module).
      { label: "Crew Academy", module: "academy", icon: "books", screen: "route-academy-admin", route: "/academy-admin", flag: "crew-academy" },
      { label: "Yacht IT Solutions", module: "yacht_it", icon: "cpu", screen: "yacht-it" },
      { label: "Anchor", icon: "signature", screen: "anchor", keywords: ["e-sign", "esign", "signature", "contracts", "documents"] },
      { label: "Crew Placement", module: "crew_placement", icon: "user-star", screen: "crew-placement", roles: ["global_admin", "crew_immigration"] },
      { label: "Finance", module: "finance", icon: "report-money", screen: "finance", roles: ["global_admin"] },
      { label: "Port Calls", module: "agency", icon: "anchor", screen: "port-calls" },
      // Open to all staff (every department raises these); the Warehouse / Agency team manage them inside the page.
      { label: "Warehouse Requests", icon: "package-import", screen: "route-warehouse-requests", route: "/warehouse-requests" },
      { label: "Bunkering", icon: "gas-station", screen: "route-bunkering", route: "/bunkering" },
      { label: "Procurement", icon: "shopping-bag", screen: "route-procurement", route: "/procurement" },
      { label: "Small Boat Registration", module: "agency", icon: "file-certificate", screen: "route-small-boat-registration", route: "/small-boat-registration" },
      { label: "Berth Billing", module: "finance", icon: "receipt-2", screen: "berth-billing", roles: ["global_admin"] },
      { label: "Orbit", module: "orbit", icon: "orbit", screen: "orbit" },
      { label: "Orbit 2", module: "orbit", icon: "chart-donut", screen: "orbit2" },
      {
        // Captain's Portal triage — requests raised by client captains at /portal.
        label: "Client Requests",
        icon: "headset",
        screen: "client-requests",
        roles: ["global_admin"],
      },
    ],
  },
  {
    label: "Communications",
    items: [
      // Client messaging: inbox, contacts + consent, broadcast lists, templates, sends.
      { label: "WhatsApp", module: "communications", icon: "brand-whatsapp", screen: "whatsapp", grantOnly: true },
      // Google reviews for each JLS brand — read and reply. Global admins only until Google approves API access.
      { label: "Reviews", module: "reviews", icon: "star", screen: "reviews", grantOnly: true },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        label: "Visa Reports",
        module: "crew_immigration",
        icon: "file-description",
        screen: "visa-reports",
        roles: ["global_admin", "crew_immigration", "captain"],
      },
      { label: "Sign On/Off", module: "crew_movements", icon: "clipboard-list", screen: "soso-reports" },
      // Reports emailed to a vessel on a schedule — opted in per vessel, own recipients.
      { label: "Automated Reports", module: "crew_immigration", icon: "calendar-time", screen: "vessel-report-automations", roles: ["global_admin", "crew_immigration"] },
      { label: "Crew Documents", module: "crew_immigration", icon: "files", screen: "documents" },
      // Every secure link sent to a client, who opened it, and a way to revoke one.
      { label: "Document Links", icon: "link", screen: "route-document-links", route: "/document-links" },
      {
        label: "Spreadsheet Sync",
        module: "crew_immigration",
        icon: "refresh",
        screen: "route-visa-sync",
        route: "/crew-immigration/visas/sync",
        roles: ["global_admin", "crew_immigration"],
      },
      {
        label: "Duplicate Crew",
        module: "crew_immigration",
        icon: "copy",
        screen: "route-crew-duplicates",
        route: "/crew-immigration/duplicates",
        roles: ["global_admin", "crew_immigration"],
      },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Knowledge Base", icon: "book", screen: "route-guides", route: "/guides" },
      { label: "Forms Library", icon: "clipboard-text", screen: "route-forms", route: "/forms" },
      // e-Sign Documents removed — it renders the same AnchorPage as "Anchor"
      // (Services). The /esign route still resolves for existing links.
      { label: "Directory", icon: "address-book", screen: "route-directory", route: "/directory" },
      { label: "Contacts", icon: "notebook", screen: "route-contacts", route: "/contacts" },
      { label: "Crew Benefits", icon: "compass", screen: "route-compass", route: "/compass" },
      { label: "Emergency Contacts", icon: "phone", screen: "route-emergency", route: "/emergency-contacts" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Settings", icon: "settings", screen: "settings", roles: ["global_admin"] },
      { label: "Dev Settings", icon: "adjustments", screen: "admin-dev", roles: ["global_admin"] },
      { label: "Automations", icon: "bolt", screen: "admin-automations", roles: ["global_admin"] },
      { label: "Sync", icon: "refresh", screen: "admin-sync", roles: ["global_admin"] },
      // Integrations lives inside Settings (its own tab) — it had its own nav entry
      // duplicating both that tab and Sync Centre, so the standalone page is gone.
      { label: "Error & Warnings", icon: "alert-triangle", screen: "admin-errors", roles: ["global_admin"] },
      { label: "Changelog", icon: "news", screen: "admin-changelog", roles: ["global_admin"] },
      // Who uses Polaris, how often and what they get done — admins only.
      { label: "Staff Usage", icon: "chart-bar", screen: "route-staff-usage", route: "/staff-usage", adminOnly: true, flag: "staff-usage" },
      { label: "Recycle Bin", icon: "trash", screen: "route-recycle-bin", route: "/recycle-bin", roles: ["global_admin", "crew_immigration"] },
      { label: "Feedback", icon: "message-2", screen: "admin-feedback", roles: ["global_admin"] },
    ],
  },
];

/** Restricted roles see ONLY these screens — everything else is hidden, even
 *  items with no `roles` gate (which are otherwise visible to all). */
export const RESTRICTED_NAV: Partial<Record<PolarisRole, string[]>> = {
  logistics_team: ["vessels", "logistics"],
  // Head of HR: staff contracts and confidential documents live in Anchor, plus
  // placed crew in Crew Placement; no vessel, visa, finance or operations screens.
  hr: ["anchor", "crew-placement", "route-guides", "route-forms", "route-directory", "route-emergency"],
};

/**
 * Screens a person can reach without the item's module: WhatsApp for someone
 * given a WhatsApp number (Setup → Numbers) but not Communications.
 */
function useExtraScreens(userId: string | null | undefined): Set<string> {
  const { data } = useQuery({
    queryKey: ["wa-my-lines", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("wa_my_lines");
      return ((data ?? []) as any[]).length > 0;
    },
  });
  return new Set(data ? ["whatsapp"] : []);
}

function visibleGroups(role: PolarisRole, claims?: PolarisClaims, extra: Set<string> = new Set()): NavGroup[] {
  const allow = RESTRICTED_NAV[role];
  // Module gating only bites once the user actually has module grants — a user
  // with none configured keeps the full (role-filtered) menu during rollout.
  const gate = !!claims && !claims.isGlobalAdmin && claims.moduleNames.length > 0;
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (allow ? !allow.includes(i.screen) : (i.roles && !i.roles.includes(role))) return false;
      if (extra.has(i.screen)) return true;
      if (gate && i.module && !canAccessModule(claims!, i.module)) return false;
      if (i.grantOnly && !(claims && i.module && canAccessModule(claims, i.module))) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);
}

/** The label of the currently-selected nav item (shown as the page heading). */
function labelForScreen(screen: string): string | null {
  for (const g of NAV_GROUPS) for (const i of g.items) if (i.screen === screen) return i.label;
  return null;
}

/** Look up a nav item by its screen key (route-backed items carry `route`). */
export function navItemForScreen(screen: string): NavItem | undefined {
  for (const g of NAV_GROUPS) for (const i of g.items) if (i.screen === screen) return i;
  return undefined;
}

/** The nav screen key that best matches an app route path (for highlighting
 *  route-backed items when a page renders inside the shared Polaris chrome). */
export function activeScreenForPath(pathname: string): string {
  let best: { screen: string; len: number } | null = null;
  for (const g of NAV_GROUPS) for (const i of g.items) {
    if (i.route && pathname.startsWith(i.route) && (!best || i.route.length > best.len)) {
      best = { screen: i.screen, len: i.route.length };
    }
  }
  return best?.screen ?? "";
}

/** Top-bar controls (View-as, presence, feedback, theme, notifications).
 *  Wrapped in `dark` so they read on navy. */
function TopBarControls() {
  const { theme, toggle } = useTheme();
  return (
    <div className="dark flex items-center gap-1.5">
      <ViewAsSwitcher />
      <OnlineUsers />
      <FeedbackWidget />
      <button
        onClick={toggle}
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition"
      >
        <TIcon name={theme === "dark" ? "sun" : "moon"} size={18} />
      </button>
      <NotificationBell />
    </div>
  );
}

export function useIsMobile(breakpoint = 768): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpoint - 1}px)`);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return mobile;
}

// ── Top bar ───────────────────────────────────────────────────────────────────
export function PolarisTopBar({
  vesselName,
  userInitials,
  userName,
  onVesselClick,
  onBellClick,
  onMenuClick,
  showMenu,
  activeLabel,
}: {
  vesselName: string;
  userInitials: string;
  userName: string;
  onVesselClick?: () => void;
  onBellClick?: () => void;
  onMenuClick?: () => void;
  showMenu?: boolean;
  activeLabel?: string;
}) {
  return (
    <header
      style={{
        background: "var(--pds-navy)",
        borderBottom: "1px solid var(--pds-border-gold)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        height: "var(--pds-topbar-h)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {showMenu && (
          <button
            onClick={onMenuClick}
            aria-label="Menu"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              display: "flex",
            }}
          >
            <TIcon name="menu-2" size={22} color="var(--pds-text-secondary)" />
          </button>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Same star as the favicon and the login logo. Decorative here —
              the word POLARIS beside it already names the product. */}
          <PolarisMark size={26} title="" />
          <span
            style={{
              color: "var(--pds-gold)",
              fontFamily: "var(--pds-font-display)",
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: "0.14em",
            }}
          >
            POLARIS
          </span>
        </span>
        {/* Selected screen heading (moved out of the per-page tab bars). */}
        {activeLabel && (
          <>
            <span style={{ color: "var(--pds-border-gold)", fontSize: 16 }}>/</span>
            <span
              style={{
                fontFamily: "var(--pds-font-display)",
                fontSize: "var(--pds-fs-title)",
                fontWeight: 600,
                color: "var(--pds-text)",
              }}
            >
              {activeLabel}
            </span>
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <GlobalSearch />
        <TopBarControls />
        {/* The avatar opens the profile menu — edit your name and picture, or
            sign out. `userInitials` is the fallback until the profile loads. */}
        <div className="dark">
          <ProfileMenu
            renderTrigger={({ avatarUrl, initials }) => (
              <ProfileAvatar
                avatarUrl={avatarUrl}
                initials={initials || userInitials}
                size={30}
                style={{
                  background: "var(--pds-gold-muted)",
                  border: "1px solid var(--pds-border-gold)",
                  color: "var(--pds-gold)",
                }}
              />
            )}
          />
        </div>
      </div>
    </header>
  );
}

/**
 * The sidebar groups this person sees: role, module grants, admin-only items and Dev-stage
 * feature flags all applied. The top-bar search offers pages from the same list, so it never
 * suggests a page the menu would hide.
 */
export function useVisibleNav(role: PolarisRole): NavGroup[] {
  const { claims } = useAccess();
  const extra = useExtraScreens(claims?.userId);
  const { allowed: usageAdmin } = useIsUsageAdmin();
  const { map: flags } = useFlagMap();
  const devAccess = useDevAccess();
  const shown = (i: NavItem) =>
    (!i.adminOnly || usageAdmin) && (!i.flag || (flags.get(i.flag)?.stage ?? "dev") !== "dev" || devAccess);
  return visibleGroups(role, claims, extra)
    .map((g) => ({ ...g, items: g.items.filter(shown) }))
    .filter((g) => g.items.length > 0);
}

// ── Side nav (desktop) / overlay body (mobile) ───────────────────────────────
function NavList({
  role,
  active,
  onNavigate,
  collapsed = false,
}: {
  role: PolarisRole;
  active: string;
  onNavigate: (s: string) => void;
  /** Icon-only rail (labels + group headers hidden), for the collapsed desktop nav. */
  collapsed?: boolean;
}) {
  const badges = useFeatureBadges();
  const { claims } = useAccess();
  // Sections the person has folded away — saved to their account, so it's the
  // same layout on any device. A folded section holding the open screen is highlighted.
  const [closedList, setClosedList] = useUserPreference<string[]>("nav.closedGroups", [], { key: NAV_CLOSED_KEY, parse: JSON.parse });
  const closed = new Set(Array.isArray(closedList) ? closedList : []);
  function toggleGroup(label: string) {
    setClosedList((prev) => {
      const next = new Set(Array.isArray(prev) ? prev : []);
      next.has(label) ? next.delete(label) : next.add(label);
      return [...next];
    });
  }

  // The normal sidebar's groups — Favourites are drawn from these same items, so
  // a pin never shows something this menu would hide.
  const groups = useVisibleNav(role);
  const allItems = groups.flatMap((g) => g.items);
  // Pins belong to the signed-in person (even while viewing as someone else);
  // what shows is still limited to what this menu shows.
  const fav = useSidebarFavourites(useAuth().user?.id);
  const favItems = resolveFavourites(fav.keys, allItems);
  const favSet = new Set(fav.keys);
  const favShown = new Set(favItems.map((i) => i.screen));
  const [hintSeen, setHintSeen] = useUserPreference<boolean>("nav.favouritesHintSeen", false);
  const touch = useNoHover();

  function togglePin(screen: string) {
    if (!favSet.has(screen)) setHintSeen(true);
    void fav.save(toggleFavourite(fav.keys, screen));
  }

  // Right-click / long-press menu.
  const [menu, setMenu] = useState<{ screen: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close);
    };
  }, [menu]);
  function openMenu(screen: string, x: number, y: number, el: Element) {
    // Keyboard context-menu key reports 0,0 — anchor to the item instead.
    if (x === 0 && y === 0) {
      const r = el.getBoundingClientRect();
      x = r.left + 24;
      y = r.bottom;
    }
    setMenu({ screen, x: Math.min(x, window.innerWidth - 210), y: Math.min(y, window.innerHeight - 150) });
  }

  // Long-press on touch screens (iOS has no contextmenu event for it).
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const cancelPress = () => { if (press.current) clearTimeout(press.current.timer); press.current = null; };

  // Drag to reorder Favourites.
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ screen: string; where: "before" | "after" } | null>(null);

  function renderItem(item: NavItem, inFav: boolean) {
    const on = item.screen === active;
    const pinned = favSet.has(item.screen);
    const dropHere = inFav && drag && over?.screen === item.screen && drag !== item.screen ? over.where : null;
    return (
      <div
        key={item.screen}
        className="pds-nav-row"
        data-collapsed={collapsed || undefined}
        draggable={inFav && !touch ? true : undefined}
        onDragStart={inFav ? (e) => { setDrag(item.screen); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.screen); } : undefined}
        onDragEnd={inFav ? () => { setDrag(null); setOver(null); } : undefined}
        onDragOver={inFav && drag ? (e) => {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const where = e.clientY < r.top + r.height / 2 ? "before" : "after";
          if (over?.screen !== item.screen || over.where !== where) setOver({ screen: item.screen, where });
        } : undefined}
        onDrop={inFav && drag ? (e) => {
          e.preventDefault();
          if (over) void fav.save(dropFavourite(fav.keys, drag, over.screen, over.where));
          setDrag(null);
          setOver(null);
        } : undefined}
        onContextMenu={(e) => { e.preventDefault(); openMenu(item.screen, e.clientX, e.clientY, e.currentTarget); }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          const el = e.currentTarget;
          longPressed.current = false;
          cancelPress();
          press.current = {
            x: t.clientX, y: t.clientY,
            timer: setTimeout(() => { longPressed.current = true; openMenu(item.screen, t.clientX, t.clientY, el); }, 500),
          };
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (press.current && Math.hypot(t.clientX - press.current.x, t.clientY - press.current.y) > 10) cancelPress();
        }}
        onTouchEnd={cancelPress}
        onTouchCancel={cancelPress}
        style={{ position: "relative", opacity: inFav && drag === item.screen ? 0.45 : 1 }}
      >
        {dropHere && (
          <span style={{
            position: "absolute", left: 6, right: 6, height: 2, borderRadius: 2, background: "var(--pds-gold)",
            top: dropHere === "before" ? -1 : undefined, bottom: dropHere === "after" ? -1 : undefined, zIndex: 1,
          }} />
        )}
        <button
          onClick={(e) => {
            // A long-press opened the menu — don't also navigate.
            if (longPressed.current) { longPressed.current = false; e.preventDefault(); return; }
            onNavigate(item.screen);
          }}
          title={collapsed ? item.label : undefined}
          // Colour, padding and the gold hover rail live in tokens.css
          // (.pds-nav-item) — inline styles can't react to :hover.
          className="pds-nav-item"
          data-active={on || undefined}
          data-collapsed={collapsed || undefined}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: collapsed ? 0 : 10,
            minHeight: 44,
            borderRadius: "var(--pds-radius-md)",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            fontSize: "var(--pds-fs-nav)",
            fontWeight: on ? 600 : 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <TIcon
              name={item.icon}
              size={18}
              // No inline colour unless active, so the hover rule in tokens.css can turn it gold.
              color={on ? "var(--pds-gold)" : undefined}
            />
            {/* Collapsed rail: a tiny dot in the icon's corner marks a badged feature. */}
            {collapsed && badges[item.screen] && (
              <span style={{
                position: "absolute", top: -2, right: -3, width: 7, height: 7, borderRadius: "50%",
                background: BADGE_META[badges[item.screen]].color, border: "1px solid var(--pds-surface-1, #0d1520)",
              }} />
            )}
          </span>
          {!collapsed && item.label}
          {!collapsed && badges[item.screen] && (
            <span className="pds-nav-badge" style={{
              marginLeft: "auto",
              fontSize: 9, fontWeight: 700, lineHeight: 1, letterSpacing: "0.04em",
              padding: "2px 5px", borderRadius: 5, textTransform: "uppercase",
              background: BADGE_META[badges[item.screen]].bg,
              color: BADGE_META[badges[item.screen]].color,
              border: `1px solid ${BADGE_META[badges[item.screen]].border}`,
            }}>
              {BADGE_META[badges[item.screen]].label}
            </span>
          )}
        </button>
        {/* Pin / unpin — appears on hover (tokens.css .pds-nav-pin). */}
        {!collapsed && (
          <button
            type="button"
            className="pds-nav-pin"
            data-pinned={pinned || undefined}
            onClick={(e) => { e.stopPropagation(); togglePin(item.screen); }}
            title={pinned ? "Remove from Favourites" : "Pin to Favourites"}
            aria-label={pinned ? `Remove ${item.label} from Favourites` : `Pin ${item.label} to Favourites`}
          >
            <TIcon name={pinned ? "pinned-filled" : "pin"} size={15} />
          </button>
        )}
      </div>
    );
  }

  const menuItem = menu ? allItems.find((i) => i.screen === menu.screen) : undefined;
  const menuPinned = !!menu && favSet.has(menu.screen);
  const menuIdx = menu ? favItems.findIndex((i) => i.screen === menu.screen) : -1;
  const showHint = fav.loaded && favItems.length === 0 && !hintSeen && !collapsed;

  return (
    <nav
      style={{
        display: "flex",
        flexDirection: "column",
        gap: collapsed ? 8 : 18,
        padding: collapsed ? "12px 8px" : "16px 12px",
      }}
    >
      {showHint && (
        <div>
          <div style={{ ...groupHeaderStyle, display: "flex", alignItems: "center", cursor: "default" }}>
            <span style={{ flex: 1 }}>Favourites</span>
            <button
              type="button"
              onClick={() => setHintSeen(true)}
              title="Hide this tip"
              aria-label="Hide the Favourites tip"
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
            >
              <TIcon name="x" size={12} color="var(--pds-text-hint)" />
            </button>
          </div>
          <p style={{ margin: 0, padding: "0 8px", fontSize: 12, lineHeight: 1.4, color: "var(--pds-text-hint)" }}>
            {touch ? "Press and hold any page below to pin it here." : <>Hover any page and click <TIcon name="pin" size={12} /> to pin it here.</>}
          </p>
        </div>
      )}
      {[
        ...(favItems.length > 0 ? [{ label: "Favourites", items: favItems, fav: true }] : []),
        ...groups.map((g) => ({ ...g, fav: false })),
      ].map((g) => {
        const holdsActive = g.items.some((i) => i.screen === active);
        // The icon-only rail always shows every icon. A folded section holding
        // the open screen is highlighted instead, so you can see where you are.
        const folded = !collapsed && closed.has(g.label);
        const here = folded && holdsActive;
        return (
        <div key={g.label}>
          {collapsed ? (
            <div style={{ height: 1, margin: "0 6px 6px", background: "var(--pds-border)" }} />
          ) : (
            <button
              type="button"
              onClick={() => toggleGroup(g.label)}
              aria-expanded={!folded}
              title={here ? `You're in ${g.label} — click to show it` : folded ? `Show ${g.label}` : `Hide ${g.label}`}
              style={{
                ...groupHeaderStyle,
                color: here ? "var(--pds-gold-light)" : "var(--pds-text-hint)",
              }}
            >
              {here && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--pds-gold)" }} />}
              <span style={{ flex: 1 }}>{g.label}</span>
              {folded && (
                <span style={{ fontSize: 9, letterSpacing: 0, opacity: 0.8 }}>{g.items.length}</span>
              )}
              <TIcon name={folded ? "chevron-right" : "chevron-down"} size={12} color={here ? "var(--pds-gold)" : "var(--pds-text-hint)"} />
            </button>
          )}
          {!folded && g.items.map((item) => renderItem(item, g.fav))}
        </div>
        );
      })}
      {menu && menuItem && (
        <div
          role="menu"
          aria-label={menuItem.label}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed", left: menu.x, top: menu.y, zIndex: 1300, minWidth: 200,
            background: "var(--pds-surface-1)", border: "1px solid var(--pds-border-gold)",
            borderRadius: "var(--pds-radius-md)", boxShadow: "0 10px 28px rgba(0,0,0,0.5)", padding: 4,
          }}
        >
          <div style={{ padding: "6px 10px 4px", fontSize: 11, color: "var(--pds-text-hint)" }}>{menuItem.label}</div>
          {[
            { icon: menuPinned ? "pinned-off" : "pin", label: menuPinned ? "Remove from Favourites" : "Pin to Favourites", disabled: false, run: () => togglePin(menu.screen) },
            ...(menuIdx >= 0 && favItems.length > 1
              ? [
                  { icon: "arrow-up", label: "Move up", disabled: menuIdx === 0, run: () => void fav.save(moveFavourite(fav.keys, menu.screen, -1, favShown)) },
                  { icon: "arrow-down", label: "Move down", disabled: menuIdx === favItems.length - 1, run: () => void fav.save(moveFavourite(fav.keys, menu.screen, 1, favShown)) },
                ]
              : []),
          ].map((m, i) => (
            <button
              key={m.label}
              type="button"
              role="menuitem"
              className="pds-nav-menu-item"
              disabled={m.disabled}
              autoFocus={i === 0}
              onClick={() => { m.run(); setMenu(null); }}
            >
              <TIcon name={m.icon} size={15} />
              {m.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

const groupHeaderStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--pds-text-hint)",
  padding: "0 8px 6px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
};

/** True on touch-only screens (no hover) — pins are added by press-and-hold there. */
function useNoHover(): boolean {
  const [noHover, setNoHover] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const update = () => setNoHover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return noHover;
}

const NAV_PIN_KEY = "polaris.nav.pinned";
const NAV_CLOSED_KEY = "polaris.nav.closedGroups";
const RAIL_W = 60;

/** Desktop side nav: pinnable + collapsible to an icon rail. When unpinned the
 *  rail reclaims the space for content; hovering peeks the full menu as an
 *  overlay (content stays put); Pin keeps it open and reflows content. */
function DesktopNav({
  role,
  active,
  onNavigate,
}: {
  role: PolarisRole;
  active: string;
  onNavigate: (s: string) => void;
}) {
  // Menu pinned open or collapsed to icons — saved to the person's account.
  const [pinnedPref, setPinned] = useUserPreference<boolean>("nav.pinned", true, { key: NAV_PIN_KEY, parse: (raw) => raw !== "false" });
  const pinned = pinnedPref !== false;
  const [hover, setHover] = useState(false);
  const expanded = pinned || hover;

  const toggle = (
    <button
      onClick={() => { setPinned((p) => !p); setHover(false); }}
      title={pinned ? "Collapse menu" : "Pin menu open"}
      aria-label={pinned ? "Collapse menu" : "Pin menu open"}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: "var(--pds-radius-md)",
        border: "none", cursor: "pointer", background: "transparent",
        color: "var(--pds-text-secondary)",
      }}
    >
      <TIcon name={pinned ? "chevrons-left" : "pin"} size={18} color="var(--pds-text-secondary)" />
    </button>
  );

  return (
    <div
      // Flex placeholder: its width is what `main` reflows around. Rail width
      // when unpinned (content reclaims space), full width when pinned.
      style={{ width: pinned ? "var(--pds-nav-w)" : RAIL_W, flexShrink: 0, position: "relative", transition: "width 160ms ease" }}
      onMouseEnter={() => { if (!pinned) setHover(true); }}
      onMouseLeave={() => setHover(false)}
    >
      <aside
        style={{
          position: pinned ? "relative" : "absolute",
          top: 0, left: 0, height: "100%",
          width: expanded ? "var(--pds-nav-w)" : RAIL_W,
          background: "var(--pds-navy)",
          borderRight: "1px solid var(--pds-border)",
          overflowY: "auto", overflowX: "hidden",
          zIndex: pinned ? 0 : 60,
          boxShadow: !pinned && hover ? "6px 0 28px rgba(0,0,0,0.45)" : "none",
          transition: "width 160ms ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: expanded ? "flex-end" : "center", padding: expanded ? "8px 12px 0" : "8px 0 0" }}>
          {toggle}
        </div>
        <NavList role={role} active={active} collapsed={!expanded} onNavigate={(s) => { onNavigate(s); setHover(false); }} />
      </aside>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
export function PolarisShell({
  role,
  active,
  onNavigate,
  vesselName,
  userInitials,
  userName,
  onVesselClick,
  children,
}: {
  role: PolarisRole;
  active: string;
  onNavigate: (s: string) => void;
  vesselName: string;
  userInitials: string;
  userName: string;
  onVesselClick?: () => void;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [overlay, setOverlay] = useState(false);

  const go = (s: string) => {
    onNavigate(s);
    setOverlay(false);
  };

  const bottomTabs = [
    { label: "Dashboard", icon: "layout-dashboard", screen: "dashboard" },
    { label: "Crew", icon: "users", screen: "crew" },
    { label: "Reports", icon: "file-description", screen: "visa-reports" },
    { label: "More", icon: "dots", screen: "__more" },
  ];

  return (
    <div
      className="pds"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--pds-navy-deep)",
      }}
    >
      <PolarisTopBar
        vesselName={vesselName}
        userInitials={userInitials}
        userName={userName}
        showMenu={isMobile}
        onMenuClick={() => setOverlay(true)}
        onVesselClick={onVesselClick}
        activeLabel={labelForScreen(active) ?? undefined}
      />
      <div className="dark"><ViewAsBanner /></div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {!isMobile && <DesktopNav role={role} active={active} onNavigate={onNavigate} />}

        {/* `dark pds-embed` makes ANY standard app page ported into the Beta
            inherit the Beta teal/blue palette automatically — pds-native screens
            (inline pds vars) are unaffected. */}
        <main
          className="pds-fade dark pds-embed"
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: "auto",
            background: "var(--pds-navy-mid)",
            padding: 16,
            paddingBottom: isMobile ? 76 : 16,
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile full-screen nav overlay */}
      {isMobile && overlay && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "var(--pds-navy)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              height: "var(--pds-topbar-h)",
              borderBottom: "1px solid var(--pds-border-gold)",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--pds-gold)",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "0.08em",
              }}
            >
              <PolarisMark size={22} title="" />
              POLARIS
            </span>
            <button
              onClick={() => setOverlay(false)}
              aria-label="Close menu"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 6,
              }}
            >
              <TIcon name="x" size={22} color="var(--pds-text-secondary)" />
            </button>
          </div>
          <div style={{ overflowY: "auto" }}>
            <NavList role={role} active={active} onNavigate={go} />
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      {isMobile && (
        <nav
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: 60,
            background: "var(--pds-navy)",
            borderTop: "1px solid var(--pds-border-gold)",
            display: "flex",
            zIndex: 900,
          }}
        >
          {bottomTabs.map((t) => {
            const on = t.screen === active;
            return (
              <button
                key={t.screen}
                onClick={() =>
                  t.screen === "__more" ? setOverlay(true) : go(t.screen)
                }
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  color: on ? "var(--pds-gold)" : "var(--pds-text-secondary)",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                <TIcon
                  name={t.icon}
                  size={20}
                  color={on ? "var(--pds-gold)" : "var(--pds-text-secondary)"}
                />
                {t.label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export { visibleGroups };
