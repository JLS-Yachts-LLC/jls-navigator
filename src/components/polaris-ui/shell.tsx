/**
 * Polaris Redesign — app shell (#195).
 * PolarisTopBar · PolarisSideNav · mobile overlay + bottom tab bar · PolarisShell.
 * Mobile-first: side nav hidden < 768px (hamburger overlay + bottom tabs); desktop
 * shows the fixed side nav. Role-based nav visibility per the redesign spec.
 */
import { useEffect, useState, type ReactNode } from "react";
import { TIcon } from "./primitives";
import { ViewAsSwitcher, OnlineUsers } from "@/components/top-bar";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { GlobalSearch } from "./global-search";
import { useTheme } from "@/lib/theme";

export type PolarisRole =
  | "global_admin"
  | "crew_immigration"
  | "captain"
  | "crew";

export interface NavItem {
  label: string;
  icon: string;
  screen: string;
  roles?: PolarisRole[]; // undefined = all roles
  /** Route-backed item: navigates to this app route (rendered inside the same
   *  Polaris chrome by AppLayout) instead of switching an in-shell screen. */
  route?: string;
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
        icon: "ship",
        screen: "vessels",
        roles: ["global_admin", "crew_immigration", "captain"],
      },
      {
        label: "Crew",
        icon: "users",
        screen: "crew",
        roles: ["global_admin", "crew_immigration", "captain", "crew"],
      },
      {
        label: "Compliance",
        icon: "shield-check",
        screen: "compliance",
        roles: ["global_admin", "crew_immigration", "captain"],
      },
      {
        // Permits hub — Command Centre + one mini tab per permit type
        // (gate pass, cruising, exit & entry, …).
        label: "Permits",
        icon: "license",
        screen: "permits",
        roles: ["global_admin", "crew_immigration", "captain"],
      },
    ],
  },
  {
    label: "Services",
    items: [
      {
        // Immigration hub — tabs into Visa + Sign On/Off (the real pages).
        label: "Immigration",
        icon: "id-badge",
        screen: "immigration",
        roles: ["global_admin", "crew_immigration"],
      },
      { label: "Logistics", icon: "truck", screen: "logistics" },
      { label: "Crew Cab", icon: "car", screen: "route-crew-cab", route: "/crew-cab/trips" },
      { label: "Agency", icon: "world", screen: "route-agency", route: "/agency" },
      { label: "Provisioning", icon: "tools-kitchen-2", screen: "route-provisioning", route: "/provisioning" },
      { label: "Waypoint Chandlery", icon: "shopping-cart", screen: "route-waypoint", route: "/waypoint" },
      { label: "Seaport Immigration", icon: "building-lighthouse", screen: "route-seaport", route: "/seaport", roles: ["global_admin", "crew_immigration"] },
      { label: "Training", icon: "certificate", screen: "training" },
      { label: "Yacht IT Solutions", icon: "cpu", screen: "yacht-it" },
      { label: "Anchor", icon: "signature", screen: "anchor" },
      { label: "Crew Placement", icon: "user-star", screen: "crew-placement", roles: ["global_admin", "crew_immigration"] },
      { label: "Finance", icon: "report-money", screen: "finance", roles: ["global_admin"] },
      { label: "QuickBooks Import", icon: "file-spreadsheet", screen: "route-qb-import", route: "/qb-import", roles: ["global_admin"] },
      { label: "Port Calls", icon: "anchor", screen: "port-calls" },
      { label: "Berth Billing", icon: "receipt-2", screen: "berth-billing", roles: ["global_admin"] },
      { label: "Orbit", icon: "orbit", screen: "orbit" },
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
    label: "Reports",
    items: [
      {
        label: "Visa Reports",
        icon: "file-description",
        screen: "visa-reports",
        roles: ["global_admin", "crew_immigration", "captain"],
      },
      { label: "Sign On/Off", icon: "clipboard-list", screen: "soso-reports" },
      { label: "Crew Documents", icon: "files", screen: "documents" },
      {
        label: "Spreadsheet Sync",
        icon: "refresh",
        screen: "route-visa-sync",
        route: "/crew-immigration/visas/sync",
        roles: ["global_admin", "crew_immigration"],
      },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Knowledge Base", icon: "book", screen: "route-guides", route: "/guides" },
      { label: "e-Sign Documents", icon: "writing-sign", screen: "route-esign", route: "/esign" },
      { label: "Directory", icon: "address-book", screen: "route-directory", route: "/directory" },
      { label: "Crew Benefits", icon: "compass", screen: "route-compass", route: "/compass" },
      { label: "Emergency Contacts", icon: "phone", screen: "route-emergency", route: "/emergency-contacts" },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        label: "Settings",
        icon: "settings",
        screen: "settings",
        roles: ["global_admin"],
      },
      {
        label: "Recycle Bin",
        icon: "trash",
        screen: "route-recycle-bin",
        route: "/recycle-bin",
        roles: ["global_admin", "crew_immigration"],
      },
    ],
  },
  {
    label: "Admin Settings",
    items: [
      { label: "Dev Settings", icon: "adjustments", screen: "admin-dev", roles: ["global_admin"] },
      { label: "Changelog", icon: "news", screen: "admin-changelog", roles: ["global_admin"] },
      { label: "Automations", icon: "bolt", screen: "admin-automations", roles: ["global_admin"] },
      { label: "Error & Warnings", icon: "alert-triangle", screen: "admin-errors", roles: ["global_admin"] },
      { label: "Integrations", icon: "plug", screen: "admin-integrations", roles: ["global_admin"] },
      { label: "Sync", icon: "refresh", screen: "admin-sync", roles: ["global_admin"] },
      { label: "Feedback", icon: "message-2", screen: "admin-feedback", roles: ["global_admin"] },
    ],
  },
];

