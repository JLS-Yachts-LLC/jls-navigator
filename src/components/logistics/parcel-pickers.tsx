/**
 * Logistics mobile app — the parcel list table and the "Search to add" picker,
 * shared by Check-Out (release) and Move to Storage.
 */
import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/error-message";
import { loadBoatsWithParcels, loadReleasableForBoat, type ParcelLite } from "./logistics-data";
import { inputCls, Sheet } from "./logistics-ui";

export function ParcelTable({ parcels, withBoat, onRemove }: { parcels: ParcelLite[]; withBoat?: boolean; onRemove?: (id: string) => void }) {
  const total = parcels.reduce((n, p) => n + (p.num_packages ?? 1), 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-[14px]">
        <thead className="bg-muted/30 text-left text-muted-foreground">
          <tr>{withBoat && <th className="px-2 py-2">Client/Boat</th>}<th className="px-2 py-2">AWB</th><th className="px-2 py-2">Consignee</th><th className="px-2 py-2">Courier</th><th className="px-2 py-2">Qty</th>{onRemove && <th />}</tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {parcels.length === 0 && <tr><td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">Scan or search to add parcels.</td></tr>}
          {parcels.map((p) => (
            <tr key={p.id}>
              {withBoat && <td className="px-2 py-2">{p.boat_name ?? "—"}</td>}
              <td className="px-2 py-2 font-mono">{p.barcode ?? "—"}</td>
              <td className="px-2 py-2">{p.package_owner ?? "—"}</td>
              <td className="px-2 py-2">{p.courier ?? "—"}</td>
              <td className="px-2 py-2 tabular-nums">{p.num_packages ?? 1}</td>
              {onRemove && <td className="px-1"><button type="button" aria-label="Remove" onClick={() => onRemove(p.id)} className="rounded p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>}
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="bg-muted/20 font-semibold"><td className="px-2 py-2" colSpan={withBoat ? 4 : 3}>TOTAL</td><td className="px-2 py-2 tabular-nums">{total}</td>{onRemove && <td />}</tr></tfoot>
      </table>
    </div>
  );
}

/** The manual fallback: pick a boat, tick what to send, Add Selected Items. */
export function SearchToAdd({ onClose, onAdd, taken }: { onClose: () => void; onAdd: (p: ParcelLite[]) => void; taken: Set<string> }) {
  const [boats, setBoats] = useState<string[] | null>(null);
  const [boat, setBoat] = useState("");
  const [items, setItems] = useState<ParcelLite[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  useEffect(() => { void loadBoatsWithParcels().then(setBoats).catch((e) => { toast.error(errorMessage(e, "Could not load the boats")); setBoats([]); }); }, []);
  useEffect(() => { if (!boat) return; setItems(null); setTicked(new Set()); let on = true; void loadReleasableForBoat(boat).then((r) => { if (on) setItems(r.filter((p) => !taken.has(p.id))); }).catch((e) => { if (on) { toast.error(errorMessage(e, "Could not load that boat's parcels")); setItems([]); } }); return () => { on = false; }; }, [boat]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setTicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); // eslint-disable-line @typescript-eslint/no-unused-expressions
  const allOn = !!items?.length && items.every((p) => ticked.has(p.id));

  return (
    <Sheet title="Select Client/Boat Name" onClose={onClose}>
      {boats === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (
        <select className={inputCls} value={boat} onChange={(e) => setBoat(e.target.value)}>
          <option value="">{boats.length ? "Select boat…" : "Nothing is waiting to go out"}</option>
          {boats.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )}
      {boat && (items === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : items.length === 0 ? <p className="text-[14px] text-muted-foreground">Nothing left for {boat}.</p> : (
        <>
          <label className="flex items-center gap-3 text-[15px] font-medium">
            <input type="checkbox" className="h-5 w-5" checked={allOn} onChange={() => setTicked(allOn ? new Set() : new Set(items.map((p) => p.id)))} /> Check All items
          </label>
          <ul className="divide-y divide-border/50 rounded-lg border border-border">
            {items.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-3 px-3 py-3 text-[15px]">
                  <input type="checkbox" className="h-5 w-5" checked={ticked.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-mono text-[14px]">{p.barcode ?? "—"}</span>
                    <span className="block truncate text-[14px] text-muted-foreground">{[p.package_owner, p.courier].filter(Boolean).join(" · ") || "—"} · Qty {p.num_packages ?? 1}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </>
      ))}
      <button type="button" disabled={ticked.size === 0} onClick={() => onAdd((items ?? []).filter((p) => ticked.has(p.id)))}
        className="h-12 w-full rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">
        Add Selected Items{ticked.size ? ` (${ticked.size})` : ""}
      </button>
    </Sheet>
  );
}

