/**
 * ShipSync — Logistics app (standalone, full-screen).
 *
 * A faithful rebuild of the PowerApps "Logistics" side: a Logistics Menu that
 * leads to each function screen (Check-In, Warehouse View, Package View,
 * Deliveries, Check Out Parcel, Parcel Checker, Delivery Notes). Same backend
 * (shipsync_* Supabase tables) and the same proven screens as the office module,
 * but presented as its own app — the counterpart to the Driver app.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, ChevronLeft, PackagePlus, Warehouse, Boxes, Truck, ScanLine,
  PackageSearch, FileText, Smartphone, LifeBuoy,
} from "lucide-react";
import {
  loadPackages, loadDrivers, loadNotes, loadDestinations, loadDeliverySchedules, loadVehicles, loadYachtNames,
} from "@/lib/shipsync/data";
import type { ShipSyncData } from "@/components/shipsync-page";
import { ShipSyncPackages } from "@/components/shipsync/ShipSyncPackages";
import { ShipSyncWarehouse } from "@/components/shipsync/ShipSyncWarehouse";
import { ShipSyncDispatch } from "@/components/shipsync/ShipSyncDispatch";
import { ShipSyncRouting } from "@/components/shipsync/ShipSyncRouting";
import { ParcelChecker } from "@/components/shipsync/ParcelChecker";

type Screen =
  | "menu" | "checkin" | "warehouse" | "packages"
  | "deliveries" | "checkout" | "checker" | "notes";

const TILES: { key: Screen; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { key: "checkin",    label: "Check-In Package", icon: PackagePlus,   hint: "Register a newly-arrived parcel" },
  { key: "warehouse",  label: "Warehouse View",   icon: Warehouse,     hint: "Rack map of what's in storage" },
  { key: "packages",   label: "Package View",     icon: Boxes,         hint: "Search & edit any package" },
  { key: "deliveries", label: "Deliveries",       icon: Truck,         hint: "Delivery notes in progress" },
  { key: "checkout",   label: "Check Out Parcel", icon: ScanLine,      hint: "Scan parcels onto a run + assign a driver" },
  { key: "checker",    label: "Parcel Checker",   icon: PackageSearch, hint: "Scan to find a parcel & move its rack" },
  { key: "notes",      label: "Delivery Notes",   icon: FileText,      hint: "All delivery notes + PDFs" },
];

const TITLES: Record<Exclude<Screen, "menu">, string> = {
  checkin: "Check-In Package", warehouse: "Warehouse View", packages: "Package View",
  deliveries: "Deliveries", checkout: "Check Out Parcel", checker: "Parcel Checker", notes: "Delivery Notes",
};

export function LogisticsApp() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [data, setData] = useState<ShipSyncData>({ packages: [], drivers: [], notes: [], destinations: [], schedule: [], vehicles: [], yachts: [] });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [packages, drivers, notes, destinations, schedule, vehicles, yachts] = await Promise.all([
      loadPackages().catch(() => [] as ShipSyncData["packages"]),
      loadDrivers().catch(() => [] as ShipSyncData["drivers"]),
      loadNotes().catch(() => [] as ShipSyncData["notes"]),
      loadDestinations().catch(() => [] as ShipSyncData["destinations"]),
      loadDeliverySchedules().catch(() => [] as ShipSyncData["schedule"]),
      loadVehicles().catch(() => [] as ShipSyncData["vehicles"]),
      loadYachtNames().catch(() => [] as string[]),
    ]);
    setData({ packages, drivers, notes, destinations, schedule, vehicles, yachts });
  }, []);

  useEffect(() => { void reload().finally(() => setLoading(false)); }, [reload]);

  // ── Menu ───────────────────────────────────────────────────────────────────
  if (screen === "menu") {
    return (
      <div className="flex h-full min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">JLS Yacht Logistics</div>
            <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">ShipSync — Logistics</h1>
          </div>
          <a href="/shipsync/driver" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-primary/50">
            <Smartphone className="h-4 w-4" /> Driver app
          </a>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          <div className="grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3">
            {TILES.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setScreen(t.key)}
                  className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card/50 p-6 text-center transition hover:border-primary hover:bg-primary/5">
                  <Icon className="h-10 w-10 text-primary" />
                  <span className="text-sm font-semibold">{t.label}</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{t.hint}</span>
                </button>
              );
            })}
          </div>
          <a href="mailto:support@newhorizon-it.co.uk?subject=ShipSync%20Logistics%20problem%20report"
             className="mt-10 inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground">
            <LifeBuoy className="h-4 w-4" /> Report a problem with the app
          </a>
        </div>
      </div>
    );
  }

  // ── A function screen ────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border/70 bg-card/30 px-6 py-3.5">
        <button onClick={() => setScreen("menu")} title="Logistics menu"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Menu
        </button>
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">ShipSync — Logistics</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">{TITLES[screen]}</h1>
        </div>
      </header>

      <div className="min-w-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {(screen === "checkin" || screen === "packages") && <ShipSyncPackages data={data} reload={reload} />}
            {screen === "warehouse" && <ShipSyncWarehouse data={data} reload={reload} />}
            {screen === "checkout" && <ShipSyncRouting data={data} reload={reload} />}
            {(screen === "deliveries" || screen === "notes") && <ShipSyncDispatch data={data} reload={reload} />}
            {screen === "checker" && <ParcelChecker />}
          </>
        )}
      </div>
    </div>
  );
}

export default LogisticsApp;
