/**
 * Polaris Logistics — the phone app for parcels, shipments and the warehouse.
 *
 * The home screen is the spec's role-based dashboard: seven modules in three
 * groups. A driver sees only Deliveries; everyone else sees everything. Modules
 * not yet built show a "Soon" badge rather than a dead button.
 *
 * It reads and writes the same shipsync_* tables the office ShipSync boards use,
 * so nothing here is a second copy of the data.
 */
import { useState } from "react";
import {
  PackagePlus, PackageMinus, Warehouse, PackageOpen, LayoutGrid, Truck, ClipboardList, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogisticsIdentity } from "./logistics-identity";
import { Screen } from "./logistics-ui";
import { CheckinParcel } from "./checkin-parcel";
import { CheckoutParcels } from "./checkout-parcels";
import { Deliveries } from "./deliveries";
import { ManageDeliveries } from "./manage-deliveries";
import { StoreIn } from "./store-in";
import { WarehouseOut } from "./warehouse-out";
import { PendingBanner, useCheckinQueue } from "./checkin-pending";
import { ManageWarehouse } from "./manage-warehouse";

type Module =
  | "checkin" | "checkout" | "store-in" | "warehouse-out" | "manage-warehouse" | "deliveries" | "manage-deliveries";

type Tile = {
  key: Module; label: string; icon: React.ComponentType<{ className?: string }>;
  /** Built in this app yet? */
  ready: boolean;
};

const GROUPS: { title: string; tiles: Tile[] }[] = [
  { title: "Received Packages/Parcels", tiles: [
    { key: "checkin", label: "Check-in - Parcels", icon: PackagePlus, ready: true },
    { key: "checkout", label: "Check-Out - Parcels", icon: PackageMinus, ready: true },
  ] },
  { title: "Warehouse Management", tiles: [
    { key: "store-in", label: "Warehouse - Store In", icon: Warehouse, ready: true },
    { key: "warehouse-out", label: "Warehouse - Out", icon: PackageOpen, ready: true },
    { key: "manage-warehouse", label: "Manage Warehouse", icon: LayoutGrid, ready: true },
  ] },
  { title: "Delivery Management", tiles: [
    { key: "deliveries", label: "Deliveries", icon: Truck, ready: true },
    { key: "manage-deliveries", label: "Manage Deliveries", icon: ClipboardList, ready: true },
  ] },
];

export function LogisticsApp() {
  const id = useLogisticsIdentity();
  const [open, setOpen] = useState<Module | null>(null);
  // Check-ins saved without signal upload from here, whichever screen is open.
  const queue = useCheckinQueue(true);

  if (id.loading) {
    return <div className="flex h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (open === "checkin") return <CheckinParcel onBack={() => setOpen(null)} />;
  if (open === "checkout") return <CheckoutParcels onBack={() => setOpen(null)} />;
  if (open === "store-in") return <StoreIn onBack={() => setOpen(null)} />;
  if (open === "warehouse-out") return <WarehouseOut onBack={() => setOpen(null)} />;
  if (open === "manage-warehouse") return <ManageWarehouse onBack={() => setOpen(null)} />;
  if (open === "deliveries") return <Deliveries identity={id} onBack={() => setOpen(null)} />;
  if (open === "manage-deliveries") return <ManageDeliveries onBack={() => setOpen(null)} />;

  // A driver's phone shows Deliveries and nothing else.
  const groups = id.driverOnly
    ? GROUPS.map((g) => ({ ...g, tiles: g.tiles.filter((t) => t.key === "deliveries") })).filter((g) => g.tiles.length)
    : GROUPS;

  return (
    <Screen title="JLS YACHTS - LOGISTICS" subtitle={`HI ${id.greeting}`}>
      <PendingBanner queue={queue} />
      {groups.map((g) => (
        <section key={g.title} className="space-y-2">
          <h2 className="text-center text-[14px] font-medium uppercase tracking-wide text-muted-foreground">{g.title}</h2>
          {g.tiles.map((t) => <TileButton key={t.key} tile={t} onOpen={() => setOpen(t.key)} />)}
        </section>
      ))}
    </Screen>
  );
}

function TileButton({ tile, onOpen }: { tile: Tile; onOpen: () => void }) {
  const Icon = tile.icon;
  const body = (
    <>
      <span className="flex-1 text-left text-[17px] font-semibold">{tile.label}</span>
      {!tile.ready && <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-foreground">Soon</span>}
      <Icon className="h-6 w-6 shrink-0 text-primary" />
    </>
  );
  const cls = cn("flex h-16 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 transition",
    tile.ready ? "hover:border-primary hover:bg-primary/5 active:bg-primary/10" : "opacity-60");

  if (!tile.ready) return <div className={cls} aria-disabled="true">{body}</div>;
  return <button type="button" onClick={onOpen} className={cls}>{body}</button>;
}

export default LogisticsApp;
