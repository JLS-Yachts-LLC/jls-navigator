import { SignedAnchor, SignedImage } from "@/components/ui/signed-file";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Paperclip, ImagePlus, Plus, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { ZONES, INTERNAL_DEPARTMENTS, calcCbm } from "@/components/shipsync/warehouse/warehouse-constants";
import {
  clientItemCrud, internalItemCrud, packageContentCrud,
  nextClientRef, nextInternalRef, nextPackageItemId, uploadWarehouseFile,
  type WarehouseClientItem, type WarehouseInternalItem, type WarehousePackageContent, type WarehouseDoc, type ManualStatus,
} from "@/lib/warehouse/data";

const ITEM_STATUSES: ManualStatus[] = ["Stored", "Checked Out", "Returned", "Disposed", "Completed"];

/** Shared Status + checkout tracking, used by both Client and Internal item
 *  forms — mirrors the source spreadsheet, where a whole item (not just a
 *  packing-list row) can be checked out to someone and later returned. */
function StatusAndCheckoutFields({ status, checkedOutDate, checkedOutTo, actualReturnDate, onChange }: {
  status: ManualStatus; checkedOutDate: string; checkedOutTo: string; actualReturnDate: string;
  onChange: (patch: Partial<{ status: ManualStatus; checkedOutDate: string; checkedOutTo: string; actualReturnDate: string }>) => void;
}) {
  return (
    <>
      <Field label="Status">
        <Select value={status} onValueChange={(v) => onChange({ status: v as ManualStatus })}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{ITEM_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      {status === "Checked Out" && (
        <>
          <Field label="Checked-Out Date"><Input type="date" value={checkedOutDate} onChange={(e) => onChange({ checkedOutDate: e.target.value })} className="h-9" /></Field>
          <Field label="Checked Out To"><Input value={checkedOutTo} onChange={(e) => onChange({ checkedOutTo: e.target.value })} placeholder="Name" className="h-9" /></Field>
        </>
      )}
      {status === "Returned" && (
        <Field label="Actual Return Date"><Input type="date" value={actualReturnDate} onChange={(e) => onChange({ actualReturnDate: e.target.value })} className="h-9" /></Field>
      )}
    </>
  );
}

// ── Small shared field helpers ──────────────────────────────────────────────

export function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) {
  return (
    <div className={cn("space-y-1.5", full && "col-span-2")}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function ZoneBayShelfFields({ zone, bay, shelf, onZone, onBay, onShelf }: {
  zone: string; bay: string; shelf: string;
  onZone: (v: string) => void; onBay: (v: string) => void; onShelf: (v: string) => void;
}) {
  return (
    <>
      <Field label="Zone">
        <Select value={zone || undefined} onValueChange={onZone}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select zone" /></SelectTrigger>
          <SelectContent>{ZONES.map((z) => <SelectItem key={z} value={z}>Zone {z}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Bay"><Input value={bay} onChange={(e) => onBay(e.target.value)} placeholder="e.g. 1" className="h-9" /></Field>
      <Field label="Shelf"><Input value={shelf} onChange={(e) => onShelf(e.target.value)} placeholder="e.g. 01" className="h-9" /></Field>
    </>
  );
}

export function CbmField({ length, width, height }: { length: string; width: string; height: string }) {
  const cbm = calcCbm(Number(length) || 0, Number(width) || 0, Number(height) || 0);
  return (
    <Field label="CBM (auto-calculated)">
      <Input readOnly value={cbm ? `${cbm.toFixed(2)} m³` : ""} placeholder="—" className="h-9 bg-muted/30 text-muted-foreground" />
    </Field>
  );
}

/** Real upload to the shipsync storage bucket (warehouse/ prefix) — files
 *  appear immediately as chips once uploaded, removable before or after save. */
export function AttachmentsField({ label, pathPrefix, files, onChange }: {
  label: string; pathPrefix: string; files: WarehouseDoc[]; onChange: (docs: WarehouseDoc[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function handleFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    setBusy(true);
    try {
      const uploaded = await Promise.all(picked.map(async (f) => {
        const url = await uploadWarehouseFile(f, `${pathPrefix}/${Date.now()}-${f.name}`);
        return { name: f.name, url };
      }));
      onChange([...files, ...uploaded]);
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    finally { setBusy(false); }
  }
  return (
    <Field label={label} full>
      <div className="flex flex-wrap items-center gap-2">
        {files.map((f, i) => (
          <SignedAnchor key={i} stored={f.url} title={f.name}
            className="group/doc inline-flex max-w-[160px] items-center gap-1 rounded border border-border bg-muted/30 px-2 py-1 text-[11px] hover:bg-primary/5">
            <FileText className="h-3 w-3 shrink-0 text-primary" /> <span className="truncate">{f.name}</span>
            <button onClick={(e) => { e.preventDefault(); onChange(files.filter((_, j) => j !== i)); }}
              className="shrink-0 text-muted-foreground/60 hover:text-destructive"><X className="h-3 w-3" /></button>
          </SignedAnchor>
        ))}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />} Choose file(s)
          <input type="file" multiple className="hidden" disabled={busy} onChange={(e) => void handleFiles(e.target.files)} />
        </label>
      </div>
    </Field>
  );
}

/** Real upload for the single Image field. */
export function ImageField({ pathPrefix, url, onChange }: { pathPrefix: string; url: string | null; onChange: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try { onChange(await uploadWarehouseFile(file, `${pathPrefix}/image-${Date.now()}-${file.name}`)); }
    catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    finally { setBusy(false); }
  }
  return (
    <Field label="Image" full>
      <div className="flex items-center gap-3">
        {url && <SignedImage stored={url} alt="" className="h-12 w-12 rounded object-cover border border-border" />}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} {url ? "Replace image" : "Choose image"}
          <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => void handleFile(e.target.files?.[0])} />
        </label>
      </div>
    </Field>
  );
}

// ── Packing list — reconciled against real warehouse_package_contents ──────────

interface PackingRow { dbId: string | null; itemId: string | null; itemName: string; quantity: string; unit: string }
const blankPackingRow = (): PackingRow => ({ dbId: null, itemId: null, itemName: "", quantity: "1", unit: "pcs" });

function PackingListEditor({ rows, onChange }: { rows: PackingRow[]; onChange: (rows: PackingRow[]) => void }) {
  function update(i: number, patch: Partial<PackingRow>) { onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))); }
  return (
    <div className="col-span-2 space-y-1.5">
      <Label className="text-xs">Packing List <span className="font-normal text-muted-foreground">(optional — leave blank if contents aren't known yet)</span></Label>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={r.dbId ?? `new-${i}`} className="flex items-center gap-2">
            <Input value={r.itemName} onChange={(e) => update(i, { itemName: e.target.value })} placeholder="Item name" className="h-8 flex-1 text-xs" />
            <Input type="number" min={1} value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} placeholder="Qty" className="h-8 w-20 text-xs" />
            <Input value={r.unit} onChange={(e) => update(i, { unit: e.target.value })} placeholder="Unit" className="h-8 w-20 text-xs" />
            <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-1 gap-1.5" onClick={() => onChange([...rows, blankPackingRow()])}>
        <Plus className="h-3.5 w-3.5" /> Add item
      </Button>
    </div>
  );
}

/** Create/update/delete package_content rows to match the edited list,
 *  against a real ref_no (only ever called once the parent item is saved
 *  and has one). */
async function reconcilePackingList(refNo: string, ownerLabel: string, rows: PackingRow[], originalDbIds: Set<string>) {
  const keptIds = new Set<string>();
  for (const r of rows) {
    if (!r.itemName.trim()) continue;
    if (r.dbId) {
      keptIds.add(r.dbId);
      await packageContentCrud.patch(r.dbId, { item_name: r.itemName.trim(), quantity: Number(r.quantity) || 1, unit: r.unit.trim() || "pcs" });
    } else {
      const itemId = await nextPackageItemId(refNo);
      await packageContentCrud.create({
        item_id: itemId, ref_no: refNo, client_or_dept: ownerLabel,
        item_name: r.itemName.trim(), quantity: Number(r.quantity) || 1, unit: r.unit.trim() || "pcs", status: "Stored",
      });
    }
  }
  for (const id of originalDbIds) if (!keptIds.has(id)) await packageContentCrud.remove(id);
}

// ── Client item form ─────────────────────────────────────────────────────────

export function ClientItemForm({ editing, existingContents, onSaved, onCancel }: {
  editing: WarehouseClientItem | null;
  existingContents: WarehousePackageContent[];
  onSaved: () => Promise<void>;
  onCancel?: () => void;
}) {
  const blank = { clientName: "", description: "", quotationNo: "", length: "", width: "", height: "", weight: "", charges: "", dateStored: "", dueDate: "", zone: "", bay: "", shelf: "", invoiceNo: "", status: "Stored" as ManualStatus, checkedOutDate: "", checkedOutTo: "", actualReturnDate: "" };
  const [f, setF] = useState(blank);
  const [docs, setDocs] = useState<WarehouseDoc[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [packing, setPacking] = useState<PackingRow[]>([blankPackingRow()]);
  const [busy, setBusy] = useState(false);
  const pathPrefix = editing?.id ?? `new-${editing ? editing.id : "client"}`;

  useEffect(() => {
    if (editing) {
      setF({
        clientName: editing.client_name, description: editing.description, quotationNo: editing.quotation_no ?? "",
        length: editing.length_cm != null ? String(editing.length_cm) : "", width: editing.width_cm != null ? String(editing.width_cm) : "",
        height: editing.height_cm != null ? String(editing.height_cm) : "", weight: editing.weight_kg != null ? String(editing.weight_kg) : "",
        charges: editing.charges != null ? String(editing.charges) : "", dateStored: editing.date_stored ?? "", dueDate: editing.due_date ?? "",
        zone: editing.zone ?? "", bay: editing.bay ?? "", shelf: editing.shelf ?? "", invoiceNo: editing.invoice_no ?? "",
        status: editing.status, checkedOutDate: editing.checked_out_date ?? "", checkedOutTo: editing.checked_out_to ?? "", actualReturnDate: editing.actual_return_date ?? "",
      });
      setDocs(editing.documents ?? []);
      setImageUrl(editing.image_url);
      setPacking(existingContents.length
        ? existingContents.map((c) => ({ dbId: c.id, itemId: c.item_id, itemName: c.item_name, quantity: String(c.quantity), unit: c.unit }))
        : [blankPackingRow()]);
    } else {
      setF(blank); setDocs([]); setImageUrl(null); setPacking([blankPackingRow()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));

  async function save() {
    if (!f.clientName.trim() || !f.description.trim()) { toast.error("Client name and description are required"); return; }
    setBusy(true);
    try {
      const cbm = calcCbm(Number(f.length) || 0, Number(f.width) || 0, Number(f.height) || 0);
      const payload: Partial<WarehouseClientItem> = {
        client_name: f.clientName.trim(), description: f.description.trim(), quotation_no: f.quotationNo.trim() || null,
        length_cm: f.length ? Number(f.length) : null, width_cm: f.width ? Number(f.width) : null, height_cm: f.height ? Number(f.height) : null,
        weight_kg: f.weight ? Number(f.weight) : null, cbm: cbm || null, charges: f.charges ? Number(f.charges) : null,
        date_stored: f.dateStored || null, due_date: f.dueDate || null,
        zone: (f.zone || null) as WarehouseClientItem["zone"], bay: f.bay.trim() || null, shelf: f.shelf.trim() || null,
        invoice_no: f.invoiceNo.trim() || null, documents: docs, image_url: imageUrl,
        status: f.status, checked_out_date: f.status === "Checked Out" ? (f.checkedOutDate || null) : null,
        checked_out_to: f.status === "Checked Out" ? (f.checkedOutTo.trim() || null) : null,
        actual_return_date: f.status === "Returned" ? (f.actualReturnDate || null) : null,
      };
      let refNo: string;
      if (editing) {
        refNo = editing.ref_no;
        await clientItemCrud.patch(editing.id, payload);
      } else {
        refNo = await nextClientRef();
        const created = await clientItemCrud.create({ ...payload, ref_no: refNo });
        refNo = created.ref_no;
      }
      await reconcilePackingList(refNo, f.clientName.trim(), packing, new Set(existingContents.map((c) => c.id)));
      toast.success(editing ? "Client storage updated" : `Client storage registered — ${refNo}`);
      await onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client Name *"><Input value={f.clientName} onChange={(e) => set({ clientName: e.target.value })} placeholder="e.g. M/Y Example" className="h-9" /></Field>
        <Field label="Quotation Number"><Input value={f.quotationNo} onChange={(e) => set({ quotationNo: e.target.value })} className="h-9" /></Field>
        <Field label="Description *" full><Textarea rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} className="resize-none text-sm" /></Field>

        <Field label="Length (cm)"><Input type="number" min={0} value={f.length} onChange={(e) => set({ length: e.target.value })} className="h-9" /></Field>
        <Field label="Width (cm)"><Input type="number" min={0} value={f.width} onChange={(e) => set({ width: e.target.value })} className="h-9" /></Field>
        <Field label="Height (cm)"><Input type="number" min={0} value={f.height} onChange={(e) => set({ height: e.target.value })} className="h-9" /></Field>
        <Field label="Weight (kg)"><Input type="number" min={0} value={f.weight} onChange={(e) => set({ weight: e.target.value })} className="h-9" /></Field>
        <CbmField length={f.length} width={f.width} height={f.height} />
        <Field label="Charges (AED)"><Input type="number" min={0} value={f.charges} onChange={(e) => set({ charges: e.target.value })} className="h-9" /></Field>

        <Field label="Date Stored"><Input type="date" value={f.dateStored} onChange={(e) => set({ dateStored: e.target.value })} className="h-9" /></Field>
        <Field label="Due Date"><Input type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className="h-9" /></Field>

        <ZoneBayShelfFields zone={f.zone} bay={f.bay} shelf={f.shelf} onZone={(v) => set({ zone: v })} onBay={(v) => set({ bay: v })} onShelf={(v) => set({ shelf: v })} />
        <Field label="Invoice No."><Input value={f.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} className="h-9" /></Field>

        <StatusAndCheckoutFields status={f.status} checkedOutDate={f.checkedOutDate} checkedOutTo={f.checkedOutTo} actualReturnDate={f.actualReturnDate} onChange={set} />

        <AttachmentsField label="Attached Documents" pathPrefix={`client/${pathPrefix}`} files={docs} onChange={setDocs} />
        <ImageField pathPrefix={`client/${pathPrefix}`} url={imageUrl} onChange={setImageUrl} />

        <PackingListEditor rows={packing} onChange={setPacking} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        {onCancel && <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>}
        <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save changes" : "Register storage"}</Button>
      </div>
    </div>
  );
}

// ── Internal item form (Documents / Assets) ─────────────────────────────────

export function InternalItemForm({ kind, editing, onSaved, onCancel }: {
  kind: "documents" | "assets";
  editing: WarehouseInternalItem | null;
  onSaved: () => Promise<void>;
  onCancel?: () => void;
}) {
  const blank = { department: "", description: "", length: "", width: "", height: "", weight: "", dateStored: "", destructionDate: "", zone: "", bay: "", shelf: "", status: "Stored" as ManualStatus, checkedOutDate: "", checkedOutTo: "", actualReturnDate: "" };
  const [f, setF] = useState(blank);
  const [docs, setDocs] = useState<WarehouseDoc[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pathPrefix = editing?.id ?? "new-internal";

  useEffect(() => {
    if (editing) {
      setF({
        department: editing.department, description: editing.description,
        length: editing.length_cm != null ? String(editing.length_cm) : "", width: editing.width_cm != null ? String(editing.width_cm) : "",
        height: editing.height_cm != null ? String(editing.height_cm) : "", weight: editing.weight_kg != null ? String(editing.weight_kg) : "",
        dateStored: editing.date_stored ?? "", destructionDate: editing.destruction_date ?? "",
        zone: editing.zone ?? "", bay: editing.bay ?? "", shelf: editing.shelf ?? "",
        status: editing.status, checkedOutDate: editing.checked_out_date ?? "", checkedOutTo: editing.checked_out_to ?? "", actualReturnDate: editing.actual_return_date ?? "",
      });
      setDocs(editing.documents ?? []);
      setImageUrl(editing.image_url);
    } else {
      setF(blank); setDocs([]); setImageUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));

  async function save() {
    if (!f.department || !f.description.trim()) { toast.error("Department and description are required"); return; }
    setBusy(true);
    try {
      const cbm = calcCbm(Number(f.length) || 0, Number(f.width) || 0, Number(f.height) || 0);
      const payload: Partial<WarehouseInternalItem> = {
        department: f.department, description: f.description.trim(),
        length_cm: f.length ? Number(f.length) : null, width_cm: f.width ? Number(f.width) : null, height_cm: f.height ? Number(f.height) : null,
        weight_kg: f.weight ? Number(f.weight) : null, cbm: cbm || null,
        date_stored: f.dateStored || null, destruction_date: kind === "documents" ? (f.destructionDate || null) : null,
        zone: (f.zone || null) as WarehouseInternalItem["zone"], bay: f.bay.trim() || null, shelf: f.shelf.trim() || null,
        documents: docs, image_url: imageUrl, kind,
        status: f.status, checked_out_date: f.status === "Checked Out" ? (f.checkedOutDate || null) : null,
        checked_out_to: f.status === "Checked Out" ? (f.checkedOutTo.trim() || null) : null,
        actual_return_date: f.status === "Returned" ? (f.actualReturnDate || null) : null,
      };
      if (editing) await internalItemCrud.patch(editing.id, payload);
      else {
        const refNo = await nextInternalRef();
        await internalItemCrud.create({ ...payload, ref_no: refNo });
      }
      toast.success(editing ? "Internal storage updated" : "Internal storage registered");
      await onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Department *">
          <Select value={f.department || undefined} onValueChange={(v) => set({ department: v })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>{INTERNAL_DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Date Stored"><Input type="date" value={f.dateStored} onChange={(e) => set({ dateStored: e.target.value })} className="h-9" /></Field>
        <Field label="Description *" full><Textarea rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} className="resize-none text-sm" /></Field>

        <Field label="Length (cm)"><Input type="number" min={0} value={f.length} onChange={(e) => set({ length: e.target.value })} className="h-9" /></Field>
        <Field label="Width (cm)"><Input type="number" min={0} value={f.width} onChange={(e) => set({ width: e.target.value })} className="h-9" /></Field>
        <Field label="Height (cm)"><Input type="number" min={0} value={f.height} onChange={(e) => set({ height: e.target.value })} className="h-9" /></Field>
        <Field label="Weight (kg)"><Input type="number" min={0} value={f.weight} onChange={(e) => set({ weight: e.target.value })} className="h-9" /></Field>
        <CbmField length={f.length} width={f.width} height={f.height} />

        {kind === "documents" && (
          <Field label="Destruction Date"><Input type="date" value={f.destructionDate} onChange={(e) => set({ destructionDate: e.target.value })} className="h-9" /></Field>
        )}

        <ZoneBayShelfFields zone={f.zone} bay={f.bay} shelf={f.shelf} onZone={(v) => set({ zone: v })} onBay={(v) => set({ bay: v })} onShelf={(v) => set({ shelf: v })} />

        <StatusAndCheckoutFields status={f.status} checkedOutDate={f.checkedOutDate} checkedOutTo={f.checkedOutTo} actualReturnDate={f.actualReturnDate} onChange={set} />

        <AttachmentsField label="Attached Documents" pathPrefix={`internal/${pathPrefix}`} files={docs} onChange={setDocs} />
        <ImageField pathPrefix={`internal/${pathPrefix}`} url={imageUrl} onChange={setImageUrl} />
      </div>
      {kind === "assets" && <p className="mt-3 text-[11px] text-muted-foreground">Assets don't need a destruction date — that only applies to Documents.</p>}
      <div className="mt-5 flex justify-end gap-2">
        {onCancel && <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>}
        <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save changes" : "Register storage"}</Button>
      </div>
    </div>
  );
}
