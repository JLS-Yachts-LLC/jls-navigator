import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Archive, ArrowDownToLine, ImagePlus, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignedImage } from "@/components/ui/signed-file";
import { Chip, EmptyState, PillTabs, RowMenu, TableSkeleton, downloadCsv, useSearchShortcut } from "@/components/shipsync/shared";
import { AttachmentsField, Field } from "@/components/shipsync/warehouse/forms";
import {
  TPS_CURRENCIES, TPS_STATUSES, createThirdPartyStorage, deleteThirdPartyStorage, dueFlag, loadThirdPartyStorage,
  updateThirdPartyStorage, type ThirdPartyStorage, type TpsCurrency, type TpsFile, type TpsStatus, type TpsUpdate,
} from "@/lib/third-party-storage/data";
import { uploadWarehouseFile } from "@/lib/warehouse/data";

const STATUS_STYLE: Record<TpsStatus, string> = {
  "New Inquiry": "border-sky-500/20 bg-sky-500/15 text-sky-600 dark:text-sky-400",
  "Quote Submitted": "border-violet-500/20 bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "Quote Approved - Schedule for Collection": "border-amber-500/20 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "Stored": "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "Closed": "border-border bg-white/[0.05] text-muted-foreground",
};
const FLAG_STYLE = {
  "Overdue": "border-red-500/20 bg-red-500/15 text-red-600 dark:text-red-400",
  "Due Soon": "border-amber-500/20 bg-amber-500/15 text-amber-600 dark:text-amber-400",
} as const;

type Filter = "all" | TpsStatus;

/** dd/mm/yyyy, as the team's sheet asks for. */
const fmt = (d: string | null | undefined) => (d ? new Date(d + "T00:00").toLocaleDateString("en-GB") : "—");
const today = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };

interface FormState {
  client: string; status: TpsStatus; requestedBy: string; spaceReq: string; storageDate: string; dueDate: string; closedDate: string;
  unitNumber: string; clientEmail: string; clientContact: string; location: string;
  jlsQuotation: string; jlsInvoice: string; quotedAmount: string; quotedCurrency: TpsCurrency;
  storageCompany: string; contactPerson: string; contactNumber: string; website: string; companyEmail: string;
  remarks: string;
}
const blank = (): FormState => ({
  client: "", status: "New Inquiry", requestedBy: "", spaceReq: "", storageDate: "", dueDate: "", closedDate: "",
  unitNumber: "", clientEmail: "", clientContact: "", location: "", jlsQuotation: "", jlsInvoice: "", quotedAmount: "", quotedCurrency: "AED",
  storageCompany: "", contactPerson: "", contactNumber: "", website: "", companyEmail: "", remarks: "",
});
const fromRecord = (r: ThirdPartyStorage): FormState => ({
  client: r.client, status: r.status, requestedBy: r.requested_by ?? "", spaceReq: r.space_req_sqft != null ? String(r.space_req_sqft) : "",
  storageDate: r.storage_date ?? "", dueDate: r.due_date ?? "", closedDate: r.closed_date ?? "",
  unitNumber: r.unit_number ?? "", clientEmail: r.client_email ?? "", clientContact: r.client_contact ?? "", location: r.location ?? "",
  jlsQuotation: r.jls_quotation ?? "", jlsInvoice: r.jls_invoice ?? "",
  quotedAmount: r.quoted_amount != null ? String(r.quoted_amount) : "", quotedCurrency: r.quoted_currency ?? "AED",
  storageCompany: r.storage_company ?? "", contactPerson: r.contact_person ?? "", contactNumber: r.contact_number ?? "",
  website: r.company_website ?? "", companyEmail: r.company_email ?? "", remarks: r.remarks ?? "",
});

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const nz = (v: string) => v.trim() || null;

