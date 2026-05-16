import { Link, useLocation } from "@tanstack/react-router";
import {
  Ship, FileCheck2, Sailboat, Orbit, Users, Package, BarChart3,
  ChevronDown, ChevronRight, LogOut, Settings, Search,
  LogIn, ShieldCheck, Compass, Anchor, DoorOpen, Radio, Navigation, FileBadge, LayoutGrid,
  Route, UserCircle2, Car, MapPin, ScrollText,
} from "lucide-react";
import { useState } from "react";
import logo from "@/assets/jls-logo.png";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type NavItem = {
  label: string;
  to?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
};

const NAV: NavItem[] = [
  {
    label: "Port & Operations",
    icon: LayoutGrid,
    children: [
      { label: "Yachts", to: "/yachts", icon: Ship },
      {
        label: "Permits",
        icon: FileCheck2,
        children: [
          { label: "Exit & Entry Permits", to: "/permits/exit-entry", icon: LogIn },
          { label: "Sanitation", to: "/permits/sanitation", icon: ShieldCheck },
          { label: "Cruising Permit — Mot...", to: "/permits/cruising-mothership", icon: Compass },
          { label: "Cruising Permit — Ten...", to: "/permits/cruising-tenders", icon: Anchor },
          { label: "Gate Pass", to: "/permits/gate-pass", icon: DoorOpen },
          { label: "TDRA", to: "/permits/tdra", icon: Radio },
          { label: "Navigation License", to: "/permits/navigation-license", icon: Navigation },
          { label: "DMA Permits", to: "/permits/dma", icon: FileBadge },
        ],
      },
      { label: "Small Boat Registration", to: "/small-boat-registration", icon: Sailboat },
    ],
  },
  { label: "Orbit", to: "/orbit", icon: Orbit },
  {
    label: "Crew Cab",
    icon: Users,
    children: [
      { label: "Trips", to: "/crew-cab/trips", icon: Route },
      { label: "Drivers", to: "/crew-cab/drivers", icon: UserCircle2 },
      { label: "Vehicles", to: "/crew-cab/vehicles", icon: Car },
      { label: "Locations", to: "/crew-cab/locations", icon: MapPin },
    ],
  },
  { label: "Packages & Deliveries", to: "/packages", icon: Package },
  {
    label: "Director",
    icon: BarChart3,
    children: [
      { label: "Dashboard", to: "/director", icon: BarChart3 },
      { label: "Settings", to: "/settings", icon: Settings },
      { label: "Changelog", to: "/changelog", icon: ScrollText },
    ],
  },
];

function NavNode({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const location = useLocation();
  const hasChildren = !!item.children?.length;
  const isActiveDeep = item.to ? location.pathname === item.to || location.pathname.startsWith(item.to + "/") : false;
  const containsActive = hasChildren
    ? JSON.stringify(item.children).includes(`"${location.pathname}"`)
    : false;
  const [open, setOpen] = useState(depth === 0 || isActiveDeep || containsActive);
  const Icon = item.icon;

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          style={{ paddingLeft: 10 + depth * 12 }}
        >
          {Icon && <Icon className="h-4 w-4 shrink-0 text-primary/80" />}
          <span className="flex-1 text-left">{item.label}</span>
          {open ? <ChevronDown className="h-3.5 w-3.5 opacity-60" /> : <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
        </button>
        {open && (
          <div className="mt-0.5 space-y-0.5 border-l border-sidebar-border ml-[18px]">
            {item.children!.map((c) => (
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
      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground/75 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-medium"
      data-active={isActiveDeep}
      style={{ paddingLeft: 10 + depth * 12 }}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function AppSidebar() {
  const { user, signOut } = useAuth();
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white p-1">
          <img src={logo} alt="JLS Yachts" className="h-full w-full object-contain" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-sm font-bold tracking-tight">JLS Yachts</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">A Family of Excellence</div>
        </div>
      </div>

      <div className="px-3 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search…"
            className="h-8 w-full rounded-md border border-sidebar-border bg-sidebar-accent/40 pl-8 pr-2 text-xs text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
        {NAV.map((item) => (
          <NavNode key={item.label} item={item} />
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-1">
        <div className="flex items-center gap-2 px-1.5 py-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary">
            {(user?.email ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate text-xs font-medium">{user?.email ?? "Guest"}</div>
            <div className="text-[10px] text-muted-foreground">Signed in</div>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={signOut} className="h-7 px-2 text-xs gap-1.5">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </div>
    </aside>
  );
}
