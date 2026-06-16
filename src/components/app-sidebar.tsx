import { Link, useLocation } from "@tanstack/react-router";
import {
  Ship, FileCheck2, Sailboat, Users, Package, BarChart3,
  ChevronDown, ChevronRight, LogOut, Settings, Search,
  LogIn, ShieldCheck, Compass, Anchor, DoorOpen, Radio, Navigation, FileBadge,
  Route, UserCircle2, Car, MapPin, ScrollText, X, ShoppingCart, Truck,
  GraduationCap, Sparkles, Layers as LayersIcon, UserPlus, LayoutDashboard,
  FileText, Wrench, UtensilsCrossed, Cpu, IdCard, Boxes, Cog, ClipboardList,
  Globe, Headset, BookOpen, FileSignature, KeyRound, Zap,
} from "lucide-react";
import { AdminSidebarSection } from "@/components/admin/AdminSidebarSection";
import { useViewAsRole, navAllowedFor, ROLE_LABEL } from "@/lib/view-as";
import { useState, useMemo } from "react";
import { DEPARTMENTS } from "@/components/guides/guide-meta";
import { PolarisLogo } from "@/components/polaris-logo";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { VesselSwitcher } from "@/components/vessel-switcher";

type NavItem = {
  label: string;
  to?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
};

