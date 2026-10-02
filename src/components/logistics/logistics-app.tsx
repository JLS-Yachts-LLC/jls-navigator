/**
 * Polaris Logistics — the phone app for parcels, shipments and the warehouse.
 *
 * The home screen is the spec's role-based dashboard: seven modules in three
 * groups. A driver sees only Deliveries; everyone else sees everything. Modules
 * not yet built show a "Soon" badge rather than a dead button, and Deliveries
 * opens the existing, proven driver app until the new one replaces it.
 *
 * It reads and writes the same shipsync_* tables the office ShipSync boards use,
 * so nothing here is a second copy of the data.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  PackagePlus, PackageMinus, Warehouse, PackageOpen, LayoutGrid, Truck, ClipboardList, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogisticsIdentity } from "./logistics-identity";
import { Screen } from "./logistics-ui";
import { CheckinParcel } from "./checkin-parcel";

type Module =
  | "checkin" | "checkout" | "store-in" | "warehouse-out" | "manage-warehouse" | "deliveries" | "manage-deliveries";

type Tile = {
  key: Module; label: string; icon: React.ComponentType<{ className?: string }>;
  /** Built in this app yet? */
  ready: boolean;
  /** Where a tile that isn't built here yet can still send people. */
  href?: string;
};

const GROUPS: { title: string; tiles: Tile[] }[] = [
  { title: "Received Packages/Parcels", tiles: [
    { key: "checkin", label: "Check-in - Parcels", icon: PackagePlus, ready: true },
    { key: "checkout", label: "Check-Out - Parcels", icon: PackageMinus, ready: false },
  ] },
  { title: "Warehouse Management", tiles: [
    { key: "store-in", label: "Warehouse - Store In", icon: Warehouse, ready: false },
    { key: "warehouse-out", label: "Warehouse - Out", icon: PackageOpen, ready: false },
    { key: "manage-warehouse", label: "Manage Warehouse", icon: LayoutGrid, ready: false },
  ] },
  { title: "Delivery Management", tiles: [
    { key: "deliveries", label: "Deliveries", icon: Truck, ready: true, href: "/shipsync/driver" },
    { key: "manage-deliveries", label: "Manage Deliveries", icon: ClipboardList, ready: false },
  ] },
];

export function LogisticsApp() {
  const id = useLogisticsIdentity();
  const [open, setOpen] = useState<Module | null>(null);

  if (id.loading) {
    return <div className="flex h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (open === "checkin") return <CheckinParcel onBack={() => setOpen(null)} />;

  // A driver's phone shows Deliveries and nothing else.
  const groups = id.driverOnly
    ? GROUPS.map((g) => ({ ...g, tiles: g.tiles.filter((t) => t.key === "deliveries") })).filter((g) => g.tiles.length)
    : GROUPS;

  return (
    <Screen title="JLS YACHTS - LOGISTICS" subtitle={`HI ${id.greeting}`}>
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
  if (tile.href) return <Link to={tile.href as any} className={cls}>{body}</Link>;
  return <button type="button" onClick={onOpen} className={cls}>{body}</button>;
}

export default LogisticsApp;
