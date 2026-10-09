/**
 * Logistics mobile app — Warehouse · Store In (spec p.17–19).
 *
 * New cargo arriving for long-term storage. Entry Type decides the form:
 *
 *   Client    client, description, dimensions (CBM worked out), dates, Zone/Bay/Shelf,
 *             charges, documents, photo, and an optional packing list
 *   Internal  a Department instead of a client, then Documents (a Destruction Date,
 *             no charges or due date) or Assets (neither date, no charges)
 *
 * The reference number (JLSWH26-00001…) is issued on save, so a cancelled entry
 * never uses one up. Saving leaves the form blank for the next item.
 */
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { loadYachtNames } from "@/lib/shipsync/data";
import { INTERNAL_DEPARTMENTS, FREEFORM_DEPARTMENTS } from "@/components/shipsync/warehouse/warehouse-constants";
import { Screen, Lbl, inputCls, SuggestInput, PhotoField, FooterButtons } from "./logistics-ui";
import { LocationPicker, DimsFields, FilesField, type Dims } from "./warehouse-ui";
import { labelsFor } from "./warehouse-labels";
import {
  loadShelves, loadClientItems, loadInternalItems, shelfFitProblem, storeClient, storeInternal, storageCharge, calcCbm, localToday,
  type WarehouseClientItem, type WarehouseInternalItem,
  type WarehouseShelf, type Location, type PackingLine,
} from "./logistics-warehouse-data";

const sb = supabase as any;
const UNITS = ["pcs", "box", "set", "pack", "roll", "kg", "m", "ltr"];
const today = localToday;
const blankLine = (): PackingLine => ({ itemName: "", quantity: "1", unit: "pcs", remarks: "", photo: null });
const NO_LOC: Location = { zone: "", bay: "", shelf: "" };
const NO_DIMS: Dims = { length: "", width: "", height: "", weight: "" };

type Entry = "client" | "internal";
type Kind = "documents" | "assets";

