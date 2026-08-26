import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Loader2, Ship, Truck, Route, X, Plus, ChevronRight, ChevronDown, Anchor, Calendar, Map as MapIcon, ScanLine } from "lucide-react";
import { StatusBadge, fmtDate } from "@/components/shipsync/shared";
import { ShipSyncDeliveryCalendar } from "@/components/shipsync/ShipSyncDeliveryCalendar";
import { BarcodeScannerDialog } from "@/components/shipsync/BarcodeScanner";
import { RouteMapDialog, type RouteStop } from "@/components/shipsync/RouteMapDialog";
import { dispatchRoute, saveDestination } from "@/lib/shipsync/data";
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
  manualAssign: Record<string, string>; // parcel id -> stop (boat/location) it's been pulled into
}

const today = () => new Date().toISOString().slice(0, 10);
const newRoute = (id: string, name: string): RouteDraft =>
  ({ id, name, driverId: "", vehicleId: "", boats: [], excluded: new Set(), expanded: new Set(), manualAssign: {} });

// Persist the in-progress plan PER delivery date, so each day has its own routes
// and the plan survives tab switches / navigation / reload.
const DRAFTS_KEY = "shipsync.routing.drafts.v2";
type StoredRoute = { id: string; name: string; driverId: string; vehicleId: string; boats: string[]; excluded: string[]; expanded: string[]; manualAssign?: Record<string, string> };
function loadAll(): Record<string, StoredRoute[]> {
  try { const raw = typeof window !== "undefined" ? localStorage.getItem(DRAFTS_KEY) : null; return raw ? (JSON.parse(raw) ?? {}) : {}; }
  catch { return {}; }
}
function saveAll(map: Record<string, StoredRoute[]>) {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(map)); } catch { /* storage full/unavailable — non-fatal */ }
}
function serializeRoutes(routes: RouteDraft[]): StoredRoute[] {
  return routes.map((r) => ({ id: r.id, name: r.name, driverId: r.driverId, vehicleId: r.vehicleId, boats: r.boats, excluded: [...r.excluded], expanded: [...r.expanded], manualAssign: r.manualAssign }));
}
/** Rehydrate a day's stored routes, or start a fresh Route 1 when the day has none. */
function hydrateRoutes(stored: StoredRoute[] | undefined): RouteDraft[] {
  const rs: RouteDraft[] = (stored ?? []).map((r) => ({
    id: String(r.id), name: String(r.name), driverId: r.driverId ?? "", vehicleId: r.vehicleId ?? "",
    boats: Array.isArray(r.boats) ? r.boats : [],
    excluded: new Set<string>(r.excluded ?? []), expanded: new Set<string>(r.expanded ?? []),
    manualAssign: r.manualAssign ?? {},
  }));
  return rs.length ? rs : [newRoute("r1", "Route 1")];
}
const maxRouteNum = (routes: RouteDraft[]) =>
  routes.reduce((m, r) => { const n = parseInt(r.name.replace(/\D/g, ""), 10); return isNaN(n) ? m : Math.max(m, n); }, 1);

/**
 * Searchable client/location picker — the fleet is large enough that a plain
 * dropdown is unusable, so this is a Popover + Command combobox with a search
 * box instead. `groups` lets a caller show a "Locations" section separately
 * from clients without needing two separate combobox instances.
 */
