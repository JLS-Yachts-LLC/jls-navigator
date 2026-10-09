/**
 * Logistics mobile app — Check-Out · Move Parcel to Storage (spec p.15–16).
 *
 *   As 1 Box        any number of one boat's parcels consolidated under ONE new
 *                   reference, each parcel getting its own nested Item ID
 *   As Individual   one parcel, stored and shelved on its own
 *
 * Both take the dimensions and weight, work out the CBM and the tariff charge,
 * require the JLS quotation number, a Zone → Bay → Shelf and a photo of what is
 * being stored, and finish with Move. The parcels are then flagged as warehoused,
 * so they leave the parcel Check-Out pool and come back out through Warehouse - Out.
 */
import { useEffect, useState } from "react";
import { ScanLine, Search } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/error-message";
import { BarcodeScannerDialog } from "@/components/shipsync/BarcodeScanner";
import { findReleasableByAwb, type ParcelLite } from "./logistics-data";
import { loadShelves, loadClientItems, loadInternalItems, shelfFitProblem, moveParcelsToStorage, calcCbm, type WarehouseShelf, type WarehouseClientItem, type WarehouseInternalItem, type Location } from "./logistics-warehouse-data";
import { ParcelTable, SearchToAdd } from "./parcel-pickers";
import { Screen, Lbl, inputCls, PhotoField } from "./logistics-ui";
import { LocationPicker, DimsFields, type Dims } from "./warehouse-ui";
import { labelsFor } from "./warehouse-labels";

export function MoveToStorage({ mode, onDone }: { mode: "box" | "individual"; onDone: () => void }) {
  const [parcels, setParcels] = useState<ParcelLite[]>([]);
  const [dims, setDims] = useState<Dims>({ length: "", width: "", height: "", weight: "" });
  const [quotation, setQuotation] = useState("");
  const [loc, setLoc] = useState<Location>({ zone: "", bay: "", shelf: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [shelves, setShelves] = useState<WarehouseShelf[]>([]);
  const [scanning, setScanning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stock, setStock] = useState<{ c: WarehouseClientItem[]; i: WarehouseInternalItem[] } | null>(null);

  useEffect(() => {
    void loadShelves().then(setShelves).catch(() => {});
    void Promise.all([loadClientItems(), loadInternalItems()]).then(([c, i]) => setStock({ c, i })).catch(() => {});
  }, []);

  const one = mode === "individual";
  const shelf = loc.zone && loc.bay && loc.shelf ? shelves.find((s) => s.zone === loc.zone && s.bay === loc.bay && s.shelf === loc.shelf) : undefined;
  const fit = stock ? shelfFitProblem(shelf, { l: Number(dims.length) || 0, w: Number(dims.width) || 0, h: Number(dims.height) || 0, kg: Number(dims.weight) || 0 }, stock.c, stock.i) : null;

  function add(incoming: ParcelLite[]) {
    setParcels((cur) => {
      const have = new Set(cur.map((p) => p.id));
      const next = [...cur, ...incoming.filter((p) => !have.has(p.id))];
      if (one && next.length > 1) { toast.info("Individual storage takes one parcel at a time."); return next.slice(0, 1); }
      return next;
    });
  }

  async function onScan(code: string) {
    setScanning(false);
    if (parcels.some((p) => p.barcode?.toLowerCase() === code.trim().toLowerCase())) { toast.info(`${code} is already on the list.`); return; }
    const r = await findReleasableByAwb(code);
    if (r.parcel) add([r.parcel]); else toast.error(r.reason ?? "Not found");
  }

  async function move() {
    if (parcels.length === 0) { toast.error("Add at least one parcel first."); return; }
    if (!(calcCbm(Number(dims.length) || 0, Number(dims.width) || 0, Number(dims.height) || 0) > 0)) { toast.error("Enter the length, width and height."); return; }
    if (!quotation.trim()) { toast.error("Enter the JLS quotation number."); return; }
    if (!loc.zone || !loc.bay || !loc.shelf) { toast.error("Choose the Zone, Bay and Shelf."); return; }
    if (!photo) { toast.error(one ? "Capture a photo of the parcel." : "Capture a photo of the whole box."); return; }
    setBusy(true);
    try {
      const ref = await moveParcelsToStorage(parcels, { mode, ...dims, quotation, loc, photo });
      toast.success(`${parcels.length} parcel${parcels.length === 1 ? "" : "s"} stored — ${ref}`, { duration: 15000, action: { label: "Print label", onClick: () => labelsFor(ref) } });
      onDone();
    } catch (e) {
      toast.error(errorMessage(e, "Could not move to storage"));
      setBusy(false);
    }
  }

  return (
    <Screen title={one ? "Move Parcel to Storage" : "Move Parcel to Storage as 1 Box"} subtitle="Reference issued on Move" onBack={onDone}
      footer={
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onDone} disabled={busy} className="h-12 rounded-lg bg-[#E05252] text-[15px] font-semibold text-white disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => setParcels([])} disabled={busy} className="h-12 rounded-lg bg-[#E0922B] text-[15px] font-semibold text-white disabled:opacity-50">Clear</button>
          <button type="button" onClick={() => void move()} disabled={busy} className="h-12 rounded-lg bg-[#3FA76A] text-[15px] font-semibold text-white disabled:opacity-50">{busy ? "Moving…" : "Move"}</button>
        </div>
      }>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setScanning(true)} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground"><ScanLine className="h-5 w-5" /> SCAN</button>
        <button type="button" onClick={() => setSearching(true)} className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold"><Search className="h-5 w-5" /> SEARCH TO ADD</button>
      </div>
      <ParcelTable parcels={parcels} withBoat onRemove={(id) => setParcels((c) => c.filter((p) => p.id !== id))} />

      <DimsFields value={dims} onChange={setDims} showCharge />
      <Lbl label="Quotation"><input className={inputCls} value={quotation} onChange={(e) => setQuotation(e.target.value)} placeholder="JLS quotation reference" /></Lbl>
      <LocationPicker shelves={shelves} value={loc} onChange={setLoc} />
      {fit && <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[14px] text-amber-500">{fit} You can still save it.</p>}
      <PhotoField file={photo} onChange={setPhoto} label={one ? "Capture or Upload Image" : "Capture or Upload Image of the whole box"} />

      <BarcodeScannerDialog open={scanning} onClose={() => setScanning(false)} title="Scan parcel label" onDetected={(v) => void onScan(v)} />
      {searching && <SearchToAdd onClose={() => setSearching(false)} taken={new Set(parcels.map((p) => p.id))} onAdd={(p) => { add(p); setSearching(false); }} />}
    </Screen>
  );
}
