import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Ship, Truck, Route, X, Plus, ChevronRight, ChevronDown, Anchor, Calendar, Map as MapIcon } from "lucide-react";
import { StatusBadge } from "@/components/shipsync/shared";
import { ShipSyncDeliveryCalendar } from "@/components/shipsync/ShipSyncDeliveryCalendar";
import { RouteMapDialog, type RouteStop } from "@/components/shipsync/RouteMapDialog";
import { dispatchRoute } from "@/lib/shipsync/data";
import { vanLabel, driverWorks, weekdayOf, WEEKDAYS, type ShipSyncPackage, type ShipSyncDestination } from "@/lib/shipsync/model";
import type { ShipSyncData } from "@/components/shipsync-page";

const UNASSIGNED = "—";

interface RouteDraft {
  id: string;
  name: string;
  driverId: string;
  vehicleId: string;         // van assigned to the route
  boats: string[];           // boat names added to this route
  excluded: Set<string>;     // parcel ids unticked
  expanded: Set<string>;     // boat names currently expanded
}

const today = () => new Date().toISOString().slice(0, 10);
const newRoute = (id: string, name: string): RouteDraft =>
  ({ id, name, driverId: "", vehicleId: "", boats: [], excluded: new Set(), expanded: new Set() });

// Persist the in-progress plan PER delivery date, so each day has its own routes
// and the plan survives tab switches / navigation / reload.
const DRAFTS_KEY = "shipsync.routing.drafts.v2";
type StoredRoute = { id: string; name: string; driverId: string; vehicleId: string; boats: string[]; excluded: string[]; expanded: string[] };
function loadAll(): Record<string, StoredRoute[]> {
  try { const raw = typeof window !== "undefined" ? localStorage.getItem(DRAFTS_KEY) : null; return raw ? (JSON.parse(raw) ?? {}) : {}; }
  catch { return {}; }
}
function saveAll(map: Record<string, StoredRoute[]>) {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(map)); } catch { /* storage full/unavailable — non-fatal */ }
}
function serializeRoutes(routes: RouteDraft[]): StoredRoute[] {
  return routes.map((r) => ({ id: r.id, name: r.name, driverId: r.driverId, vehicleId: r.vehicleId, boats: r.boats, excluded: [...r.excluded], expanded: [...r.expanded] }));
}
/** Rehydrate a day's stored routes, or start a fresh Route 1 when the day has none. */
function hydrateRoutes(stored: StoredRoute[] | undefined): RouteDraft[] {
  const rs: RouteDraft[] = (stored ?? []).map((r) => ({
    id: String(r.id), name: String(r.name), driverId: r.driverId ?? "", vehicleId: r.vehicleId ?? "",
    boats: Array.isArray(r.boats) ? r.boats : [],
    excluded: new Set<string>(r.excluded ?? []), expanded: new Set<string>(r.expanded ?? []),
  }));
  return rs.length ? rs : [newRoute("r1", "Route 1")];
}
const maxRouteNum = (routes: RouteDraft[]) =>
  routes.reduce((m, r) => { const n = parseInt(r.name.replace(/\D/g, ""), 10); return isNaN(n) ? m : Math.max(m, n); }, 1);

