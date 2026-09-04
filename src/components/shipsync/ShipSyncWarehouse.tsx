import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Search, LayoutDashboard, ClipboardList, Compass, PackagePlus, Loader2 } from "lucide-react";
import { WarehouseSearch } from "@/components/shipsync/warehouse/WarehouseSearch";
import { ShelfDashboard } from "@/components/shipsync/warehouse/ShelfDashboard";
import { InventoryList } from "@/components/shipsync/warehouse/InventoryList";
import { ZoneStorageStatus } from "@/components/shipsync/warehouse/ZoneStorageStatus";
import { NewStorage } from "@/components/shipsync/warehouse/NewStorage";
import {
  loadShelves, loadClientItems, loadInternalItems, loadPackageContents,
  type WarehouseShelf, type WarehouseClientItem, type WarehouseInternalItem, type WarehousePackageContent,
} from "@/lib/warehouse/data";
import type { ShipSyncData } from "@/components/shipsync-page";

export interface WarehouseData {
  shelves: WarehouseShelf[];
  clientItems: WarehouseClientItem[];
  internalItems: WarehouseInternalItem[];
  packageContents: WarehousePackageContent[];
}

type SubTab = "dashboard" | "search" | "inventory" | "zones" | "new";
const SUB_TABS: { key: SubTab; label: string; icon: typeof Search }[] = [
  { key: "dashboard", label: "Shelf Dashboard", icon: LayoutDashboard },
  { key: "search", label: "Search", icon: Search },
  { key: "inventory", label: "Inventory List", icon: ClipboardList },
  { key: "zones", label: "Zone & Storage Status", icon: Compass },
  { key: "new", label: "New Storage", icon: PackagePlus },
];

/**
 * ShipSync — Warehouse. The 5 functions per "Polaris – Warehouse Board:
 * Functions and Requirements" (Search, Shelf Dashboard, Inventory List,
 * Zone & Storage Status, New Storage), backed by the real warehouse_*
 * Supabase tables. Shelf Dashboard is the default view per spec.
 */
export function ShipSyncWarehouse(_props: { data: ShipSyncData; reload: () => Promise<void> }) {
  const [tab, setTab] = useState<SubTab>("dashboard");
  const [data, setData] = useState<WarehouseData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [shelves, clientItems, internalItems, packageContents] = await Promise.all([
        loadShelves(), loadClientItems(), loadInternalItems(), loadPackageContents(),
      ]);
      setData({ shelves, clientItems, internalItems, packageContents });
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load warehouse data");
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

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
        {!data ? (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            {error ? error : <><Loader2 className="h-4 w-4 animate-spin" /> Loading warehouse data…</>}
          </div>
        ) : (
          <>
            {tab === "dashboard" && <ShelfDashboard data={data} />}
            {tab === "search" && <WarehouseSearch data={data} />}
            {tab === "inventory" && <InventoryList data={data} reload={reload} />}
            {tab === "zones" && <ZoneStorageStatus data={data} reload={reload} />}
            {tab === "new" && <NewStorage onSaved={reload} />}
          </>
        )}
      </div>
    </div>
  );
}
