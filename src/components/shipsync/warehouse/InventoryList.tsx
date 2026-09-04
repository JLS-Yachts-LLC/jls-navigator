import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SignedImage } from "@/components/ui/signed-file";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Building2, Boxes, Plus, Pencil, Trash2 } from "lucide-react";
import {
  DISPLAY_STATUS_STYLE, deriveStatus, locationCode,
} from "@/components/shipsync/warehouse/warehouse-constants";
import { ClientItemForm, InternalItemForm } from "@/components/shipsync/warehouse/forms";
import {
  clientItemCrud, internalItemCrud, packageContentCrud,
  type WarehouseClientItem, type WarehouseInternalItem, type WarehousePackageContent, type PackageContentManualStatus,
} from "@/lib/warehouse/data";
import type { WarehouseData } from "@/components/shipsync/ShipSyncWarehouse";

type Category = "client" | "internal" | "contents";
const CATEGORIES: { key: Category; label: string; icon: typeof Users }[] = [
  { key: "client", label: "Client Inventory List", icon: Users },
  { key: "internal", label: "Internal Inventory List", icon: Building2 },
  { key: "contents", label: "Package Content", icon: Boxes },
];

function StatusPill({ label, style }: { label: string; style: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", style)}>{label}</span>;
}

export function InventoryList({ data, reload }: { data: WarehouseData; reload: () => Promise<void> }) {
  const [category, setCategory] = useState<Category>("client");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<WarehouseClientItem | null | undefined>(undefined);
  const [editingInternal, setEditingInternal] = useState<WarehouseInternalItem | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "client" | "internal"; id: string; label: string } | null>(null);

  const packingList = useMemo(
    () => (selectedRef ? data.packageContents.filter((c) => c.ref_no === selectedRef) : []),
    [data.packageContents, selectedRef],
  );
  const existingContentsForClientEdit = useMemo(
    () => (editingClient ? data.packageContents.filter((c) => c.ref_no === editingClient.ref_no) : []),
    [data.packageContents, editingClient],
  );
  const existingContentsForInternalEdit = useMemo(
    () => (editingInternal ? data.packageContents.filter((c) => c.ref_no === editingInternal.ref_no) : []),
    [data.packageContents, editingInternal],
  );

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === "client") await clientItemCrud.remove(deleteTarget.id);
      else await internalItemCrud.remove(deleteTarget.id);
      toast.success("Removed");
      setSelectedRef(null);
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
    finally { setDeleteTarget(null); }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-border bg-card/50 p-1 w-fit">
          {CATEGORIES.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => { setCategory(key); setSelectedRef(null); }}
              className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
                category === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        {category === "client" && (
          <Button size="sm" className="gap-1.5" onClick={() => setEditingClient(null)}><Plus className="h-3.5 w-3.5" /> Add client item</Button>
        )}
        {category === "internal" && (
          <Button size="sm" className="gap-1.5" onClick={() => setEditingInternal(null)}><Plus className="h-3.5 w-3.5" /> Add internal item</Button>
        )}
      </div>

      {category === "contents" ? (
        <PackageContentTable rows={data.packageContents} reload={reload} />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_360px]">
          <div className="min-h-0 overflow-auto rounded-xl border border-border bg-card">
            {category === "client"
              ? <ClientTable rows={data.clientItems} selectedRef={selectedRef} onSelect={setSelectedRef}
                  onEdit={setEditingClient} onDelete={(r) => setDeleteTarget({ kind: "client", id: r.id, label: r.ref_no })} />
              : <InternalTable rows={data.internalItems} selectedRef={selectedRef} onSelect={setSelectedRef}
                  onEdit={setEditingInternal} onDelete={(r) => setDeleteTarget({ kind: "internal", id: r.id, label: r.ref_no })} />}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 font-display text-sm font-semibold">Packing List</div>
            {!selectedRef ? (
              <p className="text-sm text-muted-foreground">Select a reference number on the left to view its package contents, if a packing list is available.</p>
            ) : packingList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No packing list available for <span className="font-mono">{selectedRef}</span>.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {packingList.map((c) => {
                  const status = deriveStatus(c.due_date, c.status);
                  return (
                    <div key={c.id} className="flex items-start gap-2.5 rounded-lg border border-border/60 p-2.5 text-[12.5px]">
                      <ImageThumb url={c.image_url} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{c.item_name}</span>
                          <StatusPill label={status} style={DISPLAY_STATUS_STYLE[status]} />
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {c.quantity} {c.unit}{c.due_date ? ` · due ${c.due_date}` : ""}{c.remarks ? ` · ${c.remarks}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={editingClient !== undefined} onOpenChange={(open) => !open && setEditingClient(undefined)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingClient ? `Edit ${editingClient.ref_no}` : "New client storage item"}</DialogTitle></DialogHeader>
          {editingClient !== undefined && (
            <ClientItemForm editing={editingClient} existingContents={existingContentsForClientEdit}
              onSaved={async () => { await reload(); setEditingClient(undefined); }}
              onCancel={() => setEditingClient(undefined)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editingInternal !== undefined} onOpenChange={(open) => !open && setEditingInternal(undefined)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingInternal ? `Edit ${editingInternal.ref_no}` : "New internal storage item"}</DialogTitle></DialogHeader>
          {editingInternal !== undefined && (
            <InternalItemForm kind={editingInternal?.kind ?? "documents"} editing={editingInternal} existingContents={existingContentsForInternalEdit}
              onSaved={async () => { await reload(); setEditingInternal(undefined); }}
              onCancel={() => setEditingInternal(undefined)} />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the storage record. This can't be undone.</AlertDialogDescription>
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

function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{children}</th>;
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="rounded p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="rounded p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function ImageThumb({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return <SignedImage stored={url} className="h-8 w-8 rounded object-cover border border-border" />;
}

function ClientTable({ rows, selectedRef, onSelect, onEdit, onDelete }: {
  rows: WarehouseClientItem[]; selectedRef: string | null; onSelect: (ref: string) => void;
  onEdit: (item: WarehouseClientItem) => void; onDelete: (item: WarehouseClientItem) => void;
}) {
  if (rows.length === 0) return <div className="px-4 py-10 text-center text-sm text-muted-foreground">No client storage items yet.</div>;
  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
        <tr>
          <Th>Ref No.</Th><Th>Client Name</Th><Th>Description</Th><Th>Quotation No.</Th>
          <Th>L×W×H (cm)</Th><Th>Weight</Th><Th>CBM</Th><Th>Date Stored</Th><Th>Due Date</Th>
          <Th>Location</Th><Th>Invoice No.</Th><Th>Status</Th><Th>Remarks</Th><Th>Image</Th><Th>{""}</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/40">
        {rows.map((r) => {
          const status = deriveStatus(r.due_date, r.status);
          return (
            <tr key={r.id} onClick={() => onSelect(r.ref_no)}
              className={cn("cursor-pointer transition hover:bg-accent/20", selectedRef === r.ref_no && "bg-primary/5")}>
              <td className="px-3 py-2 font-mono font-medium">{r.ref_no}</td>
              <td className="px-3 py-2">{r.client_name}</td>
              <td className="px-3 py-2 max-w-[220px] truncate">{r.description}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">{r.quotation_no ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.length_cm ?? "—"}×{r.width_cm ?? "—"}×{r.height_cm ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.weight_kg != null ? `${r.weight_kg} kg` : "—"}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.cbm != null ? `${r.cbm.toFixed(2)} m³` : "—"}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.date_stored ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.due_date ?? "—"}</td>
              <td className="px-3 py-2 font-mono">{locationCode(r)}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">{r.invoice_no ?? "—"}</td>
              <td className="px-3 py-2"><StatusPill label={status} style={DISPLAY_STATUS_STYLE[status]} /></td>
              <td className="px-3 py-2 max-w-[160px] truncate text-muted-foreground">{r.remarks || "—"}</td>
              <td className="px-3 py-2"><ImageThumb url={r.image_url} /></td>
              <td className="px-3 py-2"><RowActions onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function InternalTable({ rows, selectedRef, onSelect, onEdit, onDelete }: {
  rows: WarehouseInternalItem[]; selectedRef: string | null; onSelect: (ref: string) => void;
  onEdit: (item: WarehouseInternalItem) => void; onDelete: (item: WarehouseInternalItem) => void;
}) {
  if (rows.length === 0) return <div className="px-4 py-10 text-center text-sm text-muted-foreground">No internal storage items yet.</div>;
  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
        <tr>
          <Th>Ref No.</Th><Th>Department</Th><Th>Description</Th>
          <Th>L×W×H (cm)</Th><Th>Weight</Th><Th>CBM</Th><Th>Date Stored</Th>
          <Th>Location</Th><Th>Status</Th><Th>Remarks</Th><Th>Image</Th><Th>{""}</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/40">
        {rows.map((r) => {
          const status = deriveStatus(r.destruction_date, r.status);
          return (
            <tr key={r.id} onClick={() => onSelect(r.ref_no)}
              className={cn("cursor-pointer transition hover:bg-accent/20", selectedRef === r.ref_no && "bg-primary/5")}>
              <td className="px-3 py-2 font-mono font-medium">{r.ref_no}</td>
              <td className="px-3 py-2">{r.department}</td>
              <td className="px-3 py-2 max-w-[240px] truncate">{r.description}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.length_cm ?? "—"}×{r.width_cm ?? "—"}×{r.height_cm ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.weight_kg != null ? `${r.weight_kg} kg` : "—"}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.cbm != null ? `${r.cbm.toFixed(2)} m³` : "—"}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.date_stored ?? "—"}</td>
              <td className="px-3 py-2 font-mono">{locationCode(r)}</td>
              <td className="px-3 py-2"><StatusPill label={status} style={DISPLAY_STATUS_STYLE[status]} /></td>
              <td className="px-3 py-2 max-w-[160px] truncate text-muted-foreground">{r.remarks || "—"}</td>
              <td className="px-3 py-2"><ImageThumb url={r.image_url} /></td>
              <td className="px-3 py-2"><RowActions onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const CONTENT_STATUSES: PackageContentManualStatus[] = ["Stored", "Checked Out", "Returned", "Disposed", "Completed"];

function PackageContentTable({ rows, reload }: { rows: WarehousePackageContent[]; reload: () => Promise<void> }) {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function updateStatus(id: string, status: PackageContentManualStatus) {
    try { await packageContentCrud.patch(id, { status }); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Update failed"); }
  }
  async function confirmDelete() {
    if (!deleteId) return;
    try { await packageContentCrud.remove(deleteId); toast.success("Removed"); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
    finally { setDeleteId(null); }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
      {rows.length === 0 ? <div className="px-4 py-10 text-center text-sm text-muted-foreground">No package contents recorded yet — add a packing list from a client or internal storage item.</div> : (
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
            <tr>
              <Th>Ref No.</Th><Th>Item ID</Th><Th>Client / Department</Th><Th>Item Name</Th>
              <Th>Quantity</Th><Th>Unit</Th><Th>Due Date</Th><Th>Status</Th><Th>Remarks</Th><Th>Image</Th><Th>{""}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((c) => {
              const derived = deriveStatus(c.due_date, c.status);
              return (
                <tr key={c.id} className="hover:bg-accent/10">
                  <td className="px-3 py-2 font-mono font-medium">{c.ref_no}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{c.item_id}</td>
                  <td className="px-3 py-2">{c.client_or_dept ?? "—"}</td>
                  <td className="px-3 py-2">{c.item_name}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{c.quantity}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.unit}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{c.due_date ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill label={derived} style={DISPLAY_STATUS_STYLE[derived]} />
                      <Select value={c.status} onValueChange={(v) => updateStatus(c.id, v as PackageContentManualStatus)}>
                        <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{CONTENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="px-3 py-2 max-w-[220px] truncate text-muted-foreground">{c.remarks || "—"}</td>
                  <td className="px-3 py-2"><ImageThumb url={c.image_url} /></td>
                  <td className="px-3 py-2">
                    <button onClick={() => setDeleteId(c.id)} className="rounded p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this package content row?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
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