const NAV: NavItem[] = [
  // ── One unified area — everything lives under Overview; Guides stays separate ──
  {
    label: "Overview",
    children: [
      { label: "Leo",              to: "/dashboard", icon: Sparkles },
      { label: "Vessel Overview",  to: "/yachts",    icon: Ship },
      { label: "My Fleet (Live)",  to: "/my-fleet",  icon: Navigation },

      // Logistics now parents ShipSync + Transport & Fleet
      {
        label: "Logistics",
        icon: Boxes,
        children: [
          {
            label: "ShipSync",
            icon: Package,
            children: [
              { label: "Packages",           to: "/packages",            icon: Package },
              { label: "Drivers",            to: "/packages/drivers",    icon: UserCircle2 },
              { label: "Deliveries / Route", to: "/packages/deliveries", icon: Truck },
              { label: "Ship Spares",        to: "/ship-spares",         icon: Boxes },
              { label: "Live Tracking",      to: "/fleet-tracking",      icon: Navigation },
            ],
          },
          {
            label: "Transport & Fleet",
            icon: Car,
            children: [
              { label: "Trips",         to: "/crew-cab/trips",     icon: Route },
              { label: "Drivers",       to: "/crew-cab/drivers",   icon: UserCircle2 },
              { label: "Vehicles",      to: "/crew-cab/vehicles",  icon: Car },
              { label: "Locations",     to: "/crew-cab/locations", icon: MapPin },
              { label: "Live Tracking", to: "/fleet-tracking",     icon: Navigation },
              { label: "Maintenance",   to: "/orbit/maintenance",  icon: Wrench },
            ],
          },
        ],
      },

      // Operations now parents Orbit
      {
        label: "Operations",
        icon: Cog,
        children: [
          {
            label: "Orbit",
            icon: LayersIcon,
            children: [
              { label: "Overview",            to: "/orbit/",            icon: LayoutDashboard },
              { label: "Planned Maintenance", to: "/orbit/maintenance", icon: Wrench },
              { label: "Defects & Repairs",   to: "/orbit/defects",     icon: Wrench },
              { label: "Small Boat Mgmt",     to: "/small-boat-registration", icon: Sailboat },
            ],
          },
        ],
      },

      // Waypoint as its own area
      {
        label: "Waypoint",
        icon: ShoppingCart,
        children: [
          { label: "Suppliers",  to: "/waypoint",            icon: Users },
          { label: "Quotations", to: "/waypoint/quotations", icon: FileText },
        ],
      },

      { label: "Finance",     to: "/finance",  icon: BarChart3 },
      { label: "Reports",     to: "/director", icon: FileText },

      {
        label: "Yacht IT Solutions",
        icon: Cpu,
        children: [
          { label: "Service Desk",         to: "/it-tickets", icon: Headset },
          { label: "IT Yachts",            to: "/it-yachts",  icon: Ship },
          { label: "Licensing",            to: "/licensing",  icon: KeyRound },
          { label: "Contracts & Services", to: "/yacht-it",   icon: FileText },
        ],
      },

      // ── Port Operations & Agency — parent folder, nested in Overview ──
      {
        label: "Port Operations & Agency",
        icon: Anchor,
        children: [
          {
            label: "Crew & Immigration",
            icon: IdCard,
            children: [
              { label: "Crew List",          to: "/crew-immigration/crew",        icon: UserCircle2 },
              { label: "Visas",              to: "/crew-immigration/visas",       icon: FileText },
              { label: "Sign On / Sign Off", to: "/crew-immigration/sign-on-off", icon: LogIn },
              { label: "Crew Documents",     to: "/crew-immigration/documents",   icon: ClipboardList },
            ],
          },
          { label: "Command Centre",        to: "/permits/command-centre",      icon: ShieldCheck },
          { label: "Exit & Entry Permits",  to: "/permits/exit-entry",          icon: LogIn },
          { label: "Sanitation",            to: "/permits/sanitation",          icon: ShieldCheck },
          { label: "Cruising — Mothership", to: "/permits/cruising-mothership", icon: Compass },
          { label: "Cruising — Tenders",    to: "/permits/cruising-tenders",    icon: Anchor },
          { label: "Gate Pass",             to: "/permits/gate-pass",           icon: DoorOpen },
          { label: "TDRA",                  to: "/permits/tdra",                icon: Radio },
          { label: "Navigation License",    to: "/permits/navigation-license",  icon: Navigation },
          { label: "DMA Permits",           to: "/permits/dma",                 icon: FileBadge },
          { label: "Abu Dhabi Permits",     to: "/permits/abu-dhabi",           icon: Anchor },
          {
            label: "Crew Placement",
            icon: UserPlus,
            children: [
              { label: "Candidates", to: "/crew-placement",           icon: UserPlus },
              { label: "Vacancies",  to: "/crew-placement/vacancies", icon: ClipboardList },
            ],
          },
          { label: "Small Boat Registration", to: "/small-boat-registration", icon: Sailboat },
        ],
      },

      // ── Other former Modules items ──
      { label: "Superyacht Provisioning", to: "/provisioning", icon: UtensilsCrossed },
      {
        label: "JLS Training Institute",
        icon: GraduationCap,
        children: [
          { label: "Training Records", to: "/training",                icon: GraduationCap },
          { label: "Certifications",   to: "/training/certifications", icon: FileCheck2 },
        ],
      },
      { label: "Agency Network", to: "/agency", icon: Globe },
      { label: "Documents & e-Sign",     to: "/esign",        icon: FileSignature },
      { label: "Automations",            to: "/automations",  icon: Zap },
      { label: "Leo Assistant",          to: "/ai-assistant", icon: Sparkles },
      { label: "Compass",                to: "/compass",      icon: Compass },
      { label: "Changelog",              to: "/changelog",    icon: ScrollText },

      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },

  // ── GUIDES — hidden for now (restore this block to bring it back) ────────────
  // {
  //   label: "Guides",
  //   children: [
  //     { label: "All Guides", to: "/guides", icon: BookOpen },
  //     ...DEPARTMENTS.map(d => ({ label: d.label, to: `/guides/${d.key}`, icon: d.icon })),
  //   ],
  // },
];
// Referenced only by the (currently hidden) Guides section above.
void BookOpen; void DEPARTMENTS;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** True if this item or any descendant matches the current pathname */
function containsPath(item: NavItem, pathname: string): boolean {
  if (item.to) {
    return pathname === item.to || pathname.startsWith(item.to.replace(/\/$/, "") + "/");
  }
  return (item.children ?? []).some(c => containsPath(c, pathname));
}

/** Flatten the nav tree into leaf items (those with a `to`) that match the query */
function flatSearch(items: NavItem[], query: string): NavItem[] {
  const q = query.toLowerCase();
  const results: NavItem[] = [];
  function walk(list: NavItem[]) {
    for (const item of list) {
      if (item.to && item.label.toLowerCase().includes(q)) results.push(item);
      if (item.children) walk(item.children);
    }
  }
  walk(items);
  return results;
}

/** Filter the nav tree to items whose route is allowed for a previewed role. */
function filterNav(items: NavItem[], allowed: string[]): NavItem[] {
  const ok = (to?: string) => !!to && allowed.some(p => to === p || to.startsWith(p + "/"));
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.children?.length) {
      const kids = filterNav(item.children, allowed);
      if (kids.length) out.push({ ...item, children: kids });
    } else if (ok(item.to)) {
      out.push(item);
    }
  }
  return out;
}

// ─── Nav Node ─────────────────────────────────────────────────────────────────

