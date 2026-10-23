import { useState, useEffect, useCallback } from "react";
import { Loader2, Package, Truck, Warehouse, Users, BarChart3, Smartphone, ArrowDownToLine, ArrowUpFromLine, Route, Navigation, MapPin, LifeBuoy, Boxes, Archive, FileCheck2, LayoutDashboard, DoorOpen, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadDeliverablePackages, isLocalPackage, loadDrivers, loadNotes, loadDestinations, loadDeliverySchedules, loadVehicles, loadYachtNames,
} from "@/lib/shipsync/data";
import { ShipSyncLocations } from "@/components/shipsync/ShipSyncLocations";
import type {
  ShipSyncPackage, ShipSyncDriver, ShipSyncDeliveryNote, ShipSyncDestination, ShipSyncDeliverySchedule, ShipSyncVehicle,
} from "@/lib/shipsync/model";
import { ShipSyncPackages } from "@/components/shipsync/ShipSyncPackages";
import { ShipSyncImportBoard } from "@/components/shipsync/ShipSyncImportBoard";
import { ShipSyncExportBoard } from "@/components/shipsync/ShipSyncExportBoard";
import { ShipSyncEdasBoard } from "@/components/shipsync/ShipSyncEdasBoard";
import { ShipSyncDispatch } from "@/components/shipsync/ShipSyncDispatch";
import { ShipSyncRouting } from "@/components/shipsync/ShipSyncRouting";
import { ShipSyncWarehouse } from "@/components/shipsync/ShipSyncWarehouse";
import { ShipSyncThirdPartyStorage } from "@/components/shipsync/ShipSyncThirdPartyStorage";
import { ShipSyncDrivers } from "@/components/shipsync/ShipSyncDrivers";
import { ShipSyncDashboard } from "@/components/shipsync/ShipSyncDashboard";
import { ShipSyncOverview } from "@/components/shipsync/ShipSyncOverview";
import { ShipSyncGatePassBoard } from "@/components/shipsync/ShipSyncGatePassBoard";
import { ShipSyncPrinters } from "@/components/shipsync/ShipSyncPrinters";
import { TableSkeleton } from "@/components/shipsync/shared";
import { FleetTrackingPage } from "@/components/fleet-tracking-page";
import { supabase } from "@/integrations/supabase/client";

export interface ShipSyncData {
  /** Local Packages: the Local (and untagged) parcels only. */
  packages: ShipSyncPackage[];
  /** Everything that can go out on a van — Local plus Import and Transit — for Routing and Dispatched. */
  deliverable: ShipSyncPackage[];
  drivers: ShipSyncDriver[];
  notes: ShipSyncDeliveryNote[];
  destinations: ShipSyncDestination[];
  schedule: ShipSyncDeliverySchedule[];
  vehicles: ShipSyncVehicle[];
  yachts: string[]; // all active vessel names — selectable at check-in even without packages
}

const TABS = [
  { key: "overview", label: "Overview",       icon: LayoutDashboard },
  { key: "packages", label: "Local Packages", icon: Package },
  { key: "import",   label: "Import",         icon: ArrowDownToLine },
  { key: "export",   label: "Export",         icon: ArrowUpFromLine },
  { key: "edas",     label: "EDAS",           icon: FileCheck2 },
  { key: "gatepass", label: "Gate Pass",      icon: DoorOpen },
  { key: "routing",  label: "Routing",        icon: Route },
  { key: "dispatch", label: "Dispatched",     icon: Truck },
  { key: "warehouse", label: "Warehouse",     icon: Warehouse },
  { key: "thirdparty", label: "3rd Party Storage", icon: Archive },
  { key: "locations", label: "Locations",     icon: MapPin },
  { key: "drivers",  label: "Drivers",        icon: Users },
  { key: "tracking", label: "Van Tracking",   icon: Navigation },
  { key: "printers", label: "Printers",       icon: Printer },
  { key: "dashboard", label: "Dashboard",     icon: BarChart3 },
] as const;