export function ShipSyncRouting({ data, reload }: { data: ShipSyncData; reload: () => Promise<void> }) {
  const seq = useRef(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [mapRoute, setMapRoute] = useState<{ name: string; stops: RouteStop[] } | null>(null);
  // The day being planned; each date keeps its own set of routes.
  const [deliveryDate, setDeliveryDate] = useState<string>(today());
  const [routes, setRoutes] = useState<RouteDraft[]>(() => hydrateRoutes(loadAll()[today()]));

  // Keep the route-number counter ahead of the current day's routes (on mount).
  useEffect(() => { seq.current = maxRouteNum(routes); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Persist the current day's routes on every change.
  useEffect(() => {
    const all = loadAll();
    all[deliveryDate] = serializeRoutes(routes);
    saveAll(all);
  }, [routes, deliveryDate]);

  // Switch the planned day: save the day we're leaving, load the new day's routes.
  function changeDate(newDate: string) {
    if (!newDate || newDate === deliveryDate) { if (newDate) setDeliveryDate(newDate); return; }
    const all = loadAll();
    all[deliveryDate] = serializeRoutes(routes);
    saveAll(all);
    const next = hydrateRoutes(all[newDate]);
    seq.current = maxRouteNum(next);
    setRoutes(next);
    setDeliveryDate(newDate);
  }
  const deliveryWeekday = weekdayOf(deliveryDate);
  const deliveryDayName = deliveryDate ? new Date(`${deliveryDate}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" }) : "";

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

  // Map of boat name -> its waiting parcels.
  const parcelsByBoat = useMemo(() => {
    const groups = new Map<string, ShipSyncPackage[]>();
    for (const p of unrouted) {
      const key = p.boat_name || UNASSIGNED;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return groups;
  }, [unrouted]);

  // Boats already placed on any route (a boat's parcels can only be on one route).
  const assignedBoats = useMemo(() => {
    const s = new Set<string>();
    for (const r of routes) for (const b of r.boats) s.add(b);
    return s;
  }, [routes]);

  // Boats still available to add, sorted (unassigned-name group last).
  const availableBoats = useMemo(() => {
    return Array.from(parcelsByBoat.keys())
      .filter((b) => !assignedBoats.has(b))
      .sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)));
  }, [parcelsByBoat, assignedBoats]);

  const activeDrivers = useMemo(() => data.drivers.filter((d) => d.active), [data.drivers]);

  // Parcels included on a route: all its boats' waiting parcels minus the unticked.
  function routeParcels(r: RouteDraft): ShipSyncPackage[] {
    const out: ShipSyncPackage[] = [];
    for (const boat of r.boats) {
      for (const p of parcelsByBoat.get(boat) ?? []) if (!r.excluded.has(p.id)) out.push(p);
    }
    return out;
  }

  // ── Route card mutations ───────────────────────────────────────────────────
  function patchRoute(id: string, fn: (r: RouteDraft) => RouteDraft) {
    setRoutes((prev) => prev.map((r) => (r.id === id ? fn(r) : r)));
  }
  function addRoute() {
    seq.current += 1;
    setRoutes((prev) => [...prev, newRoute(`r${seq.current}-${prev.length}`, `Route ${seq.current}`)]);
  }
  function removeRoute(id: string) {
    setRoutes((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
  }
  function addBoat(id: string, boat: string) {
    patchRoute(id, (r) => (r.boats.includes(boat) ? r : { ...r, boats: [...r.boats, boat] }));
  }
  function removeBoat(id: string, boat: string) {
    patchRoute(id, (r) => {
      const ids = (parcelsByBoat.get(boat) ?? []).map((p) => p.id);
      const excluded = new Set(r.excluded); ids.forEach((x) => excluded.delete(x));
      const expanded = new Set(r.expanded); expanded.delete(boat);
      return { ...r, boats: r.boats.filter((b) => b !== boat), excluded, expanded };
    });
  }
  // Move a boat to a new stop position (0-based) — sets the route's delivery order.
  function reorderBoat(id: string, boat: string, toIndex: number) {
    patchRoute(id, (r) => {
      const from = r.boats.indexOf(boat);
      if (from < 0 || toIndex === from) return r;
      const boats = [...r.boats];
      boats.splice(from, 1);
      boats.splice(toIndex, 0, boat);
      return { ...r, boats };
    });
  }
  function toggleExpand(id: string, boat: string) {
    patchRoute(id, (r) => {
      const expanded = new Set(r.expanded); expanded.has(boat) ? expanded.delete(boat) : expanded.add(boat);
      return { ...r, expanded };
    });
  }
  function toggleParcel(id: string, parcelId: string) {
    patchRoute(id, (r) => {
      const excluded = new Set(r.excluded); excluded.has(parcelId) ? excluded.delete(parcelId) : excluded.add(parcelId);
      return { ...r, excluded };
    });
  }

  async function dispatch(r: RouteDraft) {
    const parcels = routeParcels(r);
    if (parcels.length === 0) { toast.error("Add boats/parcels to this route first"); return; }
    if (!r.driverId) { toast.error("Choose a driver for this route"); return; }
    if (!r.vehicleId) { toast.error("Choose a van for this route"); return; }
    if (!deliveryDate) { toast.error("Set the delivery date at the top first"); return; }
    const drv = data.drivers.find((d) => d.id === r.driverId);
    if (drv && !driverWorks(drv, deliveryWeekday)) {
      toast.error(`${drv.name} doesn't work ${WEEKDAYS[deliveryWeekday]} — pick another day or driver`); return;
    }
    setBusy(r.id);
    try {
      const distinctBoats = Array.from(new Set(parcels.map((p) => p.boat_name || UNASSIGNED)));
      const boatLabel = distinctBoats.length === 1 && distinctBoats[0] !== UNASSIGNED ? distinctBoats[0] : null;
      const note = await dispatchRoute(parcels.map((p) => p.id), r.driverId, boatLabel, deliveryDate, r.vehicleId);
      const driver = data.drivers.find((d) => d.id === r.driverId);
      await reload();
      // Drop this card; keep the rest (renumbering is cosmetic — leave names as-is).
      setRoutes((prev) => (prev.length === 1 ? [newRoute("r1", "Route 1")] : prev.filter((x) => x.id !== r.id)));
      toast.success(`Dispatched ${parcels.length} parcel${parcels.length > 1 ? "s" : ""} across ${distinctBoats.length} boat${distinctBoats.length > 1 ? "s" : ""} to ${driver?.name ?? "driver"} for ${deliveryDate} (DN-${note.number})`);
    } catch (e: any) {
      toast.error(e?.message ?? "Dispatch failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5 px-6 py-5 lg:grid-cols-[1fr_minmax(340px,420px)]">
      {/* ── Left: route builders ── */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Route className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">To route</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{unrouted.length} parcel{unrouted.length === 1 ? "" : "s"} waiting</span>
          <label className="ml-3 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground" title="Delivery date for all routes below">
            <Calendar className="h-3.5 w-3.5" />
            <input type="date" value={deliveryDate} onChange={(e) => changeDate(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground" />
            {deliveryDayName && <span className="font-semibold text-foreground">{deliveryDayName}</span>}
          </label>
          <Button size="sm" variant="outline" className="ml-auto h-8 gap-1.5" onClick={addRoute}>
            <Plus className="h-3.5 w-3.5" /> Add route
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {routes.map((r) => {
            const parcels = routeParcels(r);
            const routeWeekday = deliveryWeekday;
            const selDriver = data.drivers.find((d) => d.id === r.driverId);
            const driverOff = !!selDriver && !driverWorks(selDriver, routeWeekday);
            return (
              <div key={r.id} className={`rounded-xl border bg-card transition ${parcels.length > 0 ? "border-primary/40" : "border-border"}`}>
                {/* Route header */}
                <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <span className="font-display text-sm font-bold">{r.name}</span>
                  </div>
                  <span className="text-[12px] text-muted-foreground">{r.boats.length} boat{r.boats.length === 1 ? "" : "s"} · {parcels.length} parcel{parcels.length === 1 ? "" : "s"}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm" variant="outline" className="h-8 gap-1.5"
                      disabled={r.boats.filter((b) => b !== UNASSIGNED).length === 0}
                      title="Route map — optimized stop order, distances & ETA"
                      onClick={() => setMapRoute({
                        name: r.name,
                        stops: r.boats
                          .filter((b) => b !== UNASSIGNED)
                          .map((b) => {
                            const d = destByBoat.get(b.toUpperCase());
                            return { boat: b, address: d?.address, lat: d?.lat, lng: d?.lng };
                          }),
                      })}
                    >
                      <MapIcon className="h-3.5 w-3.5" /> Map
                    </Button>
                    <Select value={r.driverId} onValueChange={(v) => patchRoute(r.id, (x) => ({ ...x, driverId: v }))}>
                      <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Choose driver…" /></SelectTrigger>
                      <SelectContent>
                        {activeDrivers.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No active drivers</div>}
                        {activeDrivers.map((d) => {
                          const off = !driverWorks(d, routeWeekday);
                          return (
                            <SelectItem key={d.id} value={d.id} disabled={off}>
                              {d.name}{d.vehicle ? ` · ${d.vehicle}` : ""}{off ? ` · off ${WEEKDAYS[routeWeekday]}` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <Select value={r.vehicleId} onValueChange={(v) => patchRoute(r.id, (x) => ({ ...x, vehicleId: v }))}>
                      <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Choose van…" /></SelectTrigger>
                      <SelectContent>
                        {data.vehicles.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No vans</div>}
                        {data.vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{vanLabel(v)}{v.status && v.status !== "available" ? ` · ${v.status}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8 gap-1.5" disabled={busy === r.id || parcels.length === 0 || !r.driverId || !r.vehicleId || driverOff} onClick={() => dispatch(r)}>
                      {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                      Dispatch {parcels.length || ""}
                    </Button>
                    {routes.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => removeRoute(r.id)} title="Remove route">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Add-boat picker */}
                <div className="border-b border-border/60 px-4 py-2.5">
                  <Select value="" onValueChange={(v) => addBoat(r.id, v)}>
                    <SelectTrigger className="h-8 w-64 text-xs"><span className="flex items-center gap-2"><Plus className="h-3.5 w-3.5 text-muted-foreground" /><SelectValue placeholder="Add boat to this route…" /></span></SelectTrigger>
                    <SelectContent>
                      {availableBoats.length === 0
                        ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No boats left to add</div>
                        : availableBoats.map((b) => (
                          <SelectItem key={b} value={b}>{b === UNASSIGNED ? "No boat set" : b} ({(parcelsByBoat.get(b) ?? []).length})</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Boats on this route */}
                {r.boats.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">No boats yet — add one above.</div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {r.boats.map((boat, boatIndex) => {
                      const all = parcelsByBoat.get(boat) ?? [];
                      const included = all.filter((p) => !r.excluded.has(p.id)).length;
                      const dest = boat !== UNASSIGNED ? destByBoat.get(boat.toUpperCase()) : undefined;
                      const open = r.expanded.has(boat);
                      return (
                        <div key={boat}>
                          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                            <button onClick={() => toggleExpand(r.id, boat)} className="text-muted-foreground/70 hover:text-foreground" title={open ? "Collapse" : "Untick parcels"}>
                              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                            <Select value={String(boatIndex + 1)} onValueChange={(v) => reorderBoat(r.id, boat, Number(v) - 1)}>
                              <SelectTrigger className="h-7 w-14 text-xs" title="Stop order"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {r.boats.map((_, i) => <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Ship className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{boat === UNASSIGNED ? "No boat set" : boat}</span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{included}/{all.length} pkg</span>
                            {dest?.address && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Anchor className="h-3 w-3" /> {dest.address}</span>}
                            <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => removeBoat(r.id, boat)} title="Remove boat from route">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {open && (
                            <div className="divide-y divide-border/30 bg-background/40 pl-9">
                              {all.map((p) => (
                                <label key={p.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-accent/30">
                                  <input type="checkbox" checked={!r.excluded.has(p.id)} onChange={() => toggleParcel(r.id, p.id)} className="h-4 w-4 accent-primary" />
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: weekly delivery calendar ── */}
      <ShipSyncDeliveryCalendar data={data} reload={reload} />

      {mapRoute && (
        <RouteMapDialog
          open
          onOpenChange={(o) => !o && setMapRoute(null)}
          title={`${mapRoute.name} — route plan`}
          stops={mapRoute.stops}
          optimize={false}
        />
      )}
    </div>
  );
}
