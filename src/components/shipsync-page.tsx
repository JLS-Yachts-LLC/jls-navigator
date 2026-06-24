import { useState, useEffect, useCallback } from "react";
import { Loader2, Package, Truck, Warehouse, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadPackages, loadDrivers, loadNotes, loadDestinations,
} from "@/lib/shipsync/data";
import type {
  ShipSyncPackage, ShipSyncDriver, ShipSyncDeliveryNote, ShipSyncDestination,
} from "@/lib/shipsync/model";
import { ShipSyncPackages } from "@/components/shipsync/ShipSyncPackages";
import { ShipSyncDispatch } from "@/components/shipsync/ShipSyncDispatch";
import { ShipSyncWarehouse } from "@/components/shipsync/ShipSyncWarehouse";
import { ShipSyncDrivers } from "@/components/shipsync/ShipSyncDrivers";
import { ShipSyncDashboard } from "@/components/shipsync/ShipSyncDashboard";

export interface ShipSyncData {
  packages: ShipSyncPackage[];
  drivers: ShipSyncDriver[];
  notes: ShipSyncDeliveryNote[];
  destinations: ShipSyncDestination[];
}

const TABS = [
  { key: "packages", label: "Packages", icon: Package },
  { key: "dispatch", label: "Dispatch", icon: Truck },
  { key: "warehouse", label: "Warehouse", icon: Warehouse },
  { key: "drivers", label: "Drivers", icon: Users },
  { key: "dashboard", label: "Dashboard", icon: BarChart3 },
] as const;

export function ShipSyncPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("packages");
  const [data, setData] = useState<ShipSyncData>({ packages: [], drivers: [], notes: [], destinations: [] });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [packages, drivers, notes, destinations] = await Promise.all([
      loadPackages(), loadDrivers(), loadNotes(), loadDestinations(),
    ]);
    setData({ packages, drivers, notes, destinations });
  }, []);

  useEffect(() => { void reload().finally(() => setLoading(false)); }, [reload]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">JLS Yacht Logistics</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">ShipSync</h1>
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

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {tab === "packages" && <ShipSyncPackages data={data} reload={reload} />}
            {tab === "dispatch" && <ShipSyncDispatch data={data} reload={reload} />}
            {tab === "warehouse" && <ShipSyncWarehouse data={data} reload={reload} />}
            {tab === "drivers" && <ShipSyncDrivers data={data} reload={reload} />}
            {tab === "dashboard" && <ShipSyncDashboard data={data} />}
          </>
        )}
      </div>
    </div>
  );
}

export default ShipSyncPage;
