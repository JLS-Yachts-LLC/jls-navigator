/**
 * Logistics mobile app — Manage Warehouse (spec p.26–30).
 *
 *   Shelf Finder     Recommend Storage: dimensions + weight → the shelves that can
 *                    take it. Find Item: free-text search → the item's full sheet,
 *                    every field editable in place.
 *   Zone Management  Zone → Bay → Shelf, with Max / Used / Available for the
 *                    three dimensions, volume and weight; Update changes the
 *                    maximums; + Add Zone / Bay / Shelf grows the facility.
 *   Relocate Storage Enter a reference number, check it's the right item, pick
 *                    the new Zone → Bay → Shelf, Save.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Printer, ScanLine, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import { BarcodeScannerDialog } from "@/components/shipsync/BarcodeScanner";
import { SignedImage } from "@/components/ui/signed-file";
import { Screen, Lbl, inputCls, Sheet } from "./logistics-ui";
import { LocationPicker } from "./warehouse-ui";
import { labelsFor } from "./warehouse-labels";
import {
  loadShelves, loadClientItems, loadInternalItems, loadStoredItems, findItems, refForAwb, patchStored, shelfCrud,
  recommendShelves, shelfUsage, shelfUsedDims, bayList, shelfList, allZones, zoneLabel, calcCbm, locationCode,
  type StoredItem, type WarehouseShelf, type WarehouseClientItem, type WarehouseInternalItem, type Location,
} from "./logistics-warehouse-data";

type Page = "menu" | "finder" | "zones" | "relocate";

export function ManageWarehouse({ onBack }: { onBack: () => void }) {
  const [page, setPage] = useState<Page>("menu");
  const back = () => setPage("menu");
  if (page === "finder") return <ShelfFinder onBack={back} />;
  if (page === "zones") return <ZoneManagement onBack={back} />;
  if (page === "relocate") return <Relocate onBack={back} />;
  return (
    <Screen title="Manage Warehouse" onBack={onBack}>
      {([["finder", "Shelf Finder"], ["zones", "Zone Management"], ["relocate", "Relocate Storage"]] as const).map(([k, l]) => (
        <button key={k} type="button" onClick={() => setPage(k)} className="flex h-16 w-full items-center rounded-xl border border-border bg-card px-4 text-left text-[17px] font-semibold hover:border-primary">{l}</button>
      ))}
    </Screen>
  );
}

/** Shelves plus what is on them — loaded together because every screen here needs both. */
function useWarehouse() {
  const [state, setState] = useState<{ shelves: WarehouseShelf[]; clients: WarehouseClientItem[]; internals: WarehouseInternalItem[] } | null>(null);
  const reload = useCallback(async () => {
    const [shelves, clients, internals] = await Promise.all([loadShelves(), loadClientItems(), loadInternalItems()]);
    setState({ shelves, clients, internals });
  }, []);
  useEffect(() => { void reload().catch((e) => { toast.error(errorMessage(e, "Could not load the warehouse")); }); }, [reload]);
  return { ...state, ready: state !== null, reload };
}

const Spinner = () => <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-muted-foreground" />;

// ── Shelf Finder ─────────────────────────────────────────────────────────────