function ClientCombobox({
  placeholder, groups, onSelect, icon: Icon = Ship, emptyText = "Nothing to add",
}: {
  placeholder: string;
  groups: { heading?: string; items: { value: string; label: string }[] }[];
  onSelect: (value: string) => void;
  icon?: ComponentType<{ className?: string }>;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const isEmpty = groups.every((g) => g.items.length === 0);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open}
          className="h-8 w-72 justify-start gap-2 text-xs font-normal text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {isEmpty ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</div>
        ) : (
          <Command>
            <CommandInput placeholder="Search…" className="h-9 text-xs" />
            <CommandList>
              <CommandEmpty className="py-4 text-xs">No matches.</CommandEmpty>
              {groups.map((g, i) => g.items.length === 0 ? null : (
                <CommandGroup key={g.heading ?? i} heading={g.heading}>
                  {g.items.map((o) => (
                    <CommandItem key={o.value} value={o.label}
                      onSelect={() => { onSelect(o.value); setOpen(false); }} className="text-xs">
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Delivery address for a stop, editable inline so it can be set before
 * dispatch instead of only afterward on the Dispatched tab. Shows the address
 * as a click-to-edit label when one exists, or a flagged "Add address" prompt
 * when it doesn't.
 */
function AddressField({ address, onSave }: { address?: string | null; onSave: (address: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(address ?? "");
  useEffect(() => { setValue(address ?? ""); }, [address]);
  function save() {
    const v = value.trim();
    if (v && v !== address) onSave(v);
    setOpen(false);
  }
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setValue(address ?? ""); }}>
      <PopoverTrigger asChild>
        {address ? (
          <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" title="Click to edit delivery address">
            <Anchor className="h-3 w-3" /> {address}
          </button>
        ) : (
          <button className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-medium text-amber-500 hover:bg-amber-500/25" title="No delivery address set">
            <Anchor className="h-3 w-3" /> Add address
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 p-2.5" align="start">
        <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Marina / berth address" className="h-8 text-xs"
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false); }} />
        <Button size="sm" className="h-7 w-full text-xs" disabled={!value.trim()} onClick={save}>Save address</Button>
      </PopoverContent>
    </Popover>
  );
}

export function ShipSyncRouting({ data, reload }: { data: ShipSyncData; reload: () => Promise<void> }) {
  const seq = useRef(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [mapRoute, setMapRoute] = useState<{ name: string; stops: RouteStop[] } | null>(null);
  const [scanRouteId, setScanRouteId] = useState<string | null>(null);
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

  // Clients still available to add, sorted (unassigned-name group last). Every
  // known client is listed, not just the ones with parcels waiting today — a route
  // often has to be planned for a client before their parcels have been checked in.
  const availableBoats = useMemo(() => {
    // Keyed on the upper-cased name so a vessel-list entry and a parcel's boat name
    // that differ only in case or stray spacing don't both show up as separate rows.
    // Names that actually have parcels are added first and keep their exact
    // spelling, so the per-client parcel lookups below still match.
    const byKey = new Map<string, string>();
    const add = (name?: string | null) => {
      const n = name ?? "";
      if (!n.trim()) return;
      const k = n.trim().toUpperCase();
      if (!byKey.has(k)) byKey.set(k, n);
    };
    for (const b of parcelsByBoat.keys()) add(b);
    for (const y of data.yachts) add(y);
    for (const d of data.destinations) if ((d as any).type !== "location") add(d.boat_name);
    return Array.from(byKey.values())
      .filter((b) => !assignedBoats.has(b))
      .sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)));
  }, [parcelsByBoat, assignedBoats, data.yachts, data.destinations]);

  // Pickup / drop-off Locations (hotels, marinas, suppliers) from the Locations
  // tab — selectable as route stops even when they have no waiting parcels.
  const availableLocations = useMemo(() => {
    const boatSet = new Set(availableBoats);
    return data.destinations
      .filter((d) => (d as any).type === "location" && d.boat_name)
      .map((d) => d.boat_name)
      .filter((n) => !assignedBoats.has(n) && !boatSet.has(n))
      .filter((n, i, a) => a.indexOf(n) === i)
      .sort((a, b) => a.localeCompare(b));
  }, [data.destinations, assignedBoats, availableBoats]);

  const activeDrivers = useMemo(() => data.drivers.filter((d) => d.active), [data.drivers]);

  // A stop's parcels: its own client's waiting parcels, MINUS any that were
  // manually pulled into a different stop that's still on this route, PLUS
  // any other client's parcels manually pulled into this stop instead. A
  // parcel only ever counts once per route — pulling it into one stop takes
  // it off wherever it would otherwise show. Includes unticked (excluded)
  // parcels, so the checklist UI can still show and re-tick them.
  function stopAllParcels(r: RouteDraft, boat: string): ShipSyncPackage[] {
    const byId = new Map<string, ShipSyncPackage>();
    for (const p of parcelsByBoat.get(boat) ?? []) {
      const to = r.manualAssign[p.id];
      const pulledElsewhere = to && to !== boat && r.boats.includes(to);
      if (!pulledElsewhere) byId.set(p.id, p);
    }
    for (const p of unrouted) {
      if (r.manualAssign[p.id] === boat) byId.set(p.id, p);
    }
    // Order by the parcel's own boat (so pulled-in packages from another
    // client group together instead of interleaving), then oldest-received
    // first within that group.
    return Array.from(byId.values()).sort((a, b) => {
      const boatCmp = (a.boat_name || UNASSIGNED).localeCompare(b.boat_name || UNASSIGNED);
      if (boatCmp !== 0) return boatCmp;
      return (a.received_at ?? "").localeCompare(b.received_at ?? "");
    });
  }
  /** Same as stopAllParcels, minus the ones unticked off this route. */
  function stopParcels(r: RouteDraft, boat: string): ShipSyncPackage[] {
    return stopAllParcels(r, boat).filter((p) => !r.excluded.has(p.id));
  }

  // Parcels included on a route: every stop's parcels, deduped (each parcel
  // belongs to exactly one stop per stopParcels above).
  function routeParcels(r: RouteDraft): ShipSyncPackage[] {
    const byId = new Map<string, ShipSyncPackage>();
    for (const boat of r.boats) for (const p of stopParcels(r, boat)) byId.set(p.id, p);
    return Array.from(byId.values());
  }

  /** Pull every one of `sourceClient`'s currently-waiting parcels into `targetStop`. */
  function pullInClient(routeId: string, targetStop: string, sourceClient: string) {
    const toPull = parcelsByBoat.get(sourceClient) ?? [];
    if (toPull.length === 0) return;
    patchRoute(routeId, (r) => {
      const manualAssign = { ...r.manualAssign };
      for (const p of toPull) manualAssign[p.id] = targetStop;
      return { ...r, manualAssign };
    });
    toast.success(`Pulled ${toPull.length} parcel${toPull.length === 1 ? "" : "s"} from ${sourceClient} into ${targetStop === UNASSIGNED ? "this stop" : targetStop}`);
  }

  async function saveClientAddress(boat: string, address: string) {
    try {
      await saveDestination({ boat_name: boat, address, type: destByBoat.get(boat.toUpperCase())?.type ?? "vessel" });
      await reload();
      toast.success(`Delivery address saved for ${boat}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save address");
    }
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
      const ids = stopAllParcels(r, boat).map((p) => p.id);
      const excluded = new Set(r.excluded); ids.forEach((x) => excluded.delete(x));
      const expanded = new Set(r.expanded); expanded.delete(boat);
      const manualAssign = { ...r.manualAssign };
      for (const [pid, to] of Object.entries(manualAssign)) if (to === boat) delete manualAssign[pid];
      return { ...r, boats: r.boats.filter((b) => b !== boat), excluded, expanded, manualAssign };
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
  // Scan a parcel's barcode to check it out onto this route (PowerApps "Check Out
  // Parcel"): find the waiting parcel, add its boat to the route and include it.
  function handleScan(routeId: string, raw: string) {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    const p = unrouted.find((x) => (x.barcode ?? "").toUpperCase() === code);
    if (!p) { toast.error(`No waiting parcel matches “${raw.trim()}” (already routed or not checked in)`); return; }
    const boat = p.boat_name || UNASSIGNED;
    const onOther = routes.some((r) => r.id !== routeId && r.boats.includes(boat));
    if (onOther) { toast.error(`${boat === UNASSIGNED ? "That parcel’s group" : boat} is already on another route`); return; }
    patchRoute(routeId, (r) => {
      const boats = r.boats.includes(boat) ? r.boats : [...r.boats, boat];
      const excluded = new Set(r.excluded); excluded.delete(p.id);
      const expanded = new Set(r.expanded); expanded.add(boat);
      return { ...r, boats, excluded, expanded };
    });
    toast.success(`Scanned ${p.barcode} → added ${boat === UNASSIGNED ? "parcel" : boat} to the route`);
  }

  async function dispatch(r: RouteDraft) {
    const parcels = routeParcels(r);
    if (parcels.length === 0) { toast.error("Add clients/parcels to this route first"); return; }
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
      toast.success(`Dispatched ${parcels.length} parcel${parcels.length > 1 ? "s" : ""} across ${distinctBoats.length} client${distinctBoats.length > 1 ? "s" : ""} to ${driver?.name ?? "driver"} for ${deliveryDate} (DN-${note.number})`);
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
                  <span className="text-[12px] text-muted-foreground">{r.boats.length} client{r.boats.length === 1 ? "" : "s"} · {parcels.length} parcel{parcels.length === 1 ? "" : "s"}</span>
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
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" title="Scan a parcel to check it out onto this route" onClick={() => setScanRouteId(r.id)}>
                      <ScanLine className="h-3.5 w-3.5" /> Scan
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

                {/* Add-client picker */}
                <div className="border-b border-border/60 px-4 py-2.5">
                  <ClientCombobox
                    placeholder="Add client to this route…"
                    emptyText="No clients or locations left to add"
                    icon={Plus}
                    onSelect={(v) => addBoat(r.id, v)}
                    groups={[
                      { items: availableBoats.map((b) => ({ value: b, label: `${b === UNASSIGNED ? "No client set" : b} (${(parcelsByBoat.get(b) ?? []).length})` })) },
                      { heading: "Locations", items: availableLocations.map((b) => ({ value: b, label: `📍 ${b}` })) },
                    ]}
                  />
                </div>

                {/* Boats on this route */}
                {r.boats.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">No clients yet — add one above.</div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {r.boats.map((boat, boatIndex) => {
                      const all = stopAllParcels(r, boat);
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
                            <span className="text-sm font-medium">{boat === UNASSIGNED ? "No client set" : boat}</span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{included}/{all.length} pkg</span>
                            {boat !== UNASSIGNED && <AddressField address={dest?.address} onSave={(address) => void saveClientAddress(boat, address)} />}
                            <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => removeBoat(r.id, boat)} title="Remove client from route">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {open && (
                            <div className="divide-y divide-border/30 bg-background/40 pl-9">
                              <div className="px-4 py-2">
                                <ClientCombobox
                                  placeholder="Pull in another client's packages…"
                                  emptyText="No other clients with waiting packages"
                                  onSelect={(v) => pullInClient(r.id, boat, v)}
                                  groups={[{
                                    items: Array.from(parcelsByBoat.keys())
                                      .filter((b) => b !== boat)
                                      .sort((a, b2) => a.localeCompare(b2))
                                      .map((b) => ({ value: b, label: `${b === UNASSIGNED ? "No client set" : b} (${parcelsByBoat.get(b)!.length})` })),
                                  }]}
                                />
                              </div>
                              {all.map((p) => (
                                <label key={p.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-accent/30">
                                  <input type="checkbox" checked={!r.excluded.has(p.id)} onChange={() => toggleParcel(r.id, p.id)} className="h-4 w-4 accent-primary" />
                                  <span className="font-mono text-[12px]">{p.barcode ?? "—"}</span>
                                  <span className="text-muted-foreground">{p.package_owner ?? p.description ?? ""}</span>
                                  {p.courier && <span className="text-[11px] text-muted-foreground/70">{p.courier}</span>}
                                  {p.received_at && <span className="text-[11px] text-muted-foreground/60">{fmtDate(p.received_at)}</span>}
                                  {(p.boat_name || UNASSIGNED) !== boat && (
                                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary" title="Pulled in from another client">
                                      {p.boat_name || UNASSIGNED}
                                    </span>
                                  )}
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

      <BarcodeScannerDialog
        open={!!scanRouteId}
        onClose={() => setScanRouteId(null)}
        onDetected={(v) => { const id = scanRouteId; setScanRouteId(null); if (id) handleScan(id, v); }}
        title="Scan a parcel to check out"
      />
    </div>
  );
}
