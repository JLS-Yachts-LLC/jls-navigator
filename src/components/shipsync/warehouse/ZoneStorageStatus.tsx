import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Compass, Calculator, Plus, Trash2, CheckCircle2 } from "lucide-react";
import {
  ZONES, calcCbm, locationCode, shelfUsage,
} from "@/components/shipsync/warehouse/warehouse-constants";
import { shelfCrud, type Zone, type WarehouseShelf } from "@/lib/warehouse/data";
import type { WarehouseData } from "@/components/shipsync/ShipSyncWarehouse";

type SubTab = "finder" | Zone;
const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "finder", label: "Shelf Finder" },
  ...ZONES.map((z) => ({ key: z as SubTab, label: `Zone ${z}` })),
];

export function ZoneStorageStatus({ data, reload }: { data: WarehouseData; reload: () => Promise<void> }) {
  const [tab, setTab] = useState<SubTab>("finder");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card/50 p-1 w-fit">
        {SUB_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
              tab === t.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "finder" ? <ShelfFinderAndCalculator data={data} /> : <ZoneDetails zone={tab} data={data} reload={reload} />}
    </div>
  );
}

// ── Shelf Finder ─────────────────────────────────────────────────────────────

function ShelfFinderAndCalculator({ data }: { data: WarehouseData }) {
  const [dims, setDims] = useState({ length: "", width: "", height: "", weight: "" });
  const [searched, setSearched] = useState(false);

  const shelvesWithUsage = useMemo(() => data.shelves.map((s) => ({
    ...s, ...shelfUsage(s.zone, s.bay, s.shelf, data.clientItems, data.internalItems),
  })), [data.shelves, data.clientItems, data.internalItems]);

  const matches = useMemo(() => {
    if (!searched) return [];
    const l = Number(dims.length) || 0, w = Number(dims.width) || 0, h = Number(dims.height) || 0, wt = Number(dims.weight) || 0;
    const neededCbm = calcCbm(l, w, h);
    return shelvesWithUsage.filter((s) => {
      const availCbm = s.max_cbm - s.usedCbm;
      const availWeight = s.max_weight_kg - s.usedWeightKg;
      return l <= s.max_length_cm && w <= s.max_width_cm && h <= s.max_height_cm && neededCbm <= availCbm && wt <= availWeight;
    }).sort((a, b) => (a.max_cbm - a.usedCbm) - (b.max_cbm - b.usedCbm));
  }, [dims, searched, shelvesWithUsage]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 font-display text-sm font-semibold"><Compass className="h-4 w-4 text-primary/70" /> Shelf Finder</div>
        <p className="mb-3 text-[12.5px] text-muted-foreground">Enter a package's dimensions and weight to find a suitable, available shelf.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5"><Label className="text-xs">Length (cm)</Label><Input type="number" min={0} value={dims.length} onChange={(e) => { setDims((d) => ({ ...d, length: e.target.value })); setSearched(false); }} className="h-9" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Width (cm)</Label><Input type="number" min={0} value={dims.width} onChange={(e) => { setDims((d) => ({ ...d, width: e.target.value })); setSearched(false); }} className="h-9" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Height (cm)</Label><Input type="number" min={0} value={dims.height} onChange={(e) => { setDims((d) => ({ ...d, height: e.target.value })); setSearched(false); }} className="h-9" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Weight (kg)</Label><Input type="number" min={0} value={dims.weight} onChange={(e) => { setDims((d) => ({ ...d, weight: e.target.value })); setSearched(false); }} className="h-9" /></div>
        </div>
        <Button size="sm" className="mt-3 gap-1.5" disabled={!dims.length || !dims.width || !dims.height || !dims.weight} onClick={() => setSearched(true)}>
          <Compass className="h-3.5 w-3.5" /> Find a shelf
        </Button>

        {searched && (
          <div className="mt-4">
            {matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suitable shelf found for these dimensions/weight.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {matches.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[12.5px]">
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /><span className="font-mono font-semibold">{locationCode(s)}</span></div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>Avail. vol: {(s.max_cbm - s.usedCbm).toFixed(2)} m³</span>
                      <span>Avail. weight: {(s.max_weight_kg - s.usedWeightKg).toLocaleString()} kg</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <StorageChargeCalculator />
    </div>
  );
}

// ── Storage Charge Calculator ────────────────────────────────────────────────

// Placeholder rates — swap for the real pricing schedule when confirmed.
const STANDARD_CBM_PER_PACKAGE = 1;
const BASE_CHARGE_PER_PACKAGE = 50; // AED / month
const EXCESS_CBM_RATE = 40;         // AED / m³ / month

interface CalcRow { id: string; length: string; width: string; height: string; qty: string }
let rowSeq = 0;
const newCalcRow = (): CalcRow => ({ id: `r${++rowSeq}`, length: "", width: "", height: "", qty: "1" });

function StorageChargeCalculator() {
  const [rows, setRows] = useState<CalcRow[]>([newCalcRow()]);

  function updateRow(id: string, patch: Partial<CalcRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const totals = useMemo(() => {
    let totalCbm = 0, qtyTotal = 0;
    for (const r of rows) {
      const l = Number(r.length) || 0, w = Number(r.width) || 0, h = Number(r.height) || 0, qty = Number(r.qty) || 0;
      totalCbm += calcCbm(l, w, h) * qty;
      qtyTotal += qty;
    }
    const standardCbm = STANDARD_CBM_PER_PACKAGE * qtyTotal;
    const excessCbm = Math.max(0, totalCbm - standardCbm);
    const baseCharge = BASE_CHARGE_PER_PACKAGE * qtyTotal;
    const excessCharge = excessCbm * EXCESS_CBM_RATE;
    return { totalCbm, standardCbm, excessCbm, baseCharge, excessCharge, monthlyRate: baseCharge + excessCharge, qtyTotal };
  }, [rows]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 font-display text-sm font-semibold"><Calculator className="h-4 w-4 text-primary/70" /> Storage Charge Calculator</div>
      <p className="mb-3 text-[12.5px] text-muted-foreground">Enter one or more packages to estimate a monthly storage charge. Rates shown are placeholders — swap for the real pricing schedule.</p>

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/30">
            <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2">Length (cm)</th><th className="px-2 py-2">Width (cm)</th><th className="px-2 py-2">Height (cm)</th>
              <th className="px-2 py-2">Quantity</th><th className="px-2 py-2">CBM</th><th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((r) => {
              const cbm = calcCbm(Number(r.length) || 0, Number(r.width) || 0, Number(r.height) || 0) * (Number(r.qty) || 0);
              return (
                <tr key={r.id}>
                  <td className="px-2 py-1.5"><Input type="number" min={0} value={r.length} onChange={(e) => updateRow(r.id, { length: e.target.value })} className="h-8 w-24 text-xs" /></td>
                  <td className="px-2 py-1.5"><Input type="number" min={0} value={r.width} onChange={(e) => updateRow(r.id, { width: e.target.value })} className="h-8 w-24 text-xs" /></td>
                  <td className="px-2 py-1.5"><Input type="number" min={0} value={r.height} onChange={(e) => updateRow(r.id, { height: e.target.value })} className="h-8 w-24 text-xs" /></td>
                  <td className="px-2 py-1.5"><Input type="number" min={1} value={r.qty} onChange={(e) => updateRow(r.id, { qty: e.target.value })} className="h-8 w-20 text-xs" /></td>
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{cbm.toFixed(2)} m³</td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== r.id) : prev))}
                      className="rounded p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => setRows((prev) => [...prev, newCalcRow()])}>
        <Plus className="h-3.5 w-3.5" /> Add package
      </Button>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total CBM", `${totals.totalCbm.toFixed(2)} m³`],
          ["Standard CBM", `${totals.standardCbm.toFixed(2)} m³`],
          ["Excess CBM", `${totals.excessCbm.toFixed(2)} m³`],
          ["Base charge", `AED ${totals.baseCharge.toFixed(0)}`],
          ["Excess CBM charge", `AED ${totals.excessCharge.toFixed(0)}`],
          ["Total monthly rate", `AED ${totals.monthlyRate.toFixed(0)}`],
        ].map(([label, value], i) => (
          <div key={label} className={cn("rounded-lg border p-3", i === 5 ? "border-primary/40 bg-primary/5" : "border-border/60")}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 font-display text-base font-bold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Zone Details — real shelves + Add shelf ─────────────────────────────────

function ZoneDetails({ zone, data, reload }: { zone: Zone; data: WarehouseData; reload: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseShelf | null>(null);
  const shelves = data.shelves.filter((s) => s.zone === zone);

  async function confirmDelete() {
    if (!deleteTarget) return;
    try { await shelfCrud.remove(deleteTarget.id); toast.success("Shelf removed"); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
    finally { setDeleteTarget(null); }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zone {zone} — {shelves.length} shelf{shelves.length === 1 ? "" : "es"}</span>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add shelf</Button>
        </div>
        {shelves.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No shelves recorded for this zone yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Shelf</th><th className="px-3 py-2">Max L×W×H (cm)</th>
                  <th className="px-3 py-2">Max Volume</th><th className="px-3 py-2">Used Volume</th><th className="px-3 py-2">Available Space</th>
                  <th className="px-3 py-2">Max Weight</th><th className="px-3 py-2">Used Weight</th><th className="px-3 py-2">Available Weight</th><th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {shelves.map((s) => {
                  const { usedCbm, usedWeightKg } = shelfUsage(s.zone, s.bay, s.shelf, data.clientItems, data.internalItems);
                  return (
                    <tr key={s.id} className="hover:bg-accent/10">
                      <td className="px-3 py-2 font-mono font-medium">{locationCode(s)}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{s.max_length_cm}×{s.max_width_cm}×{s.max_height_cm}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{s.max_cbm.toFixed(1)} m³</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{usedCbm.toFixed(1)} m³</td>
                      <td className="px-3 py-2 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{(s.max_cbm - usedCbm).toFixed(1)} m³</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{s.max_weight_kg.toLocaleString()} kg</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{usedWeightKg.toLocaleString()} kg</td>
                      <td className="px-3 py-2 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{(s.max_weight_kg - usedWeightKg).toLocaleString()} kg</td>
                      <td className="px-3 py-2">
                        <button onClick={() => setDeleteTarget(s)} className="rounded p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding && <AddShelfForm zone={zone} onDone={() => setAdding(false)} onSaved={reload} />}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove shelf {deleteTarget ? locationCode(deleteTarget) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone. Items already assigned to this shelf keep their Zone/Bay/Shelf value, but it will no longer show as a registered shelf.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddShelfForm({ zone, onDone, onSaved }: { zone: Zone; onDone: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ bay: "", shelf: "", maxLength: "", maxWidth: "", maxHeight: "", maxWeight: "" });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));
  const maxCbm = calcCbm(Number(f.maxLength) || 0, Number(f.maxWidth) || 0, Number(f.maxHeight) || 0);

  async function save() {
    if (!f.bay.trim() || !f.shelf.trim() || !f.maxLength || !f.maxWidth || !f.maxHeight || !f.maxWeight) {
      toast.error("All fields are required"); return;
    }
    setBusy(true);
    try {
      await shelfCrud.create({
        zone, bay: f.bay.trim(), shelf: f.shelf.trim(),
        max_length_cm: Number(f.maxLength), max_width_cm: Number(f.maxWidth), max_height_cm: Number(f.maxHeight),
        max_cbm: maxCbm, max_weight_kg: Number(f.maxWeight),
      });
      toast.success(`Shelf ${zone}${f.bay}-${f.shelf} added`);
      await onSaved();
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "Save failed — bay/shelf combination may already exist in this zone"); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 font-display text-sm font-semibold">Add shelf to Zone {zone}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5"><Label className="text-xs">Bay</Label><Input value={f.bay} onChange={(e) => set({ bay: e.target.value })} placeholder="e.g. 1" className="h-9" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Shelf</Label><Input value={f.shelf} onChange={(e) => set({ shelf: e.target.value })} placeholder="e.g. 01" className="h-9" /></div>
        <div />
        <div className="space-y-1.5"><Label className="text-xs">Max length (cm)</Label><Input type="number" min={0} value={f.maxLength} onChange={(e) => set({ maxLength: e.target.value })} className="h-9" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Max width (cm)</Label><Input type="number" min={0} value={f.maxWidth} onChange={(e) => set({ maxWidth: e.target.value })} className="h-9" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Max height (cm)</Label><Input type="number" min={0} value={f.maxHeight} onChange={(e) => set({ maxHeight: e.target.value })} className="h-9" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Max weight (kg)</Label><Input type="number" min={0} value={f.maxWeight} onChange={(e) => set({ maxWeight: e.target.value })} className="h-9" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Max volume (auto)</Label><Input readOnly value={maxCbm ? `${maxCbm.toFixed(2)} m³` : ""} placeholder="—" className="h-9 bg-muted/30 text-muted-foreground" /></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy} className="gap-1.5">Save shelf</Button>
      </div>
    </div>
  );
}
