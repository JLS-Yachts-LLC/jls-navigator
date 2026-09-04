import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ship, Building2, FileStack, Package, Paperclip, ImagePlus, Plus, X } from "lucide-react";
import { ZONES, INTERNAL_DEPARTMENTS, calcCbm } from "@/components/shipsync/warehouse/warehouse-constants";

type Owner = "client" | "internal";
type InternalKind = "documents" | "assets";

interface PackingRow { id: string; itemName: string; quantity: string; unit: string }
let seq = 0;
const newPackingRow = (): PackingRow => ({ id: `p${++seq}`, itemName: "", quantity: "1", unit: "pcs" });

export function NewStorage() {
  const [owner, setOwner] = useState<Owner>("client");
  const [internalKind, setInternalKind] = useState<InternalKind>("documents");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
        UI preview — this form doesn't save anywhere yet. "Register storage" just confirms the fields validate.
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-card/50 p-1 w-fit">
        <button onClick={() => setOwner("client")}
          className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
            owner === "client" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          <Ship className="h-3.5 w-3.5" /> Client
        </button>
        <button onClick={() => setOwner("internal")}
          className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
            owner === "internal" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          <Building2 className="h-3.5 w-3.5" /> Internal
        </button>
      </div>

      {owner === "internal" && (
        <div className="flex gap-1 rounded-lg border border-border bg-card/50 p-1 w-fit">
          <button onClick={() => setInternalKind("documents")}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
              internalKind === "documents" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
            <FileStack className="h-3.5 w-3.5" /> Documents
          </button>
          <button onClick={() => setInternalKind("assets")}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
              internalKind === "assets" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
            <Package className="h-3.5 w-3.5" /> Assets
          </button>
        </div>
      )}

      {owner === "client" ? <ClientStorageForm /> : <InternalStorageForm kind={internalKind} />}
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────────

function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) {
  return (
    <div className={cn("space-y-1.5", full && "col-span-2")}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ZoneBayShelfFields({ zone, bay, shelf, onZone, onBay, onShelf }: {
  zone: string; bay: string; shelf: string;
  onZone: (v: string) => void; onBay: (v: string) => void; onShelf: (v: string) => void;
}) {
  return (
    <>
      <Field label="Zone">
        <Select value={zone} onValueChange={onZone}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select zone" /></SelectTrigger>
          <SelectContent>{ZONES.map((z) => <SelectItem key={z} value={z}>Zone {z}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Bay"><Input value={bay} onChange={(e) => onBay(e.target.value)} placeholder="e.g. 1" className="h-9" /></Field>
      <Field label="Shelf"><Input value={shelf} onChange={(e) => onShelf(e.target.value)} placeholder="e.g. 01" className="h-9" /></Field>
    </>
  );
}

/** Local-only attachment picker — tracks selected filenames in memory, never
 *  uploads anywhere (this module has no backend yet). */
function AttachmentsField({ label, icon: Icon, files, onChange }: { label: string; icon: typeof Paperclip; files: string[]; onChange: (names: string[]) => void }) {
  return (
    <Field label={label} full>
      <div className="flex flex-wrap items-center gap-2">
        {files.map((f) => (
          <span key={f} className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-1 text-[11px]">
            {f}
            <button onClick={() => onChange(files.filter((x) => x !== f))} className="text-muted-foreground/60 hover:text-destructive"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary">
          <Icon className="h-3.5 w-3.5" /> Choose file(s)
          <input type="file" multiple className="hidden" onChange={(e) => onChange([...files, ...Array.from(e.target.files ?? []).map((f) => f.name)])} />
        </label>
      </div>
    </Field>
  );
}

function PackingListBuilder({ rows, onChange }: { rows: PackingRow[]; onChange: (rows: PackingRow[]) => void }) {
  function update(id: string, patch: Partial<PackingRow>) { onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r))); }
  return (
    <div className="col-span-2 space-y-1.5">
      <Label className="text-xs">Packing List <span className="font-normal text-muted-foreground">(optional — leave blank if contents aren't known yet)</span></Label>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <Input value={r.itemName} onChange={(e) => update(r.id, { itemName: e.target.value })} placeholder="Item name" className="h-8 flex-1 text-xs" />
            <Input type="number" min={1} value={r.quantity} onChange={(e) => update(r.id, { quantity: e.target.value })} placeholder="Qty" className="h-8 w-20 text-xs" />
            <Input value={r.unit} onChange={(e) => update(r.id, { unit: e.target.value })} placeholder="Unit" className="h-8 w-20 text-xs" />
            <button onClick={() => onChange(rows.length > 1 ? rows.filter((x) => x.id !== r.id) : rows)} className="rounded p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="mt-1 gap-1.5" onClick={() => onChange([...rows, newPackingRow()])}>
        <Plus className="h-3.5 w-3.5" /> Add item
      </Button>
    </div>
  );
}

function CbmField({ length, width, height }: { length: string; width: string; height: string }) {
  const cbm = calcCbm(Number(length) || 0, Number(width) || 0, Number(height) || 0);
  return (
    <Field label="CBM (auto-calculated)">
      <Input readOnly value={cbm ? `${cbm.toFixed(2)} m³` : ""} placeholder="—" className="h-9 bg-muted/30 text-muted-foreground" />
    </Field>
  );
}

// ── Client form ────────────────────────────────────────────────────────────────

function ClientStorageForm() {
  const [f, setF] = useState({
    clientName: "", description: "", quotationNo: "", length: "", width: "", height: "", weight: "",
    charges: "", dateStored: "", dueDate: "", zone: "", bay: "", shelf: "",
  });
  const [docs, setDocs] = useState<string[]>([]);
  const [imageName, setImageName] = useState<string | null>(null);
  const [packing, setPacking] = useState<PackingRow[]>([newPackingRow()]);
  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));

  function save() {
    if (!f.clientName.trim() || !f.description.trim()) { toast.error("Client name and description are required"); return; }
    toast.success("Looks good — this is a UI preview, nothing is saved yet.");
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

        <ZoneBayShelfFields zone={f.zone} bay={f.bay} shelf={f.shelf}
          onZone={(v) => set({ zone: v })} onBay={(v) => set({ bay: v })} onShelf={(v) => set({ shelf: v })} />

        <AttachmentsField label="Attached Documents" icon={Paperclip} files={docs} onChange={setDocs} />
        <Field label="Image" full>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary">
            <ImagePlus className="h-3.5 w-3.5" /> {imageName ?? "Choose image"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageName(e.target.files?.[0]?.name ?? null)} />
          </label>
        </Field>

        <PackingListBuilder rows={packing} onChange={setPacking} />
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={save} className="gap-1.5"><Plus className="h-4 w-4" /> Register storage</Button>
      </div>
    </div>
  );
}

// ── Internal form (Documents / Assets) ──────────────────────────────────────────

function InternalStorageForm({ kind }: { kind: InternalKind }) {
  const [f, setF] = useState({
    department: "", description: "", length: "", width: "", height: "", weight: "",
    dateStored: "", destructionDate: "", zone: "", bay: "", shelf: "",
  });
  const [docs, setDocs] = useState<string[]>([]);
  const [imageName, setImageName] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));

  function save() {
    if (!f.department || !f.description.trim()) { toast.error("Department and description are required"); return; }
    toast.success("Looks good — this is a UI preview, nothing is saved yet.");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Department *">
          <Select value={f.department} onValueChange={(v) => set({ department: v })}>
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
          <Field label="Destruction Date">
            <Input type="date" value={f.destructionDate} onChange={(e) => set({ destructionDate: e.target.value })} className="h-9" />
          </Field>
        )}

        <ZoneBayShelfFields zone={f.zone} bay={f.bay} shelf={f.shelf}
          onZone={(v) => set({ zone: v })} onBay={(v) => set({ bay: v })} onShelf={(v) => set({ shelf: v })} />

        <AttachmentsField label="Attached Documents" icon={Paperclip} files={docs} onChange={setDocs} />
        <Field label="Image" full>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary">
            <ImagePlus className="h-3.5 w-3.5" /> {imageName ?? "Choose image"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageName(e.target.files?.[0]?.name ?? null)} />
          </label>
        </Field>
      </div>
      {kind === "assets" && (
        <p className="mt-3 text-[11px] text-muted-foreground">Assets don't need a destruction date — that only applies to Documents.</p>
      )}
      <div className="mt-5 flex justify-end">
        <Button onClick={save} className="gap-1.5"><Plus className="h-4 w-4" /> Register storage</Button>
      </div>
    </div>
  );
}
