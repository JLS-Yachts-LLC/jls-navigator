import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Boxes, Building2, Ship, Weight } from "lucide-react";
import {
  SAMPLE_ZONE_CAPACITY, CAPACITY_STATUS_STYLE, capacityStatus,
  SAMPLE_CLIENT_ITEMS, SAMPLE_INTERNAL_ITEMS, locationCode,
} from "@/components/shipsync/warehouse/warehouse-constants";

function Bar({ pct, tone }: { pct: number; tone: "emerald" | "amber" | "red" }) {
  const fill = tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function toneFor(status: string): "emerald" | "amber" | "red" {
  return status === "Full/Restricted" ? "red" : status === "Warning" ? "amber" : "emerald";
}

export function ShelfDashboard() {
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  const totals = useMemo(() => {
    const maxCbm = SAMPLE_ZONE_CAPACITY.reduce((s, z) => s + z.maxCbm, 0);
    const usedCbm = SAMPLE_ZONE_CAPACITY.reduce((s, z) => s + z.usedCbm, 0);
    const maxShelves = SAMPLE_ZONE_CAPACITY.reduce((s, z) => s + z.maxShelves, 0);
    const usedShelves = SAMPLE_ZONE_CAPACITY.reduce((s, z) => s + z.usedShelves, 0);
    return { maxCbm, usedCbm, maxShelves, usedShelves, availableCbm: maxCbm - usedCbm, availableShelves: maxShelves - usedShelves };
  }, []);

  // Client space usage — occupied shelving (count of items) + package count, from sample data.
  const clientUsage = useMemo(() => {
    const m = new Map<string, { shelves: Set<string>; packages: number }>();
    for (const it of SAMPLE_CLIENT_ITEMS) {
      const e = m.get(it.clientName) ?? { shelves: new Set<string>(), packages: 0 };
      e.shelves.add(locationCode(it)); e.packages += 1;
      m.set(it.clientName, e);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, shelves: v.shelves.size, packages: v.packages }))
      .sort((a, b) => b.packages - a.packages);
  }, []);

  const deptUsage = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of SAMPLE_INTERNAL_ITEMS) m.set(it.department, (m.get(it.department) ?? 0) + 1);
    return Array.from(m.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, []);

  const selectedItems = selectedClient ? SAMPLE_CLIENT_ITEMS.filter((i) => i.clientName === selectedClient) : [];

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
        UI preview — the numbers below are illustrative sample data, not live warehouse figures.
      </div>

      {/* Warehouse capacity — overall + per zone */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 font-display text-sm font-semibold"><Weight className="h-4 w-4 text-primary/70" /> Warehouse Capacity</div>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border/60 p-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Total storage space</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums">{totals.maxCbm.toFixed(0)} m³</div>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Occupied space</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums">{totals.usedCbm.toFixed(0)} m³</div>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Available space</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{totals.availableCbm.toFixed(0)} m³</div>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Available shelving</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums">{totals.availableShelves} / {totals.maxShelves}</div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SAMPLE_ZONE_CAPACITY.map((z) => {
            const weightPct = (z.usedWeightKg / z.maxWeightKg) * 100;
            const status = capacityStatus(weightPct);
            return (
              <div key={z.zone} className="rounded-lg border border-border/60 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-display text-sm font-semibold">Zone {z.zone}</span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", CAPACITY_STATUS_STYLE[status])}>{status}</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-muted-foreground">
                  <div className="flex items-center justify-between"><span>Weight</span><span className="tabular-nums">{z.usedWeightKg.toLocaleString()} / {z.maxWeightKg.toLocaleString()} kg</span></div>
                  <Bar pct={weightPct} tone={toneFor(status)} />
                  <div className="flex items-center justify-between pt-1"><span>Volume</span><span className="tabular-nums">{z.usedCbm} / {z.maxCbm} m³</span></div>
                  <div className="flex items-center justify-between"><span>Shelves</span><span className="tabular-nums">{z.usedShelves} / {z.maxShelves}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Client + internal storage summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 font-display text-sm font-semibold"><Ship className="h-4 w-4 text-primary/70" /> Client Storage — by space used</div>
          {clientUsage.length === 0 ? <p className="text-sm text-muted-foreground">No clients currently storing items.</p> : (
            <div className="flex flex-col gap-1.5">
              {clientUsage.map((c) => (
                <button key={c.name} onClick={() => setSelectedClient(c.name)}
                  className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition",
                    selectedClient === c.name ? "border-primary bg-primary/5" : "border-border/60 hover:bg-accent/30")}>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-[11px] text-muted-foreground">{c.shelves} shelf{c.shelves === 1 ? "" : "shelves"} · {c.packages} pkg</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 font-display text-sm font-semibold"><Building2 className="h-4 w-4 text-primary/70" /> Internal Storage — by department</div>
          {deptUsage.length === 0 ? <p className="text-sm text-muted-foreground">No internal items currently stored.</p> : (
            <div className="flex flex-col gap-1.5">
              {deptUsage.map((d) => (
                <div key={d.name} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-[11px] text-muted-foreground">{d.count} item{d.count === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Client storage details — packages/items for the selected client */}
      {selectedClient && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 font-display text-sm font-semibold"><Boxes className="h-4 w-4 text-primary/70" /> {selectedClient} — storage details</div>
            <button onClick={() => setSelectedClient(null)} className="text-[11px] text-muted-foreground hover:text-foreground">Close</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Ref No.</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {selectedItems.map((it) => (
                  <tr key={it.refNo}>
                    <td className="px-3 py-2 font-mono">{it.refNo}</td>
                    <td className="px-3 py-2">{it.description}</td>
                    <td className="px-3 py-2">{locationCode(it)}</td>
                    <td className="px-3 py-2">{it.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
