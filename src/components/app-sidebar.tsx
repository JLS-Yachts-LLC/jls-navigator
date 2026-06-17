import { Link, useLocation } from "@tanstack/react-router";
import {
  Ship, FileCheck2, Sailboat, Users, Package, BarChart3,
  ChevronDown, ChevronRight, LogOut, Settings, Search,
  LogIn, ShieldCheck, Compass, Anchor, DoorOpen, Navigation, FileBadge,
  Route, UserCircle2, Car, MapPin, ScrollText, X, ShoppingCart, Truck,
  GraduationCap, Sparkles, Layers as LayersIcon, UserPlus, LayoutDashboard,
  FileText, Wrench, UtensilsCrossed, Cpu, IdCard, Boxes, Cog, ClipboardList,
  Globe, Headset, BookOpen, FileSignature, KeyRound, Zap, Radio,
  Wallet, Receipt, TrendingUp, PiggyBank, FolderOpen, Award, Download,
  MessageSquare, Lightbulb, BotMessageSquare, PenLine, Fuel,
} from "lucide-react";
import { AdminSidebarSection } from "@/components/admin/AdminSidebarSection";
import { useState, useMemo } from "react";
import { PolarisLogo } from "@/components/polaris-logo";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { VesselSwitcher } from "@/components/vessel-switcher";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "captain" | "crew" | "admin" | "staff";

type NavItem = {
  label: string;
  to?: string;
  icon?: React.ComponentType<{ className?: string }>;
  roles?: Role[];       // undefined = all roles; array = specific roles only
  children?: NavItem[];
};

// ─── Nav Config ───────────────────────────────────────────────────────────────
// 8 primary sections. Each maps to existing routes where spec routes don't yet exist.
// Section-level roles control visibility; child items inherit if not specified.

const NAV: NavItem[] = [
  // 1 ─── DASHBOARD
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
  },

  // 2 ─── MY VESSEL
  {
    label: "My Vessel",
    icon: Ship,
    children: [
      { label: "Vessel Overview",       to: "/yachts",               icon: Ship },
      { label: "Live Tracking",         to: "/my-fleet",             icon: Navigation },
      { label: "Statutory Documents",   to: "/esign",                icon: FileSignature },
      { label: "Maintenance",           to: "/orbit/maintenance",    icon: Wrench },
      { label: "Compliance",            to: "/orbit/defects",        icon: ShieldCheck },
      { label: "Emergency Contacts",    to: "/settings",             icon: IdCard },
    ],
  },

  // 3 ─── CREW
  {
    label: "Crew",
    icon: Users,
    children: [
      { label: "Crew List",    to: "/crew-immigration/crew",        icon: UserCircle2 },
      { label: "Visas",        to: "/crew-immigration/visas",       icon: FileText },
      { label: "Sign On / Off", to: "/crew-immigration/sign-on-off", icon: LogIn },
      { label: "Crew Documents", to: "/crew-immigration/documents", icon: ClipboardList },
      { label: "Training",     to: "/training",                     icon: GraduationCap },
      { label: "Crew Benefits", to: "/compass",                     icon: Compass },
    ],
  },

  // 4 ─── REQUESTS  (most-used section)
  {
    label: "Requests",
    icon: ClipboardList,
    children: [
      { label: "Transport Request",   to: "/crew-cab/trips",       icon: Car },
      { label: "Gate Pass Request",   to: "/permits/gate-pass",    icon: DoorOpen },
      { label: "Bunkering Request",   to: "/permits/command-centre", icon: Fuel },
      { label: "Provisioning Request", to: "/provisioning",        icon: UtensilsCrossed },
      { label: "Agency Request",      to: "/agency",               icon: Globe },
      { label: "Technical Support",   to: "/it-tickets",           icon: Headset },
      { label: "General Request",     to: "/permits/command-centre", icon: MessageSquare },
    ],
  },

  // 5 ─── SERVICES  (discovery layer for JLS business units)
  {
    label: "Services",
    icon: Boxes,
    children: [
      { label: "Agency Services",     to: "/agency",              icon: Anchor },
      { label: "ShipSync Logistics",  to: "/packages",            icon: Package },
      { label: "Waypoint Chandlery",  to: "/waypoint",            icon: ShoppingCart },
      { label: "Provisioning",        to: "/provisioning",        icon: UtensilsCrossed },
      { label: "Training Institute",  to: "/training",            icon: GraduationCap },
      { label: "IT Solutions",        to: "/yacht-it",            icon: Cpu },
      { label: "Agency Network",      to: "/agency",              icon: Globe },
    ],
  },

  // 6 ─── FINANCE  (captain + admin/staff only)
  {
    label: "Finance",
    icon: BarChart3,
    roles: ["captain", "admin", "staff"],
    children: [
      { label: "Outstanding Invoices", to: "/finance",            icon: Receipt },
      { label: "Statement of Account", to: "/finance",            icon: Wallet },
      { label: "Quotes",               to: "/finance",            icon: FileText },
      { label: "Approvals",            to: "/finance",            icon: ShieldCheck },
      { label: "Cost Reports",         to: "/director",           icon: TrendingUp },
      { label: "Budgets",              to: "/finance",            icon: PiggyBank },
    ],
  },

  // 7 ─── DOCUMENTS
  {
    label: "Documents",
    icon: FolderOpen,
    children: [
      { label: "Vessel Documents",  to: "/esign",                        icon: Ship },
      { label: "Crew Documents",    to: "/crew-immigration/documents",   icon: Users },
      { label: "Signed Agreements", to: "/esign",                        icon: FileSignature },
      { label: "e-Sign Documents",  to: "/esign",                        icon: PenLine },
      { label: "Certificates",      to: "/training/certifications",      icon: Award },
      { label: "Downloads",         to: "/guides",                       icon: Download },
    ],
  },

  // 8 ─── LEO
  {
    label: "Leo",
    icon: Sparkles,
    children: [
      { label: "Ask Leo",          to: "/ai-assistant",   icon: BotMessageSquare },
      { label: "Create Request",   to: "/ai-assistant",   icon: PenLine },
      { label: "Generate Report",  to: "/ai-assistant",   icon: FileText },
      { label: "Knowledge Base",   to: "/guides",         icon: BookOpen },
      { label: "Search Polaris",   to: "/ai-assistant",   icon: Search },
    ],
  },
];

