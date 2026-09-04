import { useState } from "react";
import { cn } from "@/lib/utils";
import { Search, LayoutDashboard, ClipboardList, Compass, PackagePlus } from "lucide-react";
import { WarehouseSearch } from "@/components/shipsync/warehouse/WarehouseSearch";
import { ShelfDashboard } from "@/components/shipsync/warehouse/ShelfDashboard";
import { InventoryList } from "@/components/shipsync/warehouse/InventoryList";
import { ZoneStorageStatus } from "@/components/shipsync/warehouse/ZoneStorageStatus";
import { NewStorage } from "@/components/shipsync/warehouse/NewStorage";
import type { ShipSyncData } from "@/components/shipsync-page";

/**
 * ShipSync — Warehouse.
 *
 * UI-first pass per "Polaris – Warehouse Board: Functions and Requirements"
 * (the 5 functions: Search, Shelf Dashboard, Inventory List, Zone & Storage
 * Status, New Storage). Nothing here is wired to shipsync_packages or any
 * other real table yet — every screen runs on its own local state and the
 * illustrative SAMPLE_* data in warehouse/warehouse-constants.ts. `data`/
 * `reload` are accepted (same props every other ShipSync tab gets from
 * shipsync-page.tsx) but unused for now — swap the sample data for real
 * loaders when this module is ready to go live.
 *
 * Shelf Dashboard is the default view, per spec ("should be the main/
 * default view when the Warehouse section is opened").
 */
type SubTab = "dashboard" | "search" | "inventory" | "zones" | "new";
const SUB_TABS: { key: SubTab; label: string; icon: typeof Search }[] = [
  { key: "dashboard", label: "Shelf Dashboard", icon: LayoutDashboard },
  { key: "search", label: "Search", icon: Search },
  { key: "inventory", label: "Inventory List", icon: ClipboardList },
  { key: "zones", label: "Zone & Storage Status", icon: Compass },
  { key: "new", label: "New Storage", icon: PackagePlus },
];

export function ShipSyncWarehouse(_props: { data: ShipSyncData; reload: () => Promise<void> }) {
  const [tab, setTab] = useState<SubTab>("dashboard");

  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-5">
      <div className="mb-4 flex shrink-0 flex-wrap gap-1 rounded-lg border border-border bg-card/50 p-1 w-fit">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
              tab === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "dashboard" && <ShelfDashboard />}
        {tab === "search" && <WarehouseSearch />}
        {tab === "inventory" && <InventoryList />}
        {tab === "zones" && <ZoneStorageStatus />}
        {tab === "new" && <NewStorage />}
      </div>
    </div>
  );
}
