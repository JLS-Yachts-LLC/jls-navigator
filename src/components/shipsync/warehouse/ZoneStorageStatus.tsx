import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Compass, Calculator, Plus, Trash2, CheckCircle2 } from "lucide-react";
import {
  ZONES, type Zone, SAMPLE_SHELVES, calcCbm, locationCode,
} from "@/components/shipsync/warehouse/warehouse-constants";

type SubTab = "finder" | Zone;
const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "finder", label: "Shelf Finder" },
  ...ZONES.map((z) => ({ key: z as SubTab, label: `Zone ${z}` })),
];

export function ZoneStorageStatus() {
  const [tab, setTab] = useState<SubTab>("finder");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
        UI preview — shelf capacity below is illustrative sample data, not the real warehouse layout.
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card/50 p-1 w-fit">
        {SUB_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
              tab === t.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "finder" ? <ShelfFinderAndCalculator /> : <ZoneDetails zone={tab} />}
    </div>
  );
}

// ── 4.1 Shelf Finder ──────────────────────────────────────────────────────────

function ShelfFinderAndCalculator() {
  const [dims, setDims] = useState({ length: "", width: "", height: "", weight: "" });
  const [searched, setSearched] = useState(false);

  const matches = useMemo(() => {
    if (!searched) return [];
    const l = Number(dims.length) || 0, w = Number(dims.width) || 0, h = Number(dims.height) || 0, wt = Number(dims.weight) || 0;
    const neededCbm = calcCbm(l, w, h);
    return SAMPLE_SHELVES.filter((s) => {
      const availCbm = s.maxCbm - s.usedCbm;
      const availWeight = s.maxWeightKg - s.usedWeightKg;
      return l <= s.maxLengthCm && w <= s.maxWidthCm && h <= s.maxHeightCm && neededCbm <= availCbm && wt <= availWeight;
    }).sort((a, b) => (a.maxCbm - a.usedCbm) - (b.maxCbm - b.usedCbm)); // tightest fit first
  }, [dims, searched]);

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
                  <div key={locationCode(s)} className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[12.5px]">
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /><span className="font-mono font-semibold">{locationCode(s)}</span></div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>Avail. vol: {(s.maxCbm - s.usedCbm).toFixed(2)} m³</span>
                      <span>Avail. weight: {(s.maxWeightKg - s.usedWeightKg).toLocaleString()} kg</span>
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

// ── 4.2 Storage Charge Calculator ──────────────────────────────────────────────

// Placeholder rates — swap for the real pricing schedule when this module is wired up for real.
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

// ── 4.3 Zone Details ───────────────────────────────────────────────────────────

function ZoneDetails({ zone }: { zone: Zone }) {
  const shelves = SAMPLE_SHELVES.filter((s) => s.zone === zone);
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zone {zone} — {shelves.length} shelf{shelves.length === 1 ? "" : "es"}</div>
      {shelves.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">No shelves recorded for this zone.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Shelf</th><th className="px-3 py-2">Max L×W×H (cm)</th>
                <th className="px-3 py-2">Max Volume</th><th className="px-3 py-2">Used Volume</th><th className="px-3 py-2">Available Space</th>
                <th className="px-3 py-2">Max Weight</th><th className="px-3 py-2">Used Weight</th><th className="px-3 py-2">Available Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {shelves.map((s) => (
                <tr key={locationCode(s)} className="hover:bg-accent/10">
                  <td className="px-3 py-2 font-mono font-medium">{locationCode(s)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{s.maxLengthCm}×{s.maxWidthCm}×{s.maxHeightCm}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{s.maxCbm.toFixed(1)} m³</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{s.usedCbm.toFixed(1)} m³</td>
                  <td className="px-3 py-2 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{(s.maxCbm - s.usedCbm).toFixed(1)} m³</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{s.maxWeightKg.toLocaleString()} kg</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{s.usedWeightKg.toLocaleString()} kg</td>
                  <td className="px-3 py-2 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{(s.maxWeightKg - s.usedWeightKg).toLocaleString()} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
