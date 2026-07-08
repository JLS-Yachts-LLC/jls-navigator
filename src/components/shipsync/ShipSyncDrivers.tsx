import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { saveDriver, deleteDriver } from "@/lib/shipsync/data";
import { WEEKDAYS, type ShipSyncDriver } from "@/lib/shipsync/model";
import type { ShipSyncData } from "@/components/shipsync-page";

type Form = Partial<ShipSyncDriver>;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Small Mon–Sun toggle row. */
function WorkDays({ value, onToggle }: { value: number[]; onToggle: (wd: number) => void }) {
  return (
    <div className="flex gap-1">
      {WEEKDAYS.map((label, wd) => {
        const on = value.includes(wd);
        return (
          <button key={wd} type="button" onClick={(e) => { e.stopPropagation(); onToggle(wd); }} title={label}
            className={`h-6 w-6 rounded text-[10px] font-semibold transition ${on ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-transparent text-muted-foreground/40 hover:bg-muted/40 hover:text-foreground"}`}>
            {label[0]}
          </button>
        );
      })}
    </div>
  );
}

export function ShipSyncDrivers({ data, reload }: { data: ShipSyncData; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>({ active: true });
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState<ShipSyncDriver | null>(null);
  const set = (p: Form) => setForm((f) => ({ ...f, ...p }));

  async function save() {
    if (!form.name?.trim()) { toast.error("Driver name is required"); return; }
    setBusy(true);
    try {
      await saveDriver({ id: form.id, name: form.name.trim(), email: form.email?.trim() || null, phone: form.phone?.trim() || null, vehicle: form.vehicle?.trim() || null, active: form.active ?? true, work_days: form.work_days ?? ALL_DAYS });
      toast.success(form.id ? "Driver updated" : "Driver added");
      setOpen(false); await reload();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); } finally { setBusy(false); }
  }
  /** Toggle a working day inline (saves immediately). */
  async function toggleDay(d: ShipSyncDriver, wd: number) {
    const cur = d.work_days ?? ALL_DAYS;
    const next = cur.includes(wd) ? cur.filter((x) => x !== wd) : [...cur, wd].sort((a, b) => a - b);
    try { await saveDriver({ id: d.id, work_days: next }); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  async function confirmDelete() {
    if (!delTarget) return;
    try { await deleteDriver(delTarget.id); toast.success("Driver removed"); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Delete failed"); } finally { setDelTarget(null); }
  }

  return (
    <div className="px-6 py-5">
      <div className="mb-3 flex items-center">
        <span className="text-[12px] text-muted-foreground">{data.drivers.length} driver{data.drivers.length === 1 ? "" : "s"}</span>
        <Button size="sm" className="ml-auto h-9 gap-1.5" onClick={() => { setForm({ active: true }); setOpen(true); }}><Plus className="h-4 w-4" /> Add driver</Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/40 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {["Name", "Email", "Phone", "Vehicle", "Working days", "Active", ""].map((h) => <th key={h} className="px-4 py-2.5">{h}</th>)}
          </tr></thead>
          <tbody>
            {data.drivers.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No drivers yet.</td></tr>
            ) : data.drivers.map((d) => (
              <tr key={d.id} className="group cursor-pointer border-b border-border/40 hover:bg-accent/20" onClick={() => { setForm({ ...d }); setOpen(true); }}>
                <td className="px-4 py-2.5 font-medium">{d.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.phone ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.vehicle ?? "—"}</td>
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <WorkDays value={d.work_days ?? ALL_DAYS} onToggle={(wd) => toggleDay(d, wd)} />
                </td>
                <td className="px-4 py-2.5">{d.active ? <span className="text-emerald-600 dark:text-emerald-400">Yes</span> : <span className="text-muted-foreground">No</span>}</td>
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setForm({ ...d }); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => setDelTarget(d)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form.id ? "Edit driver" : "Add driver"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} className="h-9" autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input value={form.email ?? ""} onChange={(e) => set({ email: e.target.value })} className="h-9" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} className="h-9" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5"><Label className="text-xs">Vehicle</Label><Input value={form.vehicle ?? ""} onChange={(e) => set({ vehicle: e.target.value })} className="h-9" /></div>
              <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={form.active ?? true} onChange={(e) => set({ active: e.target.checked })} /> Active</label>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Working days</Label>
              <WorkDays value={form.work_days ?? ALL_DAYS} onToggle={(wd) => {
                const cur = form.work_days ?? ALL_DAYS;
                set({ work_days: cur.includes(wd) ? cur.filter((x) => x !== wd) : [...cur, wd].sort((a, b) => a - b) });
              }} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove driver?</AlertDialogTitle>
            <AlertDialogDescription>{delTarget?.name} will be removed. Packages keep their record but lose the driver link.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
