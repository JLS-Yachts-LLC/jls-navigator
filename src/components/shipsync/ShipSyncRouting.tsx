import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Ship, Truck, MapPin, Route, X, Package as PackageIcon, Anchor, Search } from "lucide-react";
import { StatusBadge } from "@/components/shipsync/shared";
import { createDeliveryNote, assignPackagesToNote, unassignPackage } from "@/lib/shipsync/data";
import { googleMapsDirectionsUrl, type ShipSyncPackage, type ShipSyncDestination } from "@/lib/shipsync/model";
import type { ShipSyncData } from "@/components/shipsync-page";

const UNASSIGNED = "—";

export function ShipSyncRouting({ data, reload }: { data: ShipSyncData; reload: () => Promise<void> }) {
  // Per-boat driver choice + per-boat parcel selection (default: all selected).
  const [driverByBoat, setDriverByBoat] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [boatQuery, setBoatQuery] = useState("");

  const destByBoat = useMemo(() => {
    const m = new Map<string, ShipSyncDestination>();
    for (const d of data.destinations) m.set(d.boat_name.toUpperCase(), d);
    return m;
  }, [data.destinations]);

  // Parcels waiting to be routed: in the office/storage with no delivery note yet.
  const unrouted = useMemo(
    () => data.packages.filter((p) => !p.delivery_note_id && (p.status === "in_office" || p.status === "in_storage")),
    [data.packages],
  );

  // Group unrouted parcels by boat.
  const boatGroups = useMemo(() => {
    const groups = new Map<string, ShipSyncPackage[]>();
    for (const p of unrouted) {
      const key = p.boat_name || UNASSIGNED;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return Array.from(groups.entries()).sort((a, b) => (a[0] === UNASSIGNED ? 1 : b[0] === UNASSIGNED ? -1 : a[0].localeCompare(b[0])));
  }, [unrouted]);

  // Filter boat groups by the search box (matches the boat name).
  const visibleGroups = useMemo(() => {
    const q = boatQuery.trim().toLowerCase();
    if (!q) return boatGroups;
    return boatGroups.filter(([boat]) => boat.toLowerCase().includes(q));
  }, [boatGroups, boatQuery]);

  // Driver runs: parcels already routed and out the door, grouped by driver.
  const driverRuns = useMemo(() => {
    const runs = new Map<string, ShipSyncPackage[]>();
    for (const p of data.packages) {
      if (!p.driver_id || !["assigned", "out_for_delivery"].includes(p.status)) continue;
      if (!runs.has(p.driver_id)) runs.set(p.driver_id, []);
      runs.get(p.driver_id)!.push(p);
    }
    return runs;
  }, [data.packages]);

  const activeDrivers = useMemo(() => data.drivers.filter((d) => d.active), [data.drivers]);

  function isSelected(boat: string, id: string) {
    const set = selected[boat];
    return set ? set.has(id) : true; // default-on
  }
  function toggle(boat: string, id: string, parcelIds: string[]) {
    setSelected((prev) => {
      const cur = prev[boat] ?? new Set(parcelIds);
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...prev, [boat]: next };
    });
  }
  function selectedIds(boat: string, parcelIds: string[]): string[] {
    const set = selected[boat];
    return set ? parcelIds.filter((id) => set.has(id)) : parcelIds;
  }

  async function routeBoat(boat: string, parcels: ShipSyncPackage[]) {
    const ids = selectedIds(boat, parcels.map((p) => p.id));
    if (ids.length === 0) { toast.error("Select at least one parcel to route"); return; }
    const driverId = driverByBoat[boat];
    if (!driverId) { toast.error("Choose a driver for this boat first"); return; }
    setBusy(boat);
    try {
      const note = await createDeliveryNote(boat === UNASSIGNED ? "" : boat, driverId);
      await assignPackagesToNote(ids, note, driverId);
      const driver = data.drivers.find((d) => d.id === driverId);
      await reload();
      setSelected((prev) => { const n = { ...prev }; delete n[boat]; return n; });
      setDriverByBoat((prev) => { const n = { ...prev }; delete n[boat]; return n; });
      toast.success(`Routed ${ids.length} parcel${ids.length > 1 ? "s" : ""} for ${boat} to ${driver?.name ?? "driver"} (DN-${note.number})`);
    } catch (e: any) {
      toast.error(e?.message ?? "Routing failed");
    } finally {
      setBusy(null);
    }
  }

  async function sendBack(id: string) {
    setBusy(`back-${id}`);
    try { await unassignPackage(id); await reload(); toast.success("Parcel sent back to routing"); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  function runMapUrl(parcels: ShipSyncPackage[]): string | null {
    // One stop per distinct boat, in alphabetical order, using saved berths.
    const boats = Array.from(new Set(parcels.map((p) => p.boat_name).filter(Boolean) as string[])).sort();
    const stops = boats
      .map((b) => destByBoat.get(b.toUpperCase()))
      .filter(Boolean)
      .map((d) => ({ address: d!.address, lat: d!.lat, lng: d!.lng }));
    return stops.length ? googleMapsDirectionsUrl(stops) : null;
  }

  return (
    <div className="grid gap-5 px-6 py-5 lg:grid-cols-[1fr_minmax(340px,420px)]">
      {/* ── Left: parcels waiting to be routed, grouped by boat ── */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Route className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">To route</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{unrouted.length} parcel{unrouted.length === 1 ? "" : "s"}</span>
          <div className="relative ml-auto w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={boatQuery} onChange={(e) => setBoatQuery(e.target.value)} placeholder="Search by boat…" className="h-8 pl-8 text-sm" />
          </div>
        </div>

        {boatGroups.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            <PackageIcon className="h-6 w-6 opacity-40" />
            Nothing waiting — every parcel in the office is routed.
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            No boats match “{boatQuery}”.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleGroups.map(([boat, parcels]) => {
              const ids = parcels.map((p) => p.id);
              const selCount = selectedIds(boat, ids).length;
              const dest = boat !== UNASSIGNED ? destByBoat.get(boat.toUpperCase()) : undefined;
              return (
                <div key={boat} className="rounded-xl border border-border bg-card">
                  <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Ship className="h-4 w-4 text-muted-foreground" />
                      <span className="font-display text-sm font-bold">{boat === UNASSIGNED ? "No boat set" : boat}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{parcels.length} pkg</span>
                    </div>
                    {dest?.address && (
                      <span className="flex items-center gap-1 text-[12px] text-muted-foreground"><Anchor className="h-3 w-3" /> {dest.address}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <Select value={driverByBoat[boat] ?? ""} onValueChange={(v) => setDriverByBoat((prev) => ({ ...prev, [boat]: v }))}>
                        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Choose driver…" /></SelectTrigger>
                        <SelectContent>
                          {activeDrivers.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No active drivers</div>}
                          {activeDrivers.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}{d.vehicle ? ` · ${d.vehicle}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 gap-1.5" disabled={busy === boat || selCount === 0} onClick={() => routeBoat(boat, parcels)}>
                        {busy === boat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                        Route {selCount}
                      </Button>
                    </div>
                  </div>
                  <div className="divide-y divide-border/40">
                    {parcels.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/30">
                        <input type="checkbox" checked={isSelected(boat, p.id)} onChange={() => toggle(boat, p.id, ids)}
                          className="h-4 w-4 accent-primary" />
                        <span className="font-mono text-[12px]">{p.barcode ?? "—"}</span>
                        <span className="text-muted-foreground">{p.package_owner ?? p.description ?? ""}</span>
                        {p.courier && <span className="text-[11px] text-muted-foreground/70">{p.courier}</span>}
                        <span className="ml-auto flex items-center gap-2">
                          {(p.num_packages ?? 1) > 1 && <span className="text-[11px] text-muted-foreground">×{p.num_packages}</span>}
                          <StatusBadge status={p.status} />
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right: live driver runs ── */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Driver runs</h2>
        </div>

        {driverRuns.size === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            <Truck className="h-6 w-6 opacity-40" />
            No active runs yet — route some parcels to a driver.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activeDrivers.concat(data.drivers.filter((d) => !d.active && driverRuns.has(d.id))).map((driver) => {
              const parcels = driverRuns.get(driver.id);
              if (!parcels || parcels.length === 0) return null;
              const boats = Array.from(new Set(parcels.map((p) => p.boat_name || UNASSIGNED))).sort();
              const mapUrl = runMapUrl(parcels);
              return (
                <div key={driver.id} className="rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                      {driver.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                    </span>
                    <div>
                      <div className="font-display text-sm font-bold">{driver.name}</div>
                      <div className="text-[11px] text-muted-foreground">{driver.vehicle ?? "—"} · {parcels.length} pkg · {boats.length} stop{boats.length === 1 ? "" : "s"}</div>
                    </div>
                    {mapUrl && (
                      <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-primary hover:bg-primary/5">
                        <MapPin className="h-3.5 w-3.5" /> Route
                      </a>
                    )}
                  </div>
                  <div className="divide-y divide-border/40">
                    {parcels.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <Ship className="h-3.5 w-3.5 text-muted-foreground/60" />
                        <span className="font-medium">{p.boat_name ?? "No boat"}</span>
                        <span className="font-mono text-[12px] text-muted-foreground">{p.barcode ?? "—"}</span>
                        <span className="ml-auto flex items-center gap-2">
                          <StatusBadge status={p.status} />
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive"
                            disabled={busy === `back-${p.id}`} onClick={() => sendBack(p.id)} title="Send back to routing">
                            {busy === `back-${p.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                          </Button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
