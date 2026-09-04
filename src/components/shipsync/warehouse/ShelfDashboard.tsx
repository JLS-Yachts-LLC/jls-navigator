import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Boxes, Building2, Ship, Weight } from "lucide-react";
import {
  ZONES, CAPACITY_STATUS_STYLE, capacityStatus, DISPLAY_STATUS_STYLE, deriveStatus, locationCode,
} from "@/components/shipsync/warehouse/warehouse-constants";
import type { WarehouseData } from "@/components/shipsync/ShipSyncWarehouse";

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

const occupiesSpace = (status: string) => status !== "Completed";

export function ShelfDashboard({ data }: { data: WarehouseData }) {
  const { shelves, clientItems, internalItems } = data;
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  const perZone = useMemo(() => {
    return ZONES.map((zone) => {
      const zoneShelves = shelves.filter((s) => s.zone === zone);
      const maxCbm = zoneShelves.reduce((s, sh) => s + sh.max_cbm, 0);
      const maxWeightKg = zoneShelves.reduce((s, sh) => s + (sh.max_weight_kg ?? 0), 0);
      const maxShelves = zoneShelves.length;
      const occupiedKeys = new Set<string>();
      let usedCbm = 0, usedWeightKg = 0;
      for (const it of [...clientItems, ...internalItems]) {
        if (it.zone !== zone || !occupiesSpace(it.status)) continue;
        usedCbm += it.cbm ?? 0; usedWeightKg += it.weight_kg ?? 0;
        if (it.bay && it.shelf) occupiedKeys.add(`${it.bay}-${it.shelf}`);
      }
      return { zone, maxCbm, maxWeightKg, maxShelves, usedShelves: occupiedKeys.size, usedCbm, usedWeightKg };
    });
  }, [shelves, clientItems, internalItems]);

  const totals = useMemo(() => {
    const maxCbm = perZone.reduce((s, z) => s + z.maxCbm, 0);
    const usedCbm = perZone.reduce((s, z) => s + z.usedCbm, 0);
    const maxShelves = perZone.reduce((s, z) => s + z.maxShelves, 0);
    const usedShelves = perZone.reduce((s, z) => s + z.usedShelves, 0);
    return { maxCbm, usedCbm, maxShelves, usedShelves, availableCbm: maxCbm - usedCbm, availableShelves: maxShelves - usedShelves };
  }, [perZone]);

  const clientUsage = useMemo(() => {
    const m = new Map<string, { shelves: Set<string>; packages: number; cbm: number }>();
    for (const it of clientItems) {
      const e = m.get(it.client_name) ?? { shelves: new Set<string>(), packages: 0, cbm: 0 };
      e.shelves.add(locationCode(it)); e.packages += 1; e.cbm += it.cbm ?? 0;
      m.set(it.client_name, e);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, shelves: v.shelves.size, packages: v.packages, cbm: v.cbm }))
      .sort((a, b) => b.cbm - a.cbm);
  }, [clientItems]);

  const deptUsage = useMemo(() => {
    const m = new Map<string, { shelves: Set<string>; count: number; cbm: number }>();
    for (const it of internalItems) {
      const e = m.get(it.department) ?? { shelves: new Set<string>(), count: 0, cbm: 0 };
      e.shelves.add(locationCode(it)); e.count += 1; e.cbm += it.cbm ?? 0;
      m.set(it.department, e);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, shelves: v.shelves.size, count: v.count, cbm: v.cbm }))
      .sort((a, b) => b.cbm - a.cbm);
  }, [internalItems]);

  const selectedItems = selectedClient ? clientItems.filter((i) => i.client_name === selectedClient) : [];

  return (
    <div className="space-y-5">
      {shelves.length === 0 && (
        <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
          No shelves registered yet — capacity below will read zero until shelves are added under Zone & Storage Status.
        </div>
      )}

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
          {perZone.map((z) => {
            const weightPct = z.maxWeightKg ? (z.usedWeightKg / z.maxWeightKg) * 100 : 0;
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
                  <div className="flex items-center justify-between pt-1"><span>Volume</span><span className="tabular-nums">{z.usedCbm.toFixed(1)} / {z.maxCbm.toFixed(1)} m³</span></div>
                  <div className="flex items-center justify-between"><span>Shelves</span><span className="tabular-nums">{z.usedShelves} / {z.maxShelves}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
                  <span className="text-[11px] text-muted-foreground">{c.shelves} shelf{c.shelves === 1 ? "" : "shelves"} · {c.cbm.toFixed(2)} m³ · {c.packages} pkg</span>
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
                  <span className="text-[11px] text-muted-foreground">{d.shelves} shelf{d.shelves === 1 ? "" : "shelves"} · {d.cbm.toFixed(2)} m³ · {d.count} item{d.count === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
                {selectedItems.map((it) => {
                  const status = deriveStatus(it.due_date, it.status);
                  return (
                    <tr key={it.ref_no}>
                      <td className="px-3 py-2 font-mono">{it.ref_no}</td>
                      <td className="px-3 py-2">{it.description}</td>
                      <td className="px-3 py-2">{locationCode(it)}</td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", DISPLAY_STATUS_STYLE[status])}>{status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
