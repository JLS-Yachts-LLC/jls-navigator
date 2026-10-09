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
import { useEffect, useState } from "react";
import {
  PackagePlus, PackageMinus, Warehouse, PackageOpen, LayoutGrid, Truck, ClipboardList, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { hasStoredSession } from "@/lib/stored-session";
import { useLogisticsIdentity } from "./logistics-identity";
import { Screen } from "./logistics-ui";
import { CheckinParcel } from "./checkin-parcel";
import { CheckoutParcels } from "./checkout-parcels";
import { Deliveries } from "./deliveries";
import { ManageDeliveries } from "./manage-deliveries";
import { StoreIn } from "./store-in";
import { WarehouseOut } from "./warehouse-out";
import { PendingBanner, useCheckinQueue } from "./checkin-pending";
import { flushQueue } from "@/lib/shipsync/offline";
import { closeFinishedNotes } from "./logistics-delivery-data";
import { purgeDrafts } from "./logistics-offline";
import { ManageWarehouse } from "./manage-warehouse";
import { useOrbitFieldOnlyRedirect } from "@/lib/orbit-field-only";

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
  const { user, loading: authLoading } = useAuth();
  const [stalled, setStalled] = useState(false);

  // The route's own sign-in check only runs for in-app navigation. Opening this page directly — from the QR code, a
  // bookmark or the home-screen icon on a phone that isn't signed in — skipped it, and the page sat on its loading
  // spinner forever. So the page checks for itself, and sends a signed-out phone to sign in (and back here afterwards).
  useEffect(() => {
    if (authLoading || user) return;
    if (!navigator.onLine && hasStoredSession()) return;   // no signal, but still signed in on this phone: carry on
    window.location.replace(`/auth?next=${encodeURIComponent("/logistics-app")}`);
  }, [authLoading, user]);

  // A loading screen is never allowed to be the end of the road.
  useEffect(() => {
    if (!id.loading) { setStalled(false); return; }
    const t = window.setTimeout(() => setStalled(true), 15_000);
    return () => window.clearTimeout(t);
  }, [id.loading]);
  // Orbit field crew use the Orbit 2 mobile app only — send them there.
  const fieldOnly = useOrbitFieldOnlyRedirect();
  const [open, setOpen] = useState<Module | null>(null);
  // Check-ins saved without signal upload from here, whichever screen is open.
  const queue = useCheckinQueue(true);

  // Drafts (photos kept while a form is open) nobody came back for are dropped.
  useEffect(() => { void purgeDrafts().catch(() => {}); }, []);

  // Keep a copy of the app on the phone so it opens with no signal (see src/lib/logistics-pwa.ts).
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/logistics-sw.js", { scope: "/logistics-app" }).catch(() => { /* not available here — the app just needs a connection to open */ });
  }, []);

  // Scans and handovers (photos and signatures included) made with no signal wait in the
  // driver queue on this phone. They used to be sent only if the OLD driver app was opened,
  // so a handover made offline here could sit there for good. Send them whenever there is signal,
  // then close any run that has nothing left on it.
  const driverId = id.driver?.id ?? null;
  useEffect(() => {
    const go = () => {
      if (!navigator.onLine) return;
      void flushQueue().then((n) => (n > 0 && driverId ? closeFinishedNotes(driverId) : 0)).catch(() => { /* retried on the next tick */ });
    };
    go();
    window.addEventListener("online", go);
    const t = window.setInterval(go, 60_000);
    return () => { window.removeEventListener("online", go); window.clearInterval(t); };
  }, [driverId]);

  if (id.loading || fieldOnly) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        {stalled && !fieldOnly && (
          <>
            <p className="text-[15px] text-muted-foreground">This is taking longer than it should. Check your connection, then try again.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => window.location.reload()} className="h-11 rounded-lg bg-primary px-5 text-[15px] font-semibold text-primary-foreground">Try again</button>
              <button type="button" onClick={() => window.location.replace(`/auth?next=${encodeURIComponent("/logistics-app")}`)} className="h-11 rounded-lg border border-border px-5 text-[15px] font-semibold">Sign in again</button>
            </div>
          </>
        )}
      </div>
    );
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
      {id.lookupFailed && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-[14px]">
          <span className="flex-1">Couldn't confirm your access — showing Deliveries only.</span>
          <button type="button" onClick={() => window.location.reload()} className="shrink-0 rounded-lg border border-border px-3 py-2 font-semibold">Try again</button>
        </div>
      )}
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
      {!tile.ready && <span className="rounded-full bg-muted px-2 py-0.5 text-[14px] font-medium text-muted-foreground">Soon</span>}
      <Icon className="h-6 w-6 shrink-0 text-primary" />
    </>
  );
  const cls = cn("flex h-16 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 transition",
    tile.ready ? "hover:border-primary hover:bg-primary/5 active:bg-primary/10" : "opacity-60");

  if (!tile.ready) return <div className={cls} aria-disabled="true">{body}</div>;
  return <button type="button" onClick={onOpen} className={cls}>{body}</button>;
}

export default LogisticsApp;
