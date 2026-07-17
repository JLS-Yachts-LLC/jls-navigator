import { useMemo, useState } from "react";
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
import { Plus, Search, Loader2, Trash2, Pencil, MapPin } from "lucide-react";
import { saveDestination, deleteDestination } from "@/lib/shipsync/data";
import type { ShipSyncDestination } from "@/lib/shipsync/model";
import type { ShipSyncData } from "@/components/shipsync-page";

const CATEGORIES = ["Hotel", "Marina", "Supplier", "Airport", "Office", "Other"];
type Form = { id?: string; name: string; category: string; address: string; notes: string };
const EMPTY: Form = { name: "", category: "Hotel", address: "", notes: "" };

/** Manage ad-hoc pickup / drop-off locations (hotels, marinas, suppliers…).
 *  Stored as type='location' destinations so they appear in the check-in picker
 *  alongside vessels and can be routed/geocoded like any destination. */
export function ShipSyncLocations({ data, reload }: { data: ShipSyncData; reload: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState<ShipSyncDestination | null>(null);

  const locations = useMemo(
    () => data.destinations
      .filter((d) => d.type === "location")
      .filter((d) => {
        const s = search.trim().toLowerCase();
        return !s || [d.boat_name, d.category, d.address, d.notes].filter(Boolean).join(" ").toLowerCase().includes(s);
      }),
    [data.destinations, search],
  );

  function openNew() { setForm(EMPTY); setOpen(true); }
  function openEdit(d: ShipSyncDestination) {
    setForm({ id: d.id, name: d.boat_name, category: d.category ?? "Other", address: d.address ?? "", notes: d.notes ?? "" });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Give the location a name"); return; }
    setBusy(true);
    try {
      await saveDestination({
        boat_name: form.name.trim(),
        type: "location",
        category: form.category,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        yacht_id: null,
      });
      toast.success(form.id ? "Location updated" : "Location added");
      setOpen(false); setForm(EMPTY);
      await reload();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!delTarget) return;
    setBusy(true);
    try {
      await deleteDestination(delTarget.id);
      toast.success("Location removed");
      setDelTarget(null);
      await reload();
    } catch (e: any) { toast.error(e.message ?? "Delete failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search locations…" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <Button size="sm" onClick={openNew} className="ml-auto h-9 gap-1.5"><Plus className="h-4 w-4" /> Add location</Button>
      </div>

      {locations.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
          <MapPin className="mb-3 h-7 w-7 text-muted-foreground/40" />
          <p className="font-semibold">No locations yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Add hotels, marinas, suppliers or other pickup/drop-off points. They'll be selectable when checking a package in.</p>
          <Button onClick={openNew} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> Add location</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((d) => (
            <div key={d.id} className="group rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><MapPin className="h-4 w-4 text-primary/80" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{d.boat_name}</span>
                    {d.category && <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{d.category}</span>}
                  </div>
                  {d.address && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.address}</div>}
                  {d.notes && <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/70">{d.notes}</div>}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end gap-1 border-t border-border/40 pt-2">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive" onClick={() => setDelTarget(d)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? "Edit location" : "Add location"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-9" placeholder="e.g. Atlantis The Palm" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Textarea rows={2} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="resize-none text-sm" placeholder="Full address (used for routing / maps)" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="h-9" placeholder="e.g. Deliver to concierge, ask for…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {form.id ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => { if (!o) setDelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove location?</AlertDialogTitle>
            <AlertDialogDescription>“{delTarget?.boat_name}” will be removed from the destination list. Packages already checked in against it are unaffected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmDelete(); }} disabled={busy} className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
