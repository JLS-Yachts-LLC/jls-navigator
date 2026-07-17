import { useState, useEffect, useCallback } from "react";
import { Loader2, Package, Truck, Warehouse, Users, BarChart3, Smartphone, ArrowDownToLine, ArrowUpFromLine, Route, Navigation, MapPin, LifeBuoy, Boxes, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadPackages, loadDrivers, loadNotes, loadDestinations, loadDeliverySchedules, loadVehicles, loadYachtNames,
} from "@/lib/shipsync/data";
import { ShipSyncLocations } from "@/components/shipsync/ShipSyncLocations";
import type {
  ShipSyncPackage, ShipSyncDriver, ShipSyncDeliveryNote, ShipSyncDestination, ShipSyncDeliverySchedule, ShipSyncVehicle,
} from "@/lib/shipsync/model";
import { ShipSyncPackages } from "@/components/shipsync/ShipSyncPackages";
import { ShipSyncShipments } from "@/components/shipsync/ShipSyncShipments";
import { ShipSyncDispatch } from "@/components/shipsync/ShipSyncDispatch";
import { ShipSyncRouting } from "@/components/shipsync/ShipSyncRouting";
import { ShipSyncWarehouse } from "@/components/shipsync/ShipSyncWarehouse";
import { ShipSyncDrivers } from "@/components/shipsync/ShipSyncDrivers";
import { ShipSyncDashboard } from "@/components/shipsync/ShipSyncDashboard";
import { ParcelChecker } from "@/components/shipsync/ParcelChecker";
import { FleetTrackingPage } from "@/components/fleet-tracking-page";

export interface ShipSyncData {
  packages: ShipSyncPackage[];
  drivers: ShipSyncDriver[];
  notes: ShipSyncDeliveryNote[];
  destinations: ShipSyncDestination[];
  schedule: ShipSyncDeliverySchedule[];
  vehicles: ShipSyncVehicle[];
  yachts: string[]; // all active vessel names — selectable at check-in even without packages
}

const TABS = [
  { key: "packages", label: "Local Packages", icon: Package },
  { key: "import",   label: "Import",         icon: ArrowDownToLine },
  { key: "export",   label: "Export",         icon: ArrowUpFromLine },
  { key: "routing",  label: "Routing",        icon: Route },
  { key: "dispatch", label: "Dispatched",     icon: Truck },
  { key: "warehouse", label: "Warehouse",     icon: Warehouse },
  { key: "checker",  label: "Parcel Checker", icon: ScanLine },
  { key: "locations", label: "Locations",     icon: MapPin },
  { key: "drivers",  label: "Drivers",        icon: Users },
  { key: "tracking", label: "Van Tracking",   icon: Navigation },
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

export function ShipSyncPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("packages");
  const [data, setData] = useState<ShipSyncData>({ packages: [], drivers: [], notes: [], destinations: [], schedule: [], vehicles: [], yachts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    // allSettled + per-source fallbacks: one failing/slow query degrades that
    // section gracefully instead of blanking or hanging the whole module.
    const [packages, drivers, notes, destinations, schedule, vehicles, yachts] = await Promise.all([
      withTimeout(loadPackages(), 20000, "Packages").catch(() => [] as ShipSyncData["packages"]),
      withTimeout(loadDrivers(), 20000, "Drivers").catch(() => [] as ShipSyncData["drivers"]),
      withTimeout(loadNotes(), 20000, "Notes").catch(() => [] as ShipSyncData["notes"]),
      withTimeout(loadDestinations(), 20000, "Destinations").catch(() => [] as ShipSyncData["destinations"]),
      withTimeout(loadDeliverySchedules(), 20000, "Schedule").catch(() => [] as ShipSyncData["schedule"]),
      withTimeout(loadVehicles(), 20000, "Vehicles").catch(() => [] as ShipSyncData["vehicles"]),
      withTimeout(loadYachtNames(), 20000, "Yachts").catch(() => [] as string[]),
    ]);
    setData({ packages, drivers, notes, destinations, schedule, vehicles, yachts });
  }, []);

  const runReload = useCallback(() => {
    setLoading(true); setError(null);
    reload()
      .catch((e) => setError(e?.message ?? "Could not load ShipSync data"))
      .finally(() => setLoading(false));
  }, [reload]);

  useEffect(() => { runReload(); }, [runReload]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">JLS Yacht Logistics</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">ShipSync</h1>
        </div>
        <div className="flex items-center gap-2">
          <a href="mailto:support@newhorizon-it.co.uk?subject=ShipSync%20problem%20report" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground">
            <LifeBuoy className="h-4 w-4" /> Report a problem
          </a>
          {/* The two apps as a pair — Logistics (active, this view) + Driver app. */}
          <button onClick={() => setTab("packages")} className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
            <Boxes className="h-4 w-4" /> Logistics
          </button>
          <a href="/shipsync/driver" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-primary/50">
            <Smartphone className="h-4 w-4" /> Driver app
          </a>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/60 bg-card/20 px-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="min-w-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">Couldn’t load ShipSync data.<br /><span className="text-xs text-muted-foreground/70">{error}</span></p>
            <button onClick={runReload} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-primary/50">Retry</button>
          </div>
        ) : (
          <>
            {tab === "packages" && <ShipSyncPackages data={data} reload={reload} />}
            {tab === "import" && <ShipSyncShipments kind="Import" />}
            {tab === "export" && <ShipSyncShipments kind="Export" />}
            {tab === "dispatch" && <ShipSyncDispatch data={data} reload={reload} />}
            {tab === "routing" && <ShipSyncRouting data={data} reload={reload} />}
            {tab === "warehouse" && <ShipSyncWarehouse data={data} reload={reload} />}
            {tab === "checker" && <ParcelChecker />}
            {tab === "locations" && <ShipSyncLocations data={data} reload={reload} />}
            {tab === "drivers" && <ShipSyncDrivers data={data} reload={reload} />}
            {tab === "tracking" && <FleetTrackingPage />}
            {tab === "dashboard" && <ShipSyncDashboard data={data} />}
          </>
        )}
      </div>
    </div>
  );
}

export default ShipSyncPage;