function NavNode({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const location = useLocation();
  const hasChildren = !!item.children?.length;
  const isActiveDeep = item.to
    ? location.pathname === item.to || location.pathname.startsWith(item.to.replace(/\/$/, "") + "/")
    : false;
  const childActive = hasChildren ? containsPath(item, location.pathname) : false;
  const [open, setOpen] = useState(depth === 0 || isActiveDeep || childActive);
  const Icon = item.icon;

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex w-full items-center gap-2 rounded-md py-1.5 text-[13px] font-semibold text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground/90 hover:bg-sidebar-accent/50"
          style={{ paddingLeft: 10 + depth * 12, paddingRight: 8 }}
        >
          {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${depth === 0 ? "text-sidebar-foreground/40" : "text-primary/70"}`} />}
          <span className={`flex-1 text-left tracking-tight ${depth === 0 ? "text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/40" : ""}`}>
            {item.label}
          </span>
          {childActive && !open && <span className="h-1.5 w-1.5 rounded-full bg-primary/70 mr-1" />}
          {open
            ? <ChevronDown className="h-3 w-3 opacity-40 transition-transform" />
            : <ChevronRight className="h-3 w-3 opacity-40 transition-transform" />}
        </button>
        {open && (
          <div className={`mt-0.5 space-y-px ${depth === 0 ? "border-l border-sidebar-border/50 ml-4" : "border-l border-sidebar-border/30 ml-[18px]"}`}>
            {item.children!.map(c => (
              <NavNode key={c.label} item={c} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      to={item.to!}
      className="group/navlink mx-1.5 flex items-center gap-2.5 rounded-lg py-1.5 text-[13px] text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent/50 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-white data-[active=true]:font-semibold data-[active=true]:shadow-sm"
      data-active={isActiveDeep}
      style={{ paddingLeft: 10 + depth * 10, paddingRight: 8 }}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-60 group-data-[active=true]/navlink:opacity-100 group-data-[active=true]/navlink:text-sidebar-primary" />}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** Flat search result row */
function SearchResult({ item }: { item: NavItem }) {
  const location = useLocation();
  const isActive = item.to
    ? location.pathname === item.to || location.pathname.startsWith(item.to.replace(/\/$/, "") + "/")
    : false;
  const Icon = item.icon;
  return (
    <Link
      to={item.to!}
      className="group/navlink mx-1.5 flex items-center gap-2.5 rounded-lg py-1.5 text-[13px] text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent/50 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-white data-[active=true]:font-semibold data-[active=true]:shadow-sm"
      data-active={isActive}
      style={{ paddingLeft: 10, paddingRight: 8 }}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-60 group-data-[active=true]/navlink:opacity-100 group-data-[active=true]/navlink:text-sidebar-primary" />}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const [searchQ, setSearchQ] = useState("");
  const viewAsRole = useViewAsRole();

  // When previewing a client/crew role, scope the nav to that role's allowed routes.
  const allowed = navAllowedFor(viewAsRole);
  const nav = useMemo(() => (allowed ? filterNav(NAV, allowed) : NAV), [viewAsRole]);

  const searchResults = useMemo(
    () => (searchQ.trim().length >= 1 ? flatSearch(nav, searchQ.trim()) : []),
    [searchQ, nav],
  );

  const isSearching = searchQ.trim().length >= 1;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Polaris logo lockup */}
      <div className="flex items-center px-3 py-3 border-b border-sidebar-border/50">
        <Link to="/dashboard" aria-label="Go to home" className="flex items-center rounded-md transition-opacity hover:opacity-80">
          <PolarisLogo className="h-auto w-[208px] max-w-full" />
        </Link>
      </div>

      {/* Active vessel switcher */}
      <VesselSwitcher />

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-sidebar-foreground/30" />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Quick find…"
            className="h-8 w-full rounded-md border border-sidebar-border/60 bg-sidebar-accent/30 pl-8 pr-7 text-[12px] text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
          />
          {isSearching && (
            <button
              onClick={() => setSearchQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-foreground/30 hover:text-sidebar-foreground transition"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-px">
        {isSearching ? (
          searchResults.length > 0 ? (
            searchResults.map(item => <SearchResult key={item.to} item={item} />)
          ) : (
            <p className="px-3 py-3 text-[11px] text-sidebar-foreground/40">No results for "{searchQ}"</p>
          )
        ) : (
          nav.map((item, i) => (
            <div key={item.label}>
              {i > 0 && !item.to && <div className="mx-2 my-1.5 h-px bg-sidebar-border/50" />}
              <NavNode item={item} />
            </div>
          ))
        )}
      </nav>

      {/* Client-view preview badge */}
      {viewAsRole && (
        <div className="mx-2 mb-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[10.5px] font-medium text-amber-400">
          Previewing as {ROLE_LABEL[viewAsRole] ?? viewAsRole}
        </div>
      )}

      {/* Admin section — hidden while previewing a client view */}
      {!viewAsRole && <AdminSidebarSection />}

      {/* User footer */}
      <div className="border-t border-sidebar-border/70 p-2.5 space-y-1">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-primary/30 bg-primary/15 text-[10px] font-bold text-primary">
            {(user?.email ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate text-[11px] font-medium text-sidebar-foreground/80">{user?.email ?? "Guest"}</div>
            <div className="text-[9.5px] text-sidebar-foreground/35 tracking-wide">Signed in</div>
          </div>
          <Link
            to="/settings"
            className="flex h-6 w-6 items-center justify-center rounded text-sidebar-foreground/35 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            title="Settings & Users"
          >
            <Settings className="h-3.5 w-3.5" />
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut} className="h-6 w-6 p-0 text-sidebar-foreground/35 hover:text-sidebar-foreground hover:bg-transparent" title="Sign out">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