// ─── Role helpers ─────────────────────────────────────────────────────────────

function resolveRole(user: any): Role {
  const raw = user?.app_metadata?.role ?? "";
  if (raw === "global_admin" || raw === "org_admin") return "admin";
  if (raw === "staff") return "staff";
  if (raw === "crew") return "crew";
  return "captain"; // default for authenticated users
}

function itemVisible(item: NavItem, role: Role): boolean {
  if (!item.roles) return true;
  return item.roles.includes(role);
}

function filterNav(items: NavItem[], role: Role): NavItem[] {
  return items
    .filter(item => itemVisible(item, role))
    .map(item => ({
      ...item,
      children: item.children ? filterNav(item.children, role) : undefined,
    }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function containsPath(item: NavItem, pathname: string): boolean {
  if (item.to) {
    return pathname === item.to || pathname.startsWith(item.to.replace(/\/$/, "") + "/");
  }
  return (item.children ?? []).some(c => containsPath(c, pathname));
}

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

// ─── Nav Node ─────────────────────────────────────────────────────────────────

function NavNode({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const location = useLocation();
  const hasChildren = !!item.children?.length;
  const isActiveDeep = item.to
    ? location.pathname === item.to || location.pathname.startsWith(item.to.replace(/\/$/, "") + "/")
    : false;
  const childActive = hasChildren ? containsPath(item, location.pathname) : false;
  const [open, setOpen] = useState(isActiveDeep || childActive);
  const Icon = item.icon;

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex w-full items-center gap-2 rounded-md py-1.5 text-[13px] font-semibold text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground/90 hover:bg-sidebar-accent/50"
          style={{ paddingLeft: 10 + depth * 12, paddingRight: 8 }}
        >
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-primary/70" />}
          <span className="flex-1 text-left tracking-tight">{item.label}</span>
          {childActive && !open && <span className="h-1.5 w-1.5 rounded-full bg-primary/70 mr-1" />}
          {open
            ? <ChevronDown className="h-3 w-3 opacity-40 transition-transform" />
            : <ChevronRight className="h-3 w-3 opacity-40 transition-transform" />}
        </button>
        {open && (
          <div className="mt-0.5 space-y-px border-l border-sidebar-border/30 ml-[18px]">
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

  const role = resolveRole(user);
  const visibleNav = useMemo(() => filterNav(NAV, role), [role]);

  const searchResults = useMemo(
    () => (searchQ.trim().length >= 1 ? flatSearch(visibleNav, searchQ.trim()) : []),
    [searchQ, visibleNav],
  );

  const isSearching = searchQ.trim().length >= 1;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex items-center px-3 py-3 border-b border-sidebar-border/50">
        <Link to="/dashboard" aria-label="Go to home" className="flex items-center rounded-md transition-opacity hover:opacity-80">
          <PolarisLogo className="h-auto w-[208px] max-w-full" />
        </Link>
      </div>

      {/* Vessel switcher */}
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
          visibleNav.map((item, i) => (
            <div key={item.label}>
              {i > 0 && <div className="mx-2 my-1 h-px bg-sidebar-border/30" />}
              <NavNode item={item} />
            </div>
          ))
        )}
      </nav>

      {/* Admin section — renders only for global_admin / org_admin */}
      <AdminSidebarSection />

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
