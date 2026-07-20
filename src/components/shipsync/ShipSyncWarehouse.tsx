import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, PackageCheck, X } from "lucide-react";
import { ZONE_RACKS, ZONE_LEVELS, ALL_ZONES } from "@/lib/shipsync/model";
import type { ShipSyncData } from "@/components/shipsync-page";

export function ShipSyncWarehouse({ data }: { data: ShipSyncData; reload: () => Promise<void> }) {
  const [zone, setZone] = useState<string | null>(null);
  const [boatFilter, setBoatFilter] = useState<string>("");     // Search by boat
  const [showAvailable, setShowAvailable] = useState(false);    // Highlight empty racks

  // In-storage packages grouped by zone.
  const byZone = useMemo(() => {
    const m = new Map<string, typeof data.packages>();
    for (const p of data.packages) {
      if (p.status !== "in_storage" || !p.warehouse_zone) continue;
      const arr = m.get(p.warehouse_zone) ?? [];
      arr.push(p); m.set(p.warehouse_zone, arr);
    }
    return m;
  }, [data.packages]);

  // Boats that currently have stock in storage (for the boat search).
  const boatsInStorage = useMemo(() => {
    const s = new Set<string>();
    for (const items of byZone.values()) for (const p of items) if (p.boat_name) s.add(p.boat_name);
    return Array.from(s).sort();
  }, [byZone]);

  // Rack cells holding the searched boat's stock (null when not searching).
  const boatCells = useMemo(() => {
    if (!boatFilter) return null;
    const s = new Set<string>();
    for (const [code, items] of byZone) if (items.some((i) => i.boat_name === boatFilter)) s.add(code);
    return s;
  }, [boatFilter, byZone]);

  const availableCount = useMemo(() => ALL_ZONES.filter((c) => !(byZone.get(c)?.length)).length, [byZone]);

  const clearFilters = () => { setBoatFilter(""); setShowAvailable(false); };

  const sel = zone ? (byZone.get(zone) ?? []) : [];

  return (
    <div className="grid gap-4 px-6 py-5 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-3 text-sm text-muted-foreground">In-storage occupancy by rack. <strong>K</strong> = JLS storage; <strong>A–J</strong> = racks, 4 levels each. Click a cell to see what's in it.</div>

        {/* Two features: show available locations, and search by boat. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Select value={boatFilter || undefined} onValueChange={(v) => { setBoatFilter(v); setShowAvailable(false); setZone(null); }}>
              <SelectTrigger className="h-9 w-64 pl-8 text-sm"><SelectValue placeholder="Search by boat…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {boatsInStorage.length === 0
                  ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No boats in storage</div>
                  : boatsInStorage.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant={showAvailable ? "default" : "outline"} className="h-9 gap-1.5"
            onClick={() => { setShowAvailable((v) => !v); setBoatFilter(""); setZone(null); }}>
            <PackageCheck className="h-4 w-4" /> Available locations
            <span className="ml-1 rounded-full bg-black/10 px-1.5 text-[11px] font-semibold dark:bg-white/10">{availableCount}</span>
          </Button>
          {(boatFilter || showAvailable) && (
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground" onClick={clearFilters}>
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
          {boatFilter && (
            <span className="text-[12px] text-muted-foreground">
              {boatCells && boatCells.size > 0 ? `${boatFilter} in ${boatCells.size} location${boatCells.size === 1 ? "" : "s"}` : `No stock located for ${boatFilter}`}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {ZONE_RACKS.map((rack) => (
            <div key={rack} className="rounded-xl border border-border bg-card p-2">
              <div className="mb-1 text-center text-[11px] font-bold text-muted-foreground">{rack === "K" ? "K · Storage" : rack}</div>
              <div className="flex flex-col gap-1">
                {ZONE_LEVELS.map((lvl) => {
                  const code = `${rack}${lvl}`;
                  const items = byZone.get(code) ?? [];
                  const occupied = items.length > 0;
                  // Cell appearance: green = empty/available, light red = occupied.
                  let cls = occupied ? "border-red-400/50 bg-red-400/15" : "border-emerald-500/50 bg-emerald-500/15";
                  if (showAvailable) cls = occupied ? "border-border bg-muted/20 opacity-40" : "border-emerald-500/50 bg-emerald-500/15";
                  if (boatCells) cls = boatCells.has(code) ? "border-primary bg-primary/25 ring-2 ring-primary/60" : "border-border bg-muted/20 opacity-40";
                  return (
                    <button key={code} onClick={() => setZone(code)}
                      title={items.map((i) => i.boat_name).filter(Boolean).join(", ")}
                      className={`h-12 w-20 rounded-md border text-left transition ${zone === code ? "ring-2 ring-primary" : ""} ${cls}`}>
                      <div className="px-1.5 pt-1 text-[11px] font-semibold">{code}</div>
                      <div className="px-1.5 text-[10px] text-muted-foreground">{occupied ? `${items.length} pkg` : "empty"}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel: boat search → where the boat is stored; else selected-zone contents. */}
      <div className="rounded-xl border border-border bg-card p-4">
        {boatFilter ? (
          <>
            <div className="mb-2 font-display text-sm font-semibold">Where {boatFilter} is stored</div>
            {!boatCells || boatCells.size === 0 ? (
              <div className="text-sm text-muted-foreground">No stock for this boat is located in a rack.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {Array.from(boatCells).sort().map((code) => {
                  const items = (byZone.get(code) ?? []).filter((i) => i.boat_name === boatFilter);
                  return (
                    <div key={code} className="rounded-lg border border-border/60 p-2.5 text-sm">
                      <div className="font-semibold">{code} <span className="text-[12px] font-normal text-muted-foreground">· {items.length} pkg</span></div>
                      {items.map((p) => (
                        <div key={p.id} className="mt-1 text-[12px] font-mono text-muted-foreground">{p.barcode ?? "—"}{p.package_owner ? ` · ${p.package_owner}` : ""}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-2 font-display text-sm font-semibold">{zone ? `Zone ${zone}` : "Select a zone"}</div>
            {!zone ? <div className="text-sm text-muted-foreground">Click a rack cell to view its packages.</div>
              : sel.length === 0 ? <div className="text-sm text-muted-foreground">Empty.</div> : (
              <div className="flex flex-col gap-2">
                {sel.map((p) => (
                  <div key={p.id} className="rounded-lg border border-border/60 p-2.5 text-sm">
                    <div className="font-medium">{p.boat_name ?? "—"}</div>
                    <div className="text-[12px] text-muted-foreground font-mono">{p.barcode ?? "—"}{p.package_owner ? ` · ${p.package_owner}` : ""}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