export function StoreIn({ onBack }: { onBack: () => void }) {
  const [entry, setEntry] = useState<Entry>("client");
  const [kind, setKind] = useState<Kind>("documents");
  const [shelves, setShelves] = useState<WarehouseShelf[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [stock, setStock] = useState<{ c: WarehouseClientItem[]; i: WarehouseInternalItem[] } | null>(null);

  const [owner, setOwner] = useState("");        // client name, or department
  const [deptDetail, setDeptDetail] = useState("");
  const [description, setDescription] = useState("");
  const [quotation, setQuotation] = useState("");
  const [dims, setDims] = useState<Dims>(NO_DIMS);
  const [dateStored, setDateStored] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [charges, setCharges] = useState("");
  const [loc, setLoc] = useState<Location>(NO_LOC);
  const [photo, setPhoto] = useState<File | null>(null);
  const [docs, setDocs] = useState<File[]>([]);
  const [packing, setPacking] = useState<PackingLine[]>([]);

  useEffect(() => {
    void loadShelves().then(setShelves).catch(() => {});
    void Promise.all([loadClientItems(), loadInternalItems()]).then(([c, i]) => setStock({ c, i })).catch(() => {});
    void (async () => {
      const [yachts, { data }] = await Promise.all([loadYachtNames().catch(() => []), sb.from("warehouse_client_items").select("client_name").limit(2000)]);
      setClients(Array.from(new Set<string>([...yachts, ...(data ?? []).map((r: any) => r.client_name as string)].filter(Boolean))).sort());
    })();
  }, []);

  const cbm = calcCbm(Number(dims.length) || 0, Number(dims.width) || 0, Number(dims.height) || 0);
  const freeform = (FREEFORM_DEPARTMENTS as readonly string[]).includes(owner);
  const shelf = loc.zone && loc.bay && loc.shelf ? shelves.find((s) => s.zone === loc.zone && s.bay === loc.bay && s.shelf === loc.shelf) : undefined;
  const fit = stock ? shelfFitProblem(shelf, { l: Number(dims.length) || 0, w: Number(dims.width) || 0, h: Number(dims.height) || 0, kg: Number(dims.weight) || 0 }, stock.c, stock.i) : null;

  /** Something has been entered that Cancel / Back would throw away. */
  const dirty = !!(owner || description || quotation || dims.length || dims.width || dims.height || dims.weight || photo || docs.length || packing.length || loc.zone);
  const leave = () => { if (!dirty || window.confirm("Leave without saving? What you've entered will be discarded.")) onBack(); };

  function reset() {
    setOwner(""); setDeptDetail(""); setDescription(""); setQuotation(""); setDims(NO_DIMS); setDateStored(today());
    setDueDate(""); setCharges(""); setLoc(NO_LOC); setPhoto(null); setDocs([]); setPacking([]);
  }

  async function save() {
    if (!owner.trim()) { toast.error(entry === "client" ? "Enter the client." : "Choose the department."); return; }
    if (!description.trim()) { toast.error("Enter an item description."); return; }
    setSaving(true);
    try {
      const common = { description, length: dims.length, width: dims.width, height: dims.height, weight: dims.weight, dateStored, loc, photo, docs, packing };
      const ref = entry === "client"
        ? await storeClient({ ...common, client: owner, quotation, dueDate, charges })
        : await storeInternal({
            ...common, kind, destructionDate: dueDate,
            department: freeform && deptDetail.trim() ? `${owner} — ${deptDetail.trim()}` : owner,
          });
      toast.success(`Stored — ${ref}`, { duration: 15000, action: { label: "Print label", onClick: () => labelsFor(ref) } });
      reset();
    } catch (e) {
      toast.error(errorMessage(e, "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  const setLine = (i: number, p: Partial<PackingLine>) => setPacking((cur) => cur.map((l, j) => (j === i ? { ...l, ...p } : l)));

  return (
    <Screen title="Warehouse - Store In" subtitle="Reference issued on save" onBack={leave}
      footer={<FooterButtons onCancel={leave} onSave={() => void save()} saving={saving} />}>
      <Lbl label="Entry Type">
        <div className="grid grid-cols-2 gap-2">
          {(["client", "internal"] as const).map((t) => (
            <button key={t} type="button" onClick={() => { setEntry(t); setOwner(""); setDeptDetail(""); }}
              className={`h-12 rounded-lg border text-[16px] font-semibold ${entry === t ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>
              {t === "client" ? "Client" : "Internal"}
            </button>
          ))}
        </div>
      </Lbl>

      {entry === "internal" && (
        <Lbl label="Item Type">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="documents">Documents</option><option value="assets">Assets</option>
          </select>
        </Lbl>
      )}

      {entry === "client" ? (
        <Lbl label="Client"><SuggestInput value={owner} onChange={setOwner} options={clients} placeholder="Start typing — known clients are offered" /></Lbl>
      ) : (
        <>
          <Lbl label="Department">
            <select className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Select department…</option>
              {INTERNAL_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Lbl>
          {freeform && <Lbl label={owner === "Manager" ? "Manager's name" : "Specify"}><input className={inputCls} value={deptDetail} onChange={(e) => setDeptDetail(e.target.value)} /></Lbl>}
        </>
      )}

      <Lbl label="Item Description"><textarea className={`${inputCls} h-20 py-2`} value={description} onChange={(e) => setDescription(e.target.value)} /></Lbl>
      {entry === "client" && <Lbl label="Quotation Number (optional)"><input className={inputCls} autoCapitalize="characters" autoCorrect="off" spellCheck={false} value={quotation} onChange={(e) => setQuotation(e.target.value)} /></Lbl>}

      <DimsFields value={dims} onChange={setDims} />

      <div className="grid grid-cols-2 gap-3">
        <Lbl label="Date Stored"><input type="date" className={inputCls} value={dateStored} onChange={(e) => setDateStored(e.target.value)} /></Lbl>
        {(entry === "client" || kind === "documents") && (
          <Lbl label={entry === "client" ? "Due Date" : "Destruction Date"}><input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Lbl>
        )}
      </div>

      <LocationPicker shelves={shelves} value={loc} onChange={setLoc} />
      {fit && <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-[14px] text-amber-500">{fit} You can still save it.</p>}

      {entry === "client" && (
        <Lbl label="Charges (AED)">
          <input className={inputCls} type="number" inputMode="decimal" min={0} value={charges} onChange={(e) => setCharges(e.target.value)}
            placeholder={cbm ? `Tariff: ${storageCharge(cbm).toFixed(0)}` : "0"} />
        </Lbl>
      )}

      <FilesField files={docs} onChange={setDocs} />
      <PhotoField file={photo} onChange={setPhoto} label="Upload or Capture an Image" />

      <section className="space-y-3">
        <div className="text-[14px] font-medium text-muted-foreground">Packing List <span className="font-normal">(optional — leave blank if contents aren't known yet)</span></div>
        {packing.map((l, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Item Name" value={l.itemName} onChange={(e) => setLine(i, { itemName: e.target.value })} />
              <button type="button" aria-label="Remove item" onClick={() => setPacking((c) => c.filter((_, j) => j !== i))} className="shrink-0 rounded-lg px-2 text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} type="number" inputMode="numeric" min={1} placeholder="Quantity" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              <select className={inputCls} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
              <input className={`${inputCls} col-span-2`} placeholder="Remarks" value={l.remarks} onChange={(e) => setLine(i, { remarks: e.target.value })} />
            </div>
            <PhotoField file={l.photo} onChange={(f) => setLine(i, { photo: f })} label="Item image" />
          </div>
        ))}
        <button type="button" onClick={() => setPacking((c) => [...c, blankLine()])} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold">
          <Plus className="h-5 w-5" /> Add more item in packing list
        </button>
      </section>
    </Screen>
  );
}