function ShelfFinder({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"recommend" | "find">("recommend");
  return (
    <Screen title="Shelf Finder" onBack={onBack}>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card/50 p-1">
        {([["recommend", "Recommend Storage"], ["find", "Find Item"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn("h-10 rounded-md text-[14px] font-semibold", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      {tab === "recommend" ? <Recommend /> : <FindItem />}
    </Screen>
  );
}

function Recommend() {
  const wh = useWarehouse();
  const [d, setD] = useState({ l: "", w: "", h: "", kg: "" });
  const [searched, setSearched] = useState(false);
  const n = (v: string) => Number(v) || 0;
  const hits = useMemo(() => (wh.ready && searched
    ? recommendShelves(wh.shelves!, wh.clients!, wh.internals!, { l: n(d.l), w: n(d.w), h: n(d.h), kg: n(d.kg) }) : []), [wh.ready, searched, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => { setD({ ...d, [k]: e.target.value }); setSearched(false); };

  return (
    <>
      <p className="text-[14px] text-muted-foreground">Enter a package's dimensions and weight to find a suitable, available shelf.</p>
      <div className="grid grid-cols-2 gap-3">
        {([["l", "Length (cm)"], ["w", "Width (cm)"], ["h", "Height (cm)"], ["kg", "Weight (kg)"]] as const).map(([k, label]) => (
          <Lbl key={k} label={label}><input className={inputCls} type="number" inputMode="decimal" min={0} value={d[k]} onChange={set(k)} /></Lbl>
        ))}
      </div>
      <button type="button" disabled={!wh.ready || !d.l || !d.w || !d.h || !d.kg} onClick={() => setSearched(true)} className="h-12 w-full rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">Find a Shelf</button>
      {searched && (hits.length === 0 ? <p className="text-[15px] text-muted-foreground">No suitable shelf found for these dimensions and weight.</p> : (
        <ul className="space-y-2">
          {hits.map(({ s, usedCbm, usedWeightKg }) => (
            <li key={s.id} className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-3 text-[14px]">
              <div className="font-mono text-[16px] font-semibold">{locationCode(s)}</div>
              <div className="text-muted-foreground">Available {(s.max_cbm - usedCbm).toFixed(2)} m³ · {s.max_weight_kg == null ? "no weight limit" : `${(s.max_weight_kg - usedWeightKg).toLocaleString()} kg`}</div>
            </li>
          ))}
        </ul>
      ))}
    </>
  );
}

const STATUS_EDITABLE = ["Stored", "Returned", "Disposed", "Completed"];

function FindItem() {
  const [items, setItems] = useState<StoredItem[] | null>(null);
  const [q, setQ] = useState("");
  const [extra, setExtra] = useState<string | null>(null);
  const [picked, setPicked] = useState<StoredItem | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => { setItems(await loadStoredItems()); }, []);
  useEffect(() => { void load().catch((e) => toast.error(errorMessage(e, "Could not load items"))); }, [load]);
  // A tracking number of a parcel moved into storage leads to the record it's in.
  useEffect(() => { setExtra(null); const t = q.trim(); if (t.length < 4) return; const id = setTimeout(() => { void refForAwb(t).then(setExtra); }, 350); return () => clearTimeout(id); }, [q]);

  if (items === null) return <Spinner />;
  const hits = findItems(items, q).concat(extra ? items.filter((i) => i.ref_no === extra) : []).filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
  const current = picked ? items.find((i) => i.id === picked.id) ?? picked : null;

  return (
    <>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(inputCls, "pl-10")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="AWB, Ref ID, Item ID, Client, Department, Description" />
        </div>
        <button type="button" aria-label="Scan" onClick={() => setScanning(true)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ScanLine className="h-5 w-5" /></button>
      </div>
      {q.trim() && hits.length === 0 && <p className="text-[15px] text-muted-foreground">Nothing matches "{q.trim()}".</p>}
      <ul className="space-y-2">
        {hits.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => setPicked(i)} className="w-full rounded-lg border border-border bg-card px-3 py-3 text-left">
              <div className="flex justify-between gap-2"><span className="font-mono text-[14px] font-semibold text-primary">{i.ref_no}</span><span className="text-[13px] text-muted-foreground">{i.status}</span></div>
              <div className="truncate text-[15px] font-medium">{i.owner}</div>
              <div className="truncate text-[13px] text-muted-foreground">{i.description}</div>
            </button>
          </li>
        ))}
      </ul>
      {current && <ItemSheet item={current} onClose={() => setPicked(null)} onChanged={load} />}
      <BarcodeScannerDialog open={scanning} onClose={() => setScanning(false)} title="Scan item label" onDetected={(v) => { setQ(v); setScanning(false); }} />
    </>
  );
}

type EditKey = "description" | "weight" | "dims" | "due" | "status";

function ItemSheet({ item, onClose, onChanged }: { item: StoredItem; onClose: () => void; onChanged: () => Promise<void> }) {
  const [edit, setEdit] = useState<EditKey | null>(null);
  const [v, setV] = useState({ text: "", l: "", w: "", h: "" });
  const [busy, setBusy] = useState(false);
  const loc = item.zone ? `${item.zone}-${item.bay ?? ""}-${item.shelf ?? ""}` : "Not shelved";

  function start(k: EditKey) {
    setEdit(k);
    setV({
      text: k === "description" ? item.description : k === "weight" ? String(item.weight_kg ?? "") : k === "due" ? item.due ?? "" : item.status,
      l: String(item.length_cm ?? ""), w: String(item.width_cm ?? ""), h: String(item.height_cm ?? ""),
    });
  }
  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit === "description") { if (!v.text.trim()) throw new Error("A description is needed."); await patchStored(item, { description: v.text.trim() }); }
      if (edit === "weight") await patchStored(item, { weight_kg: v.text ? Number(v.text) : null });
      if (edit === "due") await patchStored(item, { due: v.text || null });
      if (edit === "status") await patchStored(item, { status: v.text });
      if (edit === "dims") await patchStored(item, { length_cm: Number(v.l) || null, width_cm: Number(v.w) || null, height_cm: Number(v.h) || null });
      await onChanged();
      toast.success("Updated");
      setEdit(null);
    } catch (e) { toast.error(errorMessage(e, "Could not save")); } finally { setBusy(false); }
  }

  const Row = ({ label, value, k }: { label: string; value: string; k: EditKey }) => (
    <div className="flex items-start gap-2 py-1.5 text-[15px]">
      <div className="min-w-0 flex-1"><span className="text-muted-foreground">{label}: </span><span className="font-medium">{value}</span></div>
      <button type="button" aria-label={`Edit ${label}`} onClick={() => start(k)} className="rounded p-1.5 text-muted-foreground hover:bg-accent"><Pencil className="h-4 w-4" /></button>
    </div>
  );
  const dims = [item.length_cm, item.width_cm, item.height_cm].every((x) => x == null) ? "—" : `${item.length_cm ?? "?"} × ${item.width_cm ?? "?"} × ${item.height_cm ?? "?"} cm`;

  return (
    <Sheet title={item.ref_no} onClose={onClose}>
      {item.image_url && <SignedImage stored={item.image_url} alt={item.description} className="max-h-48 w-full rounded-lg object-contain" />}
      <div className="divide-y divide-border/50">
        <div className="py-1.5 text-[15px]"><span className="text-muted-foreground">{item.kind === "client" ? "Client" : "Department"}: </span><span className="font-medium">{item.owner}</span></div>
        <Row label="Description" value={item.description} k="description" />
        <Row label="Dimensions" value={dims} k="dims" />
        <Row label="Weight" value={item.weight_kg != null ? `${item.weight_kg} kg` : "—"} k="weight" />
        <div className="py-1.5 text-[15px]"><span className="text-muted-foreground">Current Location: </span><span className="font-medium">{loc}</span></div>
        <Row label="Status" value={item.status} k="status" />
        <div className="py-1.5 text-[15px]"><span className="text-muted-foreground">Date Stored: </span><span className="font-medium">{item.date_stored ?? "—"}</span></div>
        <Row label={item.dueLabel} value={item.due ?? "—"} k="due" />
      </div>

      {edit && (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          {edit === "description" && <textarea className={`${inputCls} h-24 py-2`} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} />}
          {edit === "weight" && <input className={inputCls} type="number" inputMode="decimal" value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} placeholder="kg" />}
          {edit === "due" && <input className={inputCls} type="date" value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} />}
          {edit === "status" && (
            <select className={inputCls} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })}>
              {(STATUS_EDITABLE.includes(item.status) ? STATUS_EDITABLE : [item.status, ...STATUS_EDITABLE]).map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
          {edit === "dims" && (
            <div className="grid grid-cols-3 gap-2">
              {(["l", "w", "h"] as const).map((k) => <input key={k} className={inputCls} type="number" inputMode="decimal" placeholder={k.toUpperCase()} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setEdit(null)} className="h-11 rounded-lg border border-border font-semibold">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={busy} className="h-11 rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => labelsFor(item.ref_no)} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border font-semibold">
        <Printer className="h-4 w-4" /> Print label{item.inside.length ? "s" : ""}
      </button>
      <p className="text-[12px] text-muted-foreground">Check-out status is set by Warehouse - Out. To move this item, use Relocate Storage.</p>
    </Sheet>
  );
}

// ── Zone Management ──────────────────────────────────────────────────────────

function ZoneManagement({ onBack }: { onBack: () => void }) {
  const wh = useWarehouse();
  const [loc, setLoc] = useState<Location>({ zone: "", bay: "", shelf: "" });
  const [updating, setUpdating] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!wh.ready) return <Screen title="Zone Management" onBack={onBack}><Spinner /></Screen>;
  const shelf = loc.zone && loc.bay && loc.shelf ? wh.shelves!.find((s) => s.zone === loc.zone && s.bay === loc.bay && s.shelf === loc.shelf) ?? null : null;
  const use = shelf ? shelfUsage(shelf.zone, shelf.bay, shelf.shelf, wh.clients!, wh.internals!) : null;
  const usedDims = shelf ? shelfUsedDims(shelf.zone, shelf.bay, shelf.shelf, wh.clients!, wh.internals!) : null;

  return (
    <Screen title="Zone Management" onBack={onBack}>
      <LocationPicker shelves={wh.shelves!} value={loc} onChange={setLoc} />
      <div className="grid grid-cols-3 gap-2">
        {(["Zone", "Bay", "Shelf"] as const).map((l) => (
          <button key={l} type="button" onClick={() => setAdding(true)} className="flex h-10 items-center justify-center gap-1 rounded-lg border border-border text-[13px] font-semibold"><Plus className="h-4 w-4" /> Add {l}</button>
        ))}
      </div>

      {shelf && use && usedDims ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-3">
          <Metric title="Length" max={`${shelf.max_length_cm} cm`} used={`${usedDims.l} cm`} avail={`${shelf.max_length_cm - usedDims.l} cm`} />
          <Metric title="Width" max={`${shelf.max_width_cm} cm`} used={`${usedDims.w} cm`} avail={`${shelf.max_width_cm - usedDims.w} cm`} />
          <Metric title="Height" max={`${shelf.max_height_cm} cm`} used={`${usedDims.h} cm`} avail={`${shelf.max_height_cm - usedDims.h} cm`} />
          <Metric title="Volume" max={`${shelf.max_cbm.toFixed(2)} cbm`} used={`${use.usedCbm.toFixed(2)} cbm`} avail={`${(shelf.max_cbm - use.usedCbm).toFixed(2)} cbm`} />
          <Metric title="Weight" max={shelf.max_weight_kg == null ? "No limit" : `${shelf.max_weight_kg} kg`} used={`${use.usedWeightKg} kg`} avail={shelf.max_weight_kg == null ? "No limit" : `${shelf.max_weight_kg - use.usedWeightKg} kg`} />
          <p className="text-[12px] text-muted-foreground">Used length/width/height is the largest item on the shelf in each direction; volume and weight are totals.</p>
          <button type="button" onClick={() => setUpdating(true)} className="h-12 w-full rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground">Update</button>
        </div>
      ) : <p className="text-[14px] text-muted-foreground">Select a zone, bay and shelf to see its space.</p>}

      {updating && shelf && <UpdateShelf shelf={shelf} onClose={() => setUpdating(false)} onSaved={async () => { setUpdating(false); await wh.reload(); }} />}
      {adding && <AddShelf shelves={wh.shelves!} initial={loc} onClose={() => setAdding(false)} onSaved={async (l) => { setAdding(false); await wh.reload(); setLoc(l); }} />}
    </Screen>
  );
}

function Metric({ title, max, used, avail }: { title: string; max: string; used: string; avail: string }) {
  return (
    <div>
      <div className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="grid grid-cols-3 gap-2 text-center text-[14px]">
        <div className="rounded-md bg-muted/30 p-2"><div className="text-[12px] text-muted-foreground">Max</div><div className="font-semibold">{max}</div></div>
        <div className="rounded-md bg-muted/30 p-2"><div className="text-[12px] text-muted-foreground">Used</div><div className="font-semibold">{used}</div></div>
        <div className="rounded-md bg-emerald-500/10 p-2"><div className="text-[12px] text-muted-foreground">Available</div><div className="font-semibold text-emerald-500">{avail}</div></div>
      </div>
    </div>
  );
}

function UpdateShelf({ shelf, onClose, onSaved }: { shelf: WarehouseShelf; onClose: () => void; onSaved: () => Promise<void> }) {
  const [v, setV] = useState({ l: String(shelf.max_length_cm), w: String(shelf.max_width_cm), h: String(shelf.max_height_cm), kg: shelf.max_weight_kg == null ? "" : String(shelf.max_weight_kg) });
  const [busy, setBusy] = useState(false);
  async function save() {
    const l = Number(v.l), w = Number(v.w), h = Number(v.h);
    if (!l || !w || !h) { toast.error("Length, width and height are needed."); return; }
    setBusy(true);
    try { await shelfCrud.patch(shelf.id, { max_length_cm: l, max_width_cm: w, max_height_cm: h, max_cbm: calcCbm(l, w, h), max_weight_kg: v.kg ? Number(v.kg) : null }); toast.success("Shelf updated"); await onSaved(); }
    catch (e) { toast.error(errorMessage(e, "Could not save")); setBusy(false); }
  }
  return (
    <Sheet title={`Update ${locationCode(shelf)}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {([["l", "Max length (cm)"], ["w", "Max width (cm)"], ["h", "Max height (cm)"], ["kg", "Max weight (kg)"]] as const).map(([k, label]) => (
          <Lbl key={k} label={label}><input className={inputCls} type="number" inputMode="decimal" value={v[k]} placeholder={k === "kg" ? "No limit" : ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Lbl>
        ))}
      </div>
      <button type="button" onClick={() => void save()} disabled={busy} className="h-12 w-full rounded-lg bg-[#3FA76A] text-[16px] font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
    </Sheet>
  );
}

/** + Add Zone / Bay / Shelf — a shelf is the unit; a new zone or bay is just its first shelf. */
function AddShelf({ shelves, initial, onClose, onSaved }: { shelves: WarehouseShelf[]; initial: Location; onClose: () => void; onSaved: (l: Location) => Promise<void> }) {
  const [zone, setZone] = useState(initial.zone);
  const [bay, setBay] = useState(initial.bay);
  const [shelf, setShelf] = useState("");
  const [v, setV] = useState({ l: "", w: "", h: "", kg: "" });
  const [busy, setBusy] = useState(false);
  const zones = allZones(shelves);

  async function save() {
    const z = zone.trim().toUpperCase(), b = bay.trim().toUpperCase(), s = shelf.trim().toUpperCase();
    const l = Number(v.l), w = Number(v.w), h = Number(v.h);
    if (!z || !b || !s) { toast.error("Zone, bay and shelf are all needed."); return; }
    if (!l || !w || !h) { toast.error("Enter the shelf's maximum length, width and height."); return; }
    if (shelves.some((x) => x.zone === z && x.bay === b && x.shelf === s)) { toast.error(`${z}-${b}-${s} already exists.`); return; }
    setBusy(true);
    try {
      await shelfCrud.create({ zone: z, bay: b, shelf: s, max_length_cm: l, max_width_cm: w, max_height_cm: h, max_cbm: calcCbm(l, w, h), max_weight_kg: v.kg ? Number(v.kg) : null });
      toast.success(`${z}-${b}-${s} added`);
      await onSaved({ zone: z, bay: b, shelf: s });
    } catch (e) { toast.error(errorMessage(e, "Could not add the shelf")); setBusy(false); }
  }
  return (
    <Sheet title="Add Zone / Bay / Shelf" onClose={onClose}>
      <p className="text-[13px] text-muted-foreground">A new zone or bay is created with its first shelf. Pick an existing zone, or type a new code.</p>
      <div className="grid grid-cols-3 gap-2">
        <Lbl label="Zone"><input className={inputCls} list="lg-zones" value={zone} onChange={(e) => setZone(e.target.value)} /><datalist id="lg-zones">{zones.map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}</datalist></Lbl>
        <Lbl label="Bay"><input className={inputCls} list="lg-bays" value={bay} onChange={(e) => setBay(e.target.value)} /><datalist id="lg-bays">{(zone ? bayList(shelves, zone.toUpperCase()) : []).map((b2) => <option key={b2} value={b2} />)}</datalist></Lbl>
        <Lbl label="Shelf"><input className={inputCls} value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder={bay && zone ? `e.g. ${shelfList(shelves, zone.toUpperCase(), bay.toUpperCase()).length + 1}` : ""} /></Lbl>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {([["l", "Max length (cm)"], ["w", "Max width (cm)"], ["h", "Max height (cm)"], ["kg", "Max weight (kg)"]] as const).map(([k, label]) => (
          <Lbl key={k} label={label}><input className={inputCls} type="number" inputMode="decimal" value={v[k]} placeholder={k === "kg" ? "No limit" : ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Lbl>
        ))}
      </div>
      <button type="button" onClick={() => void save()} disabled={busy} className="h-12 w-full rounded-lg bg-[#3FA76A] text-[16px] font-semibold text-white disabled:opacity-50">{busy ? "Adding…" : "Add"}</button>
    </Sheet>
  );
}

// ── Relocate Storage ─────────────────────────────────────────────────────────

function Relocate({ onBack }: { onBack: () => void }) {
  const wh = useWarehouse();
  const [items, setItems] = useState<StoredItem[] | null>(null);
  const [ref, setRef] = useState("");
  const [item, setItem] = useState<StoredItem | null>(null);
  const [loc, setLoc] = useState<Location>({ zone: "", bay: "", shelf: "" });
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void loadStoredItems().then(setItems); }, []);

  function find(text: string) {
    const t = text.trim().toLowerCase();
    const hit = (items ?? []).find((i) => i.ref_no.toLowerCase() === t) ?? null;
    setItem(hit);
    if (hit) setLoc({ zone: "", bay: "", shelf: "" }); else if (t) toast.error(`No item with reference ${text.trim()}.`);
  }

  const target = loc.zone && loc.bay && loc.shelf ? wh.shelves?.find((s) => s.zone === loc.zone && s.bay === loc.bay && s.shelf === loc.shelf) ?? null : null;
  const warning = (() => {
    if (!item || !target || !wh.ready) return null;
    const u = shelfUsage(target.zone, target.bay, target.shelf, wh.clients!, wh.internals!);
    const cbm = calcCbm(item.length_cm ?? 0, item.width_cm ?? 0, item.height_cm ?? 0);
    if ((item.length_cm ?? 0) > target.max_length_cm || (item.width_cm ?? 0) > target.max_width_cm || (item.height_cm ?? 0) > target.max_height_cm) return "This item is bigger than the shelf allows.";
    if (cbm > target.max_cbm - u.usedCbm) return `Only ${(target.max_cbm - u.usedCbm).toFixed(2)} m³ is free on that shelf.`;
    if (target.max_weight_kg != null && (item.weight_kg ?? 0) > target.max_weight_kg - u.usedWeightKg) return "That shelf can't take the weight.";
    return null;
  })();

  async function save() {
    if (!item || !target) { toast.error("Choose the shelf to move it to."); return; }
    setBusy(true);
    try {
      await patchStored(item, { zone: loc.zone, bay: loc.bay, shelf: loc.shelf });
      toast.success(`${item.ref_no} moved to ${loc.zone}-${loc.bay}-${loc.shelf}`);
      setItems(await loadStoredItems()); setItem(null); setRef(""); setLoc({ zone: "", bay: "", shelf: "" }); await wh.reload();
    } catch (e) { toast.error(errorMessage(e, "Could not move it")); } finally { setBusy(false); }
  }

  return (
    <Screen title="Relocate Storage" onBack={onBack}
      footer={item ? <button type="button" onClick={() => void save()} disabled={busy || !target} className="h-12 w-full rounded-lg bg-[#3FA76A] text-[16px] font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button> : undefined}>
      {items === null || !wh.ready ? <Spinner /> : (
        <>
          <Lbl label="Enter Reference Number">
            <div className="flex gap-2">
              <input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") find(ref); }} placeholder="e.g. JLSWH26-00005" autoCapitalize="characters" />
              <button type="button" onClick={() => find(ref)} className="h-12 shrink-0 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">Find</button>
              <button type="button" aria-label="Scan" onClick={() => setScanning(true)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border"><ScanLine className="h-5 w-5" /></button>
            </div>
          </Lbl>
          {item && (
            <>
              <div className="rounded-xl border border-border bg-card p-3 text-[15px]">
                {item.image_url && <SignedImage stored={item.image_url} alt="" className="mb-2 max-h-44 w-full rounded-lg object-contain" />}
                <div className="font-mono font-semibold text-primary">{item.ref_no}</div>
                <div><span className="text-muted-foreground">{item.kind === "client" ? "Client" : "Department"}: </span>{item.owner}</div>
                <div><span className="text-muted-foreground">Description: </span>{item.description}</div>
                <div><span className="text-muted-foreground">Location: </span>{item.zone ? `${item.zone}-${item.bay}-${item.shelf}` : "Not shelved"} · <span className="text-muted-foreground">Status: </span>{item.status}</div>
              </div>
              <div className="text-[14px] font-medium text-muted-foreground">Select Location to move:</div>
              <LocationPicker shelves={wh.shelves!} value={loc} onChange={setLoc} />
              {warning && <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[14px] text-amber-500">{warning} You can still save it.</p>}
            </>
          )}
        </>
      )}
      <BarcodeScannerDialog open={scanning} onClose={() => setScanning(false)} title="Scan item label" onDetected={(v) => { setRef(v); setScanning(false); find(v); }} />
    </Screen>
  );
}
