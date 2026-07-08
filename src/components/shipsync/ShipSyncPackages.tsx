import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Loader2, Trash2, Camera, FileText } from "lucide-react";
import { StatusBadge, fmtDate } from "@/components/shipsync/shared";
import { ALL_ZONES, STATUS_META, type PackageStatus, type ShipSyncPackage } from "@/lib/shipsync/model";
import { createPackage, patchPackage, deletePackage, uploadShipSyncImage } from "@/lib/shipsync/data";
import type { ShipSyncData } from "@/components/shipsync-page";

const STATUS_OPTIONS = Object.keys(STATUS_META) as PackageStatus[];
const PRIORITIES = [{ v: 1, l: "1 — High" }, { v: 2, l: "2 — Normal" }, { v: 3, l: "3 — Low" }];

type Form = Partial<ShipSyncPackage>;
const EMPTY: Form = { status: "in_office", num_packages: 1, local_import: "Local" };

export function ShipSyncPackages({ data, reload }: { data: ShipSyncData; reload: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState<ShipSyncPackage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Form) => setForm((f) => ({ ...f, ...p }));

  const boats = useMemo(
    () => Array.from(new Set([
      ...data.destinations.map((d) => d.boat_name),
      ...data.packages.map((p) => p.boat_name).filter(Boolean) as string[],
    ])).sort(),
    [data],
  );

  const filtered = useMemo(() => data.packages.filter((p) => {
    if (statusFilter === "active" && ["delivered", "collected", "refused"].includes(p.status)) return false;
    if (statusFilter !== "active" && statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (![p.barcode, p.boat_name, p.package_owner, p.courier, p.description].join(" ").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [data.packages, statusFilter, search]);

  function openNew() { setForm(EMPTY); setPhoto(null); setOpen(true); }
  function openEdit(p: ShipSyncPackage) { setForm({ ...p }); setPhoto(null); setOpen(true); }

  async function save() {
    if (!form.barcode?.trim() && !form.boat_name?.trim()) { toast.error("Enter at least a barcode or boat name"); return; }
    setBusy(true);
    try {
      const id = form.id ?? crypto.randomUUID();
      let item_photo_url = form.item_photo_url ?? null;
      if (photo) item_photo_url = await uploadShipSyncImage(photo, `packages/${id}/item_${Date.now()}.jpg`);
      const payload: Form = {
        barcode: form.barcode?.trim() || null,
        boat_name: form.boat_name?.trim()?.toUpperCase() || null,
        package_owner: form.package_owner?.trim() || null,
        courier: form.courier?.trim() || null,
        num_packages: Number(form.num_packages ?? 1),
        priority: form.priority ?? null,
        local_import: form.local_import ?? null,
        warehouse_zone: form.warehouse_zone ?? null,
        status: form.status ?? "in_office",
        delivery_note_no: form.delivery_note_no?.trim() || null,
        received_by: form.received_by?.trim() || null,
        planned_delivery_date: form.planned_delivery_date || null,
        description: form.description?.trim() || null,
        boe_no: form.boe_no?.trim() || null,
        supplier: form.supplier?.trim() || null,
        origin: form.origin?.trim() || null,
        commodity: form.commodity?.trim() || null,
        weight_kg: form.weight_kg ?? null,
        item_photo_url,
      };
      if (form.id) await patchPackage(form.id, payload);
      else await createPackage(payload);
      toast.success(form.id ? "Package updated" : "Package checked in");
      setOpen(false);
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function quickStatus(p: ShipSyncPackage, status: PackageStatus) {
    try { await patchPackage(p.id, { status }); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Update failed"); }
  }

  async function confirmDelete() {
    if (!delTarget) return;
    try { await deletePackage(delTarget.id); toast.success("Package removed"); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
    finally { setDelTarget(null); }
  }

  return (
    <div className="flex h-full flex-col px-6 py-5">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search barcode, boat, owner, courier…" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="all">All</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[12px] text-muted-foreground">{filtered.length} of {data.packages.length}</span>
        <Button size="sm" onClick={openNew} className="ml-auto h-9 gap-1.5"><Plus className="h-4 w-4" /> Check in package</Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10"><tr className="border-b border-border bg-card text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {["Air waybill/tracking info", "Client", "Date Received", "Consignee", "Number of Packages", "Courier", "Shipment Type", "Delivery Note Number", "Driver", "Date Delivered", "Documents", "Zone", "Status", ""].map((h, i) => (
              <th key={`${h}-${i}`} className="px-3 py-2.5 whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={14} className="px-4 py-12 text-center text-sm text-muted-foreground">No packages match.</td></tr>
            ) : filtered.map((p) => {
              const note = data.notes.find((n) => n.id === p.delivery_note_id);
              const driver = data.drivers.find((d) => d.id === p.driver_id);
              const docs = p.documents ?? [];
              return (
                <tr key={p.id} onClick={() => openEdit(p)} className="group cursor-pointer border-b border-border/40 hover:bg-accent/20">
                  <td className="px-3 py-2.5 font-mono text-[12px] text-foreground whitespace-nowrap">{p.barcode ?? "—"}</td>
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">{p.boat_name ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">{fmtDate(p.received_at)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.package_owner ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground text-center">{p.num_packages ?? 1}</td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.courier ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.local_import ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">{p.delivery_note_no ?? note?.number ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{driver?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">{fmtDate(p.delivered_at)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {docs.length === 0 ? <span className="text-muted-foreground">—</span> : (
                      <div className="flex flex-wrap gap-1.5">
                        {docs.map((d, i) => (
                          <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" title={d.name}
                            className="inline-flex max-w-[120px] items-center gap-1 truncate rounded border border-border px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/5">
                            <FileText className="h-3 w-3 shrink-0" /> <span className="truncate">{d.name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.warehouse_zone ?? "—"}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Select value={p.status} onValueChange={(v) => quickStatus(p, v as PackageStatus)}>
                      <SelectTrigger className="h-7 w-[132px] border-none bg-transparent p-0 hover:bg-accent/40"><StatusBadge status={p.status} /></SelectTrigger>
                      <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive opacity-0 group-hover:opacity-100" onClick={() => setDelTarget(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Check-in / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Edit package" : "Check in package"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-1">
            <div className="space-y-1.5"><Label className="text-xs">Barcode / AWB</Label>
              <Input value={form.barcode ?? ""} onChange={(e) => set({ barcode: e.target.value })} className="h-9 font-mono" placeholder="Scan or type" autoFocus /></div>
            <div className="space-y-1.5"><Label className="text-xs">Boat / vessel</Label>
              <Input value={form.boat_name ?? ""} onChange={(e) => set({ boat_name: e.target.value })} list="ss-boats" className="h-9" placeholder="Vessel name" autoComplete="off" />
              <datalist id="ss-boats">{boats.map((b) => <option key={b} value={b} />)}</datalist></div>
            <div className="space-y-1.5"><Label className="text-xs">Package owner / receiver</Label>
              <Input value={form.package_owner ?? ""} onChange={(e) => set({ package_owner: e.target.value })} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Courier</Label>
              <Input value={form.courier ?? ""} onChange={(e) => set({ courier: e.target.value })} className="h-9" placeholder="DHL, Aramex…" /></div>
            <div className="grid grid-cols-3 gap-2 col-span-2">
              <div className="space-y-1.5"><Label className="text-xs"># Packages</Label>
                <Input type="number" min={1} value={form.num_packages ?? 1} onChange={(e) => set({ num_packages: Number(e.target.value) })} className="h-9" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Priority</Label>
                <Select value={String(form.priority ?? "")} onValueChange={(v) => set({ priority: v ? Number(v) : null })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.v} value={String(p.v)}>{p.l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Type</Label>
                <Select value={form.local_import ?? ""} onValueChange={(v) => set({ local_import: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="Local">Local</SelectItem><SelectItem value="Import">Import</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Warehouse zone</Label>
              <Select value={form.warehouse_zone ?? ""} onValueChange={(v) => set({ warehouse_zone: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Unracked" /></SelectTrigger>
                <SelectContent className="max-h-64">{ALL_ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs">Status</Label>
              <Select value={form.status ?? "in_office"} onValueChange={(v) => set({ status: v as PackageStatus })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs">Delivery note no.</Label>
              <Input value={form.delivery_note_no ?? ""} onChange={(e) => set({ delivery_note_no: e.target.value })} className="h-9" placeholder="e.g. 1962" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Received by (JLS)</Label>
              <Input value={form.received_by ?? ""} onChange={(e) => set({ received_by: e.target.value })} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Planned delivery</Label>
              <Input type="date" value={form.planned_delivery_date ?? ""} onChange={(e) => set({ planned_delivery_date: e.target.value })} className="h-9" /></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Description</Label>
              <Textarea rows={2} value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} className="resize-none text-sm" /></div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Item photo</Label>
              <div className="flex items-center gap-3">
                {(photo || form.item_photo_url) && (
                  <img src={photo ? URL.createObjectURL(photo) : form.item_photo_url!} alt="" className="h-14 w-14 rounded object-cover border border-border" />
                )}
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => fileRef.current?.click()}><Camera className="h-3.5 w-3.5" /> {photo || form.item_photo_url ? "Replace" : "Add photo"}</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {form.id ? "Save" : "Check in"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove package?</AlertDialogTitle>
            <AlertDialogDescription>{delTarget?.barcode ?? delTarget?.boat_name} will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