/** Several pictures of the unit — thumbnails you can remove, plus a picker. */
function UnitImagesField({ pathPrefix, images, onChange }: { pathPrefix: string; images: TpsFile[]; onChange: (v: TpsFile[]) => void }) {
  const [busy, setBusy] = useState(false);
  async function pick(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    setBusy(true);
    try {
      const up = await Promise.all(picked.map(async (f) => ({ name: f.name, url: await uploadWarehouseFile(f, `${pathPrefix}/unit-${Date.now()}-${f.name}`) })));
      onChange([...images, ...up]);
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    finally { setBusy(false); }
  }
  return (
    <Field label="Unit Images" full>
      <div className="flex flex-wrap items-center gap-2">
        {images.map((im, i) => (
          <div key={im.url} className="relative">
            <SignedImage stored={im.url} alt={im.name} className="h-16 w-16 rounded border border-border object-cover" />
            <button type="button" aria-label={`Remove ${im.name}`} onClick={() => onChange(images.filter((_, j) => j !== i))}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-dashed border-border px-2.5 py-1.5 text-[12px] text-muted-foreground hover:border-primary hover:text-primary">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Add images
          <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => void pick(e.target.files)} />
        </label>
      </div>
    </Field>
  );
}

/** Dated notes on a storage arrangement (the "Update" lines on the old board), newest first. */
function UpdatesField({ updates, onChange }: { updates: TpsUpdate[]; onChange: (v: TpsUpdate[]) => void }) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  function add() {
    if (!text.trim()) return;
    onChange([{ date: today(), owner: owner.trim(), text: text.trim() }, ...updates]);
    setText("");
  }
  return (
    <Field label="Updates" full>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who" className="h-9 w-32" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Called the company — unit confirmed empty"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} className="h-9 min-w-[200px] flex-1" />
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={add} disabled={!text.trim()}><Plus className="h-3.5 w-3.5" /> Add</Button>
        </div>
        {updates.map((u, i) => (
          <div key={i} className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-[13px]">
            <span className="shrink-0 tabular-nums text-muted-foreground">{fmt(u.date)}</span>
            {u.owner && <span className="shrink-0 font-medium">{u.owner}</span>}
            <span className="min-w-0 flex-1 break-words">{u.text}</span>
            <button type="button" aria-label="Remove update" onClick={() => onChange(updates.filter((_, j) => j !== i))}
              className="shrink-0 text-muted-foreground/60 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </Field>
  );
}

function StorageForm({ editing, onSaved, onCancel }: { editing: ThirdPartyStorage | null; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState<FormState>(() => (editing ? fromRecord(editing) : blank()));
  const [quoteFiles, setQuoteFiles] = useState<TpsFile[]>(editing?.storage_company_quotation ?? []);
  const [images, setImages] = useState<TpsFile[]>(editing?.unit_images ?? []);
  const [docs, setDocs] = useState<TpsFile[]>(editing?.documents ?? []);
  const [updates, setUpdates] = useState<TpsUpdate[]>(editing?.updates ?? []);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FormState>) => setF((p) => ({ ...p, ...patch }));
  // Files are filed under the record's id when it exists, otherwise under a scratch folder for this new one.
  const pathPrefix = useRef(`third-party/${editing?.id ?? `new-${Date.now()}`}`).current;

  async function save() {
    if (!f.client.trim()) { toast.error("Client is required"); return; }
    if (f.clientEmail.trim() && !isEmail(f.clientEmail.trim())) { toast.error("Client email doesn't look right"); return; }
    if (f.companyEmail.trim() && !isEmail(f.companyEmail.trim())) { toast.error("Storage company email doesn't look right"); return; }
    if (f.storageDate && f.dueDate && f.dueDate < f.storageDate) { toast.error("Due date is before the storage date"); return; }
    setBusy(true);
    try {
      const payload: Partial<ThirdPartyStorage> = {
        client: f.client.trim(), status: f.status, requested_by: nz(f.requestedBy),
        space_req_sqft: f.spaceReq ? Number(f.spaceReq) : null,
        storage_date: f.storageDate || null, due_date: f.dueDate || null, closed_date: f.closedDate || null,
        unit_number: nz(f.unitNumber), client_email: nz(f.clientEmail), client_contact: nz(f.clientContact), location: nz(f.location),
        jls_quotation: nz(f.jlsQuotation), jls_invoice: nz(f.jlsInvoice),
        quoted_amount: f.quotedAmount ? Number(f.quotedAmount) : null, quoted_currency: f.quotedAmount ? f.quotedCurrency : null,
        storage_company: nz(f.storageCompany), contact_person: nz(f.contactPerson), contact_number: nz(f.contactNumber),
        company_website: nz(f.website), company_email: nz(f.companyEmail),
        storage_company_quotation: quoteFiles, unit_images: images, documents: docs, updates, remarks: nz(f.remarks),
      };
      if (editing) {
        await updateThirdPartyStorage(editing.id, payload);
        toast.success(`${editing.ref_no} updated`);
      } else {
        const created = await createThirdPartyStorage(payload);
        toast.success(`3rd party storage registered — ${created.ref_no}`);
      }
      await onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  const text = (key: keyof FormState, label: string, extra?: { placeholder?: string; type?: string; full?: boolean }) => (
    <Field label={label} full={extra?.full}>
      <Input type={extra?.type} value={f[key]} placeholder={extra?.placeholder} onChange={(e) => set({ [key]: e.target.value } as Partial<FormState>)} className="h-9" />
    </Field>
  );

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {text("client", "Client *", { placeholder: "e.g. M/Y Example" })}
        <Field label="Status">
          <Select value={f.status} onValueChange={(v) => set({ status: v as TpsStatus })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{TPS_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        {text("requestedBy", "Requested By")}
        {text("spaceReq", "Space Req (sqft)", { type: "number" })}
        {text("storageDate", "Storage Date", { type: "date" })}
        {text("dueDate", "Due Date", { type: "date" })}
        {f.status === "Closed" && text("closedDate", "Closed Date", { type: "date" })}
        {text("unitNumber", "Unit Number")}
        {text("clientEmail", "Client Email", { type: "email" })}
        {text("clientContact", "Client Contact")}
        {text("location", "Location", { placeholder: "Google Maps link or area", full: true })}
        {text("jlsQuotation", "JLS Quotation")}
        {text("jlsInvoice", "JLS Invoice")}
        <Field label="Quoted Amount">
          <div className="flex gap-2">
            <Input type="number" min={0} value={f.quotedAmount} onChange={(e) => set({ quotedAmount: e.target.value })} className="h-9 flex-1" />
            <Select value={f.quotedCurrency} onValueChange={(v) => set({ quotedCurrency: v as TpsCurrency })}>
              <SelectTrigger className="h-9 w-24 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{TPS_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </Field>
      </div>

      <h3 className="mb-2 mt-5 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Storage company</h3>
      <div className="grid grid-cols-2 gap-3">
        {text("storageCompany", "Storage Company")}
        {text("contactPerson", "Contact Person")}
        {text("contactNumber", "Contact Number")}
        {text("website", "Website", { placeholder: "https://…" })}
        {text("companyEmail", "Email", { type: "email" })}
        <AttachmentsField label="Storage Company Quotation" pathPrefix={`${pathPrefix}/quote`} files={quoteFiles} onChange={setQuoteFiles} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <UnitImagesField pathPrefix={pathPrefix} images={images} onChange={setImages} />
        <AttachmentsField label="Documents" pathPrefix={`${pathPrefix}/docs`} files={docs} onChange={setDocs} />
        <Field label="Remarks" full><Textarea rows={2} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} className="resize-none text-sm" /></Field>
        <UpdatesField updates={updates} onChange={setUpdates} />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save changes" : "Register storage"}</Button>
      </div>
    </div>
  );
}

export function ShipSyncThirdPartyStorage() {
  const [rows, setRows] = useState<ThirdPartyStorage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchShortcut(searchRef);
  const [editing, setEditing] = useState<ThirdPartyStorage | null | undefined>(undefined); // undefined = closed, null = new
  const [deleteTarget, setDeleteTarget] = useState<ThirdPartyStorage | null>(null);

  const reload = useCallback(async () => {
    try { setRows(await loadThirdPartyStorage()); setError(null); }
    catch (e: any) { setError(e?.message ?? "Couldn't load 3rd party storage"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (filter === "all" || r.status === filter) && (!q ||
      [r.ref_no, r.client, r.requested_by, r.storage_company, r.jls_quotation, r.jls_invoice, r.unit_number, r.location, r.contact_person, r.contact_number, r.remarks]
        .join(" ").toLowerCase().includes(q)));
  }, [rows, filter, search]);

  function exportCsv() {
    if (shown.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(`shipsync-3rd-party-storage-${today()}.csv`,
      ["Ref No.", "Client", "Status", "Requested By", "Space Req (sqft)", "Storage Date", "Due Date", "Closed Date", "Storage Company", "Unit Number", "Location", "JLS Quotation", "JLS Invoice", "Quoted Amount", "Currency", "Client Email", "Client Contact", "Contact Person", "Contact Number", "Remarks"],
      shown.map((r) => [r.ref_no, r.client, r.status, r.requested_by, r.space_req_sqft, fmt(r.storage_date), fmt(r.due_date), fmt(r.closed_date), r.storage_company, r.unit_number, r.location, r.jls_quotation, r.jls_invoice, r.quoted_amount, r.quoted_currency, r.client_email, r.client_contact, r.contact_person, r.contact_number, r.remarks]));
    toast.success(`Exported ${shown.length} record${shown.length === 1 ? "" : "s"}`);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try { await deleteThirdPartyStorage(deleteTarget.id); toast.success(`${deleteTarget.ref_no} removed`); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
    finally { setDeleteTarget(null); }
  }

  if (loading) return <TableSkeleton />;
  if (error) return <div className="px-6 py-10 text-sm text-destructive">{error}</div>;

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    ...TPS_STATUSES.map((s) => ({ key: s as Filter, label: s === "Quote Approved - Schedule for Collection" ? "Quote Approved" : s, count: counts[s] ?? 0 })),
  ];
  const th = "px-3 py-2 text-left font-medium whitespace-nowrap";

  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-3">
      <div className="mb-3 shrink-0">
        <PillTabs tabs={tabs} value={filter} onChange={setFilter} />
      </div>
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search 3rd party storage…" title="Press / to search" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <span className="text-[12px] text-muted-foreground">{shown.length} of {rows.length}</span>
        <Button size="sm" variant="outline" onClick={exportCsv} className="ml-auto h-9 gap-1.5" title="Download the records shown as a CSV — opens straight in Excel">
          <ArrowDownToLine className="h-4 w-4" /> Export
        </Button>
        <Button size="sm" onClick={() => setEditing(null)} className="h-9 gap-1.5"><Plus className="h-4 w-4" /> New 3rd party storage</Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
        {shown.length === 0 ? (
          <EmptyState icon={Archive} title={rows.length === 0 ? "No 3rd party storage yet" : "Nothing matches"}
            hint={rows.length === 0 ? "Register space rented from an outside storage company for a client." : "Try another status or clear the search."} />
        ) : (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
              <tr>
                <th className={th}>Ref No.</th><th className={th}>Client</th><th className={th}>Status</th><th className={th}>Requested By</th>
                <th className={th}>Space Req</th><th className={th}>Storage Date</th><th className={th}>Due Date</th>
                <th className={th}>Storage Company</th><th className={th}>JLS Quotation</th><th className={th}>JLS Invoice</th><th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {shown.map((r) => {
                const flag = dueFlag(r);
                return (
                  <tr key={r.id} onClick={() => setEditing(r)} className="group cursor-pointer transition hover:bg-accent/20">
                    <td className="px-3 py-2 font-mono font-medium">{r.ref_no}</td>
                    <td className="px-3 py-2 font-medium">{r.client}</td>
                    <td className="px-3 py-2"><Chip className={cn(STATUS_STYLE[r.status])}>{r.status}</Chip></td>
                    <td className="px-3 py-2 text-muted-foreground">{r.requested_by ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.space_req_sqft != null ? `${r.space_req_sqft} sqft` : "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{fmt(r.storage_date)}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                      <span className="text-muted-foreground">{fmt(r.due_date)}</span>
                      {flag && <Chip className={cn("ml-2", FLAG_STYLE[flag])}>{flag}</Chip>}
                    </td>
                    <td className="px-3 py-2">{r.storage_company ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.jls_quotation ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.jls_invoice ?? "—"}</td>
                    <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                      <RowMenu items={[
                        { label: "Edit", icon: Pencil, onSelect: () => setEditing(r) },
                        { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleteTarget(r) },
                      ]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `Edit ${editing.ref_no}` : "New 3rd party storage"}</DialogTitle></DialogHeader>
          {editing !== undefined && (
            <StorageForm key={editing?.id ?? "new"} editing={editing}
              onSaved={async () => { await reload(); setEditing(undefined); }} onCancel={() => setEditing(undefined)} />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.ref_no}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the record for {deleteTarget?.client}. Mark it Closed instead if the storage has simply ended. This can't be undone.</AlertDialogDescription>
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