/** Resolve a promise, or reject after `ms` — so one wedged request can't trap the
 *  whole page on a spinner forever (surfaces an error + Retry instead). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

const TAB_KEYS = TABS.map((t) => t.key) as readonly string[];

export function ShipSyncPage({ initialTab }: { initialTab?: string } = {}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>(
    initialTab && TAB_KEYS.includes(initialTab) ? (initialTab as (typeof TABS)[number]["key"]) : "overview",
  );
  // Keep the open tab in view when the tab row is scrolled sideways (only when the tab changes, so a manual scroll isn't undone).
  useEffect(() => { document.querySelector("[data-shipsync-tab=active]")?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [tab]);
  const [data, setData] = useState<ShipSyncData>({ packages: [], deliverable: [], drivers: [], notes: [], destinations: [], schedule: [], vehicles: [], yachts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Set when the packages couldn't be loaded — without it Local Packages, Routing and Dispatched just look empty. */
  const [packagesProblem, setPackagesProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    // allSettled + per-source fallbacks: one failing/slow query degrades that
    // section gracefully instead of blanking or hanging the whole module.
    let problem: string | null = null;
    // The packages are the heart of this page, so a failure is retried once and, if it still fails, said out loud rather than shown as an empty list.
    const loadPackagesOrSay = async (): Promise<ShipSyncData["packages"]> => {
      try { return await withTimeout(loadDeliverablePackages(), 20000, "Packages"); }
      catch {
        try { return await withTimeout(loadDeliverablePackages(), 40000, "Packages"); }
        catch (e: any) { problem = e?.message ?? "The packages didn't load"; return []; }
      }
    };
    const [deliverable, drivers, notes, destinations, schedule, vehicles, yachts] = await Promise.all([
      loadPackagesOrSay(),
      withTimeout(loadDrivers(), 20000, "Drivers").catch(() => [] as ShipSyncData["drivers"]),
      withTimeout(loadNotes(), 20000, "Notes").catch(() => [] as ShipSyncData["notes"]),
      withTimeout(loadDestinations(), 20000, "Destinations").catch(() => [] as ShipSyncData["destinations"]),
      withTimeout(loadDeliverySchedules(), 20000, "Schedule").catch(() => [] as ShipSyncData["schedule"]),
      withTimeout(loadVehicles(), 20000, "Vehicles").catch(() => [] as ShipSyncData["vehicles"]),
      withTimeout(loadYachtNames(), 20000, "Yachts").catch(() => [] as string[]),
    ]);
    // Signed out, the database answers with an empty list rather than an error — tell that apart from "no packages".
    if (!problem && deliverable.length === 0) {
      const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (!sess.session) problem = "Your sign-in has expired";
    }
    setPackagesProblem(problem);
    setData({ packages: deliverable.filter(isLocalPackage), deliverable, drivers, notes, destinations, schedule, vehicles, yachts });
  }, []);

  const runReload = useCallback(() => {
    setLoading(true); setError(null);
    reload()
      .catch((e) => setError(e?.message ?? "Could not load ShipSync data"))
      .finally(() => setLoading(false));
  }, [reload]);

  useEffect(() => { runReload(); }, [runReload]);

  return (
    <div className="shipsync-ui flex h-full min-w-0 flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-1.5">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[1.15rem] font-semibold leading-tight tracking-tight">ShipSync</h1>
          <span className="hidden text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60 sm:inline">JLS Yacht Logistics</span>
        </div>
        <div className="flex items-center gap-2">
          <a href="mailto:support@newhorizon-it.co.uk?subject=ShipSync%20problem%20report" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:border-primary/50 hover:text-foreground">
            <LifeBuoy className="h-4 w-4" /> Report a problem
          </a>
          {/* The two standalone apps, launched side by side (each opens full-screen). */}
          <a href="/shipsync/logistics" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 hover:border-primary/50">
            <Boxes className="h-4 w-4" /> Logistics app
          </a>
          <a href="/logistics-app" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/5 px-3 py-1.5 text-[13px] font-medium text-primary transition-colors duration-150 hover:bg-primary/10">
            <Package className="h-4 w-4" /> Logistics mobile
          </a>
          <a href="/shipsync/driver" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 hover:border-primary/50">
            <Smartphone className="h-4 w-4" /> Driver app
          </a>
        </div>
      </header>

      {/* Tabs */}
      {/* More tabs than fit across: the row scrolls sideways (drag the slider, swipe, or use the mouse wheel) instead of squeezing the labels. */}
      <div className="pds-scroll flex gap-1 overflow-x-auto border-b border-border/60 bg-card/20 px-4"
        onWheel={(e) => { if (e.deltaY !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              data-shipsync-tab={active ? "active" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-1.5 text-sm font-medium transition-colors duration-150",
                active ? "border-primary bg-primary/10 font-semibold text-foreground" : "border-transparent text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
              )}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* min-h-0 is load-bearing: without it this flex-1 child's min-height
          defaults to its content's height, so it never actually shrinks to
          fit and the overflow escapes to the New View shell's own <main>
          instead — which hides its scrollbar app-wide, so scrolling still
          worked but with no visible thumb (and no pds-scroll styling). */}
      {packagesProblem && !loading && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-[13px] text-amber-600 dark:text-amber-400">
          <span><strong>The packages didn't load</strong> — {packagesProblem}. Local Packages, Routing and Dispatched will look empty until they do.</span>
          <button onClick={runReload} className="rounded-md border border-amber-500/40 px-2.5 py-1 font-medium hover:bg-amber-500/10">Try again</button>
          {/expired/i.test(packagesProblem) && <button onClick={() => window.location.reload()} className="rounded-md border border-amber-500/40 px-2.5 py-1 font-medium hover:bg-amber-500/10">Refresh the page</button>}
        </div>
      )}
      <div className="pds-scroll min-h-0 min-w-0 flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">Couldn’t load ShipSync data.<br /><span className="text-xs text-muted-foreground/70">{error}</span></p>
            <button onClick={runReload} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-primary/50">Retry</button>
          </div>
        ) : (
          <>
            {tab === "overview" && <ShipSyncOverview data={data} />}
            {tab === "packages" && <ShipSyncPackages data={data} reload={reload} />}
            {tab === "import" && <ShipSyncImportBoard />}
            {tab === "export" && <ShipSyncExportBoard />}
            {tab === "edas" && <ShipSyncEdasBoard />}
            {tab === "gatepass" && <ShipSyncGatePassBoard />}
            {tab === "dispatch" && <ShipSyncDispatch data={data} reload={reload} />}
            {tab === "routing" && <ShipSyncRouting data={data} reload={reload} />}
            {tab === "warehouse" && <ShipSyncWarehouse data={data} reload={reload} />}
            {tab === "thirdparty" && <ShipSyncThirdPartyStorage />}
            {tab === "locations" && <ShipSyncLocations data={data} reload={reload} />}
            {tab === "drivers" && <ShipSyncDrivers data={data} reload={reload} />}
            {tab === "tracking" && <FleetTrackingPage />}
            {tab === "printers" && <ShipSyncPrinters />}
            {tab === "dashboard" && <ShipSyncDashboard data={data} />}
          </>
        )}
      </div>
    </div>
  );
}

export default ShipSyncPage;