function visibleGroups(role: PolarisRole): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
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
        <span
          style={{
            color: "var(--pds-gold)",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.08em",
          }}
        >
          POLARIS
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
        <div
          aria-label={`User: ${userName}`}
          title={userName}
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "var(--pds-gold-muted)",
            border: "1px solid var(--pds-border-gold)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--pds-gold)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {userInitials}
        </div>
      </div>
    </header>
  );
}

// ── Side nav (desktop) / overlay body (mobile) ───────────────────────────────
function NavList({
  role,
  active,
  onNavigate,
}: {
  role: PolarisRole;
  active: string;
  onNavigate: (s: string) => void;
}) {
  return (
    <nav
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        padding: "16px 12px",
      }}
    >
      {visibleGroups(role).map((g) => (
        <div key={g.label}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--pds-text-hint)",
              padding: "0 8px 6px",
            }}
          >
            {g.label}
          </div>
          {g.items.map((item) => {
            const on = item.screen === active;
            return (
              <button
                key={item.screen}
                onClick={() => onNavigate(item.screen)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 8px",
                  minHeight: 44,
                  borderRadius: "var(--pds-radius-md)",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  background: on ? "var(--pds-gold-muted)" : "transparent",
                  color: on
                    ? "var(--pds-gold-light)"
                    : "var(--pds-text-secondary)",
                  fontSize: "var(--pds-fs-nav)",
                  fontWeight: on ? 600 : 500,
                }}
              >
                <TIcon
                  name={item.icon}
                  size={18}
                  color={on ? "var(--pds-gold)" : "var(--pds-text-secondary)"}
                />
                {item.label}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
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

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {!isMobile && (
          <aside
            style={{
              width: "var(--pds-nav-w)",
              flexShrink: 0,
              background: "var(--pds-navy)",
              borderRight: "1px solid var(--pds-border)",
              overflowY: "auto",
            }}
          >
            <NavList role={role} active={active} onNavigate={onNavigate} />
          </aside>
        )}

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
                color: "var(--pds-gold)",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "0.08em",
              }}
            >
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
