import { useMemo, useState } from "react";
import { ZONE_RACKS, ZONE_LEVELS } from "@/lib/shipsync/model";
import type { ShipSyncData } from "@/components/shipsync-page";

export function ShipSyncWarehouse({ data }: { data: ShipSyncData; reload: () => Promise<void> }) {
  const [zone, setZone] = useState<string | null>(null);
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
  const sel = zone ? (byZone.get(zone) ?? []) : [];

  return (
    <div className="grid gap-4 px-6 py-5 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-3 text-sm text-muted-foreground">In-storage occupancy by rack. <strong>K</strong> = JLS storage; <strong>A–J</strong> = racks, 4 levels each. Click a cell to see what's in it.</div>
        <div className="flex flex-wrap gap-3">
          {ZONE_RACKS.map((rack) => (
            <div key={rack} className="rounded-xl border border-border bg-card p-2">
              <div className="mb-1 text-center text-[11px] font-bold text-muted-foreground">{rack === "K" ? "K · Storage" : rack}</div>
              <div className="flex flex-col gap-1">
                {ZONE_LEVELS.map((lvl) => {
                  const code = `${rack}${lvl}`;
                  const items = byZone.get(code) ?? [];
                  const occupied = items.length > 0;
                  return (
                    <button key={code} onClick={() => setZone(code)}
                      title={items.map((i) => i.boat_name).filter(Boolean).join(", ")}
                      className={`h-12 w-20 rounded-md border text-left transition ${zone === code ? "ring-2 ring-primary" : ""} ${occupied ? "border-primary/40 bg-primary/10" : "border-border bg-muted/30"}`}>
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

      <div className="rounded-xl border border-border bg-card p-4">
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
      </div>
    </div>
  );
}
