import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFleetPositions, type FleetVehicle } from "@/lib/mygps.server";
import {
  Navigation, RefreshCw, Loader2, Search, Car, User, Eye, EyeOff,
  AlertTriangle, ExternalLink, Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Provider monitor link kept as a fallback "full view".
const MONITOR_URL = "https://tracking.mygps.ae/backend/monitor_token.php?token=fd25f0cce7423608b3fa820bb6a92931";

// Client-only Leaflet map (touches window → must not render during SSR).
const FleetMap = lazy(() => import("@/components/fleet-map"));

type Mode = "vehicle" | "driver";

export function FleetTrackingPage() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("vehicle");
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<{ id: number; lat: number; lon: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const fitOnce = useRef(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    void load(true);
    const t = setInterval(() => void load(false), 30_000);
    return () => clearInterval(t);
  }, []);

  async function load(initial: boolean) {
    if (initial) setLoading(true);
    try {
      const res = await (getFleetPositions as any)() as { vehicles: FleetVehicle[]; fetchedAt: string };
      setVehicles(res.vehicles);
      setFetchedAt(res.fetchedAt);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load vehicle positions.");
    } finally {
      if (initial) setLoading(false);
    }
  }

  const isVisible = (id: number) => !hidden.has(id);
  function toggleOne(id: number) {
    setHidden(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function setGroup(ids: number[], visible: boolean) {
    setHidden(prev => { const n = new Set(prev); ids.forEach(id => visible ? n.delete(id) : n.add(id)); return n; });
  }
  const allVisible = hidden.size === 0;

  const filtered = useMemo(() => {
    if (!q.trim()) return vehicles;
    const s = q.toLowerCase();
    return vehicles.filter(v => v.name.toLowerCase().includes(s) || (v.driver ?? "").toLowerCase().includes(s));
  }, [vehicles, q]);

  // Group for the "By Driver" view.
  const driverGroups = useMemo(() => {
    const m = new Map<string, FleetVehicle[]>();
    for (const v of filtered) {
      const k = v.driver?.trim() || "Unassigned";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(v);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const visibleVehicles = useMemo(() => vehicles.filter(v => isVisible(v.id)), [vehicles, hidden]);

  function focusOn(v: FleetVehicle) {
    if (v.lat != null && v.lon != null) {
      if (hidden.has(v.id)) toggleOne(v.id);
      setFocus({ id: v.id, lat: v.lat, lon: v.lon });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">ShipSync / Transport &amp; Fleet</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <Navigation className="h-4 w-4 text-primary/80" /> Live Fleet Tracking
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {fetchedAt && <span className="text-[11px] text-muted-foreground">Updated {new Date(fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" asChild>
            <a href={MONITOR_URL} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open Full View</a>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Overlay panel */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card/20">
          <div className="border-b border-border/60 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/40 p-1">
              <button onClick={() => setMode("vehicle")} className={cn("flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition", mode === "vehicle" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}><Car className="h-3.5 w-3.5" /> By Vehicle</button>
              <button onClick={() => setMode("driver")} className={cn("flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition", mode === "driver" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}><User className="h-3.5 w-3.5" /> By Driver</button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="h-8 pl-8 text-sm" />
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm font-medium">
              <input type="checkbox" checked={allVisible} ref={el => { if (el) el.indeterminate = !allVisible && hidden.size < vehicles.length; }}
                onChange={e => setGroup(vehicles.map(v => v.id), e.target.checked)} />
              All vehicles
              <span className="ml-auto text-xs text-muted-foreground">{visibleVehicles.length}/{vehicles.length}</span>
            </label>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : error ? (
              <div className="m-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600">
                <AlertTriangle className="mb-1 h-4 w-4" />
                <p className="font-medium">Live data unavailable</p>
                <p className="mt-1 text-amber-700/80">{error}</p>
              </div>
            ) : mode === "vehicle" ? (
              <div className="space-y-0.5">
                {filtered.map(v => <VehicleRow key={v.id} v={v} visible={isVisible(v.id)} onToggle={() => toggleOne(v.id)} onFocus={() => focusOn(v)} />)}
              </div>
            ) : (
              <div className="space-y-2">
                {driverGroups.map(([driver, list]) => {
                  const ids = list.map(v => v.id);
                  const groupVisible = ids.every(isVisible);
                  return (
                    <div key={driver}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs font-semibold">
                        <input type="checkbox" checked={groupVisible} ref={el => { if (el) el.indeterminate = !groupVisible && ids.some(isVisible); }} onChange={e => setGroup(ids, e.target.checked)} />
                        <User className="h-3.5 w-3.5 text-muted-foreground" /> {driver}
                        <span className="ml-auto font-normal text-muted-foreground">{list.length}</span>
                      </label>
                      <div className="mt-0.5 space-y-0.5 pl-2">
                        {list.map(v => <VehicleRow key={v.id} v={v} visible={isVisible(v.id)} onToggle={() => toggleOne(v.id)} onFocus={() => focusOn(v)} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Map */}
        <div className="relative flex-1">
          {mounted ? (
            <Suspense fallback={<div className="flex h-full items-center justify-center bg-[#aadaff]/30"><Loader2 className="h-6 w-6 animate-spin text-primary/70" /></div>}>
              <FleetMap vehicles={visibleVehicles} focus={focus} fitOnce={fitOnce} />
            </Suspense>
          ) : (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/70" /></div>
          )}
        </div>
      </div>

      <div className="border-t border-border/40 bg-muted/10 px-6 py-2 text-[11px] text-muted-foreground/60">
        Real-time GPS positions from the JLS vehicle fleet · mygps.ae
      </div>
    </div>
  );
}

function VehicleRow({ v, visible, onToggle, onFocus }: { v: FleetVehicle; visible: boolean; onToggle: () => void; onFocus: () => void }) {
  const located = v.lat != null && v.lon != null;
  return (
    <div className={cn("group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-accent/30", !visible && "opacity-50")}>
      <input type="checkbox" checked={visible} onChange={onToggle} className="shrink-0" />
      <button onClick={onFocus} disabled={!located} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default">
        <Circle className={cn("h-2 w-2 shrink-0 fill-current", v.online ? "text-emerald-500" : "text-slate-400")} />
        <span className="min-w-0">
          <span className="block truncate leading-tight">{v.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{v.status ?? "—"}{v.driver ? ` · ${v.driver}` : ""}</span>
        </span>
      </button>
      <button onClick={onToggle} className="shrink-0 text-muted-foreground/40 opacity-0 transition group-hover:opacity-100" title={visible ? "Hide" : "Show"}>
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
