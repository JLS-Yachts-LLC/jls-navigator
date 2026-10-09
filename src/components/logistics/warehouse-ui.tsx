/**
 * Logistics mobile app — form pieces the warehouse screens share: the cascading
 * Zone → Bay → Shelf picker, the dimension inputs with live CBM and charge, and a
 * multi-file attachment picker.
 */
import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Lbl, inputCls } from "./logistics-ui";
import {
  allZones, bayList, shelfList, calcCbm, storageCharge, zoneLabel,
  type Location, type WarehouseShelf,
} from "./logistics-warehouse-data";

/** Selecting a Zone filters the Bays; selecting a Bay filters the Shelves. Only registered shelves can be chosen. */
export function LocationPicker({
  shelves, value, onChange,
}: { shelves: WarehouseShelf[]; value: Location; onChange: (l: Location) => void }) {
  const zones = allZones(shelves);
  const bays = value.zone ? bayList(shelves, value.zone) : [];
  const shelfOpts = value.zone && value.bay ? shelfList(shelves, value.zone, value.bay) : [];
  return (
    <div className="grid grid-cols-3 gap-2">
      <Lbl label="Zone">
        <select className={inputCls} value={value.zone} onChange={(e) => onChange({ zone: e.target.value, bay: "", shelf: "" })}>
          <option value="">—</option>
          {zones.map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}
        </select>
      </Lbl>
      <Lbl label="Bay">
        <select className={inputCls} value={value.bay} disabled={!value.zone} onChange={(e) => onChange({ ...value, bay: e.target.value, shelf: "" })}>
          <option value="">—</option>
          {bays.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Lbl>
      <Lbl label="Shelf">
        <select className={inputCls} value={value.shelf} disabled={!value.bay} onChange={(e) => onChange({ ...value, shelf: e.target.value })}>
          <option value="">—</option>
          {shelfOpts.map((s) => <option key={s.id} value={s.shelf}>{s.shelf}</option>)}
        </select>
      </Lbl>
      {value.zone && bays.length === 0 && <p className="col-span-3 text-[14px] text-muted-foreground">No shelves registered in this zone yet — add them under Manage Warehouse → Zone Management.</p>}
    </div>
  );
}

export type Dims = { length: string; width: string; height: string; weight: string };

/** Length / Width / Height / Weight, with the CBM worked out as you type (and the monthly charge, when asked). */
export function DimsFields({
  value, onChange, showCharge,
}: { value: Dims; onChange: (d: Dims) => void; showCharge?: boolean }) {
  const cbm = calcCbm(Number(value.length) || 0, Number(value.width) || 0, Number(value.height) || 0);
  const set = (k: keyof Dims) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Lbl label="Length (cm)"><input className={inputCls} type="number" inputMode="decimal" min={0} value={value.length} onChange={set("length")} /></Lbl>
        <Lbl label="Width (cm)"><input className={inputCls} type="number" inputMode="decimal" min={0} value={value.width} onChange={set("width")} /></Lbl>
        <Lbl label="Height (cm)"><input className={inputCls} type="number" inputMode="decimal" min={0} value={value.height} onChange={set("height")} /></Lbl>
        <Lbl label="Weight (kg)"><input className={inputCls} type="number" inputMode="decimal" min={0} value={value.weight} onChange={set("weight")} /></Lbl>
      </div>
      <div className={cn("grid gap-3", showCharge ? "grid-cols-2" : "grid-cols-1")}>
        <Lbl label="Total CBM"><input className={cn(inputCls, "bg-muted/30")} readOnly value={cbm ? cbm.toFixed(3) : "0"} /></Lbl>
        {showCharge && <Lbl label="Charge (AED)"><input className={cn(inputCls, "bg-muted/30")} readOnly value={cbm ? storageCharge(cbm).toFixed(0) : "—"} /></Lbl>}
      </div>
    </>
  );
}

/** "Attach Documents" — any number of files from the phone. */
export function FilesField({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <span className="mb-1 block text-[14px] font-medium text-muted-foreground">Attach Documents</span>
      <button type="button" onClick={() => ref.current?.click()} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-[15px] font-semibold">
        <Paperclip className="h-5 w-5" /> Choose Files
      </button>
      <input ref={ref} type="file" multiple className="hidden" onChange={(e) => { onChange([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2 text-[14px]">
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <button type="button" aria-label="Remove" onClick={() => onChange(files.filter((_, j) => j !== i))}><X className="h-4 w-4 text-muted-foreground" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
