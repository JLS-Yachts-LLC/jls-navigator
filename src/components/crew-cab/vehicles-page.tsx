import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, Car, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Vehicle = {
  id: string;
  make: string;
  model: string;
  year: number | null;
  registration: string | null;
  color: string | null;
  capacity: number;
  mileage: number;
  status: string;
  insurance_expiry: string | null;
  notes: string | null;
  last_lat: number | null;
  last_lon: number | null;
  last_location_at: string | null;
  last_status: string | null;
  last_driver_name: string | null;
};

function relTime(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function LiveLocation({ v }: { v: Vehicle }) {
  if (v.last_lat == null || v.last_lon == null) return <span className="text-muted-foreground/40">—</span>;
  const fresh = v.last_location_at ? (Date.now() - new Date(v.last_location_at).getTime()) < 30 * 60000 : false;
  return (
    <a
      href={`https://www.google.com/maps?q=${v.last_lat},${v.last_lon}`}
      target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1.5 hover:underline"
      title={v.last_driver_name ? `Driver: ${v.last_driver_name}` : undefined}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${fresh ? "bg-emerald-500" : "bg-slate-400"}`} />
      <span className="text-foreground/80">{v.last_status ?? "Tracked"}</span>
      <span className="text-muted-foreground">{relTime(v.last_location_at)}</span>
    </a>
  );
}

const EMPTY = {
  make: "", model: "", year: "", registration: "", color: "",
  capacity: "4", mileage: "0", status: "available", insurance_expiry: "", notes: "",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: "bg-emerald-500/15 text-emerald-400",
    in_use: "bg-blue-500/15 text-blue-400",
    maintenance: "bg-amber-500/15 text-amber-400",
  };
  const label: Record<string, string> = {
    available: "Available", in_use: "In Use", maintenance: "Maintenance",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {label[status] ?? status}
    </span>
  );
}

/** Returns days until date (negative = past). null if no date. */
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today.getTime()) / (1000 * 60 * 60 * 24));
}

function InsuranceBadge({ expiry }: { expiry: string | null }) {
  const days = daysUntil(expiry);
  if (days === null) return <span className="text-muted-foreground">—</span>;

  let cls = "text-foreground/80";
  let icon = null;
  if (days < 0) {
    cls = "text-destructive font-semibold";
    icon = <AlertTriangle className="h-3 w-3 inline mr-0.5" />;
  } else if (days <= 30) {
    cls = "text-warning font-semibold";
    icon = <AlertTriangle className="h-3 w-3 inline mr-0.5" />;
  }
  return (
    <span className={cls}>
      {icon}{expiry}
      {days < 0
        ? <span className="ml-1 text-[10px] opacity-80">(expired)</span>
        : days <= 30
          ? <span className="ml-1 text-[10px] opacity-80">({days}d)</span>
          : null}
    </span>
  );
}

export function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() => (supabase as any).from("crew_vehicles").select("*").order("make"));
    if (error) toast.error(error.message);
    else setVehicles(data as Vehicle[]);
    setLoading(false);
  }

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm({
      make: v.make, model: v.model, year: v.year ? String(v.year) : "",
      registration: v.registration ?? "", color: v.color ?? "",
      capacity: String(v.capacity), mileage: String(v.mileage),
      status: v.status, insurance_expiry: v.insurance_expiry ?? "", notes: v.notes ?? "",
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.make.trim() || !form.model.trim()) { toast.error("Make and Model are required"); return; }
    setBusy(true);
    try {
      const payload = {
        make: form.make.trim(), model: form.model.trim(),
        year: form.year ? Number(form.year) : null,
        registration: form.registration || null, color: form.color || null,
        capacity: Number(form.capacity) || 4, mileage: Number(form.mileage) || 0,
        status: form.status,
        insurance_expiry: form.insurance_expiry || null,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await (supabase as any).from("crew_vehicles").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Vehicle updated");
      } else {
        const { error } = await (supabase as any).from("crew_vehicles").insert([payload]);
        if (error) throw error;
        toast.success("Vehicle added");
      }
      setOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from("crew_vehicles").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Vehicle removed"); await load(); }
    setDeleteTarget(null);
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const filtered = useMemo(() => {
    if (!q.trim()) return vehicles;
    const s = q.toLowerCase();
    return vehicles.filter((v) =>
      [v.make, v.model, v.registration, v.color]
        .some((val) => String(val ?? "").toLowerCase().includes(s)),
    );
  }, [vehicles, q]);

  // Insurance expiry warning count
  const expiryWarnings = useMemo(() =>
    vehicles.filter((v) => { const d = daysUntil(v.insurance_expiry); return d !== null && d <= 30; }).length,
  [vehicles]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 text-primary" />
          <h1 className="font-display text-base font-semibold">Vehicles</h1>
          <span className="text-xs text-muted-foreground">({vehicles.length})</span>
          {expiryWarnings > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
              <AlertTriangle className="h-3 w-3" /> {expiryWarnings} insurance expiring
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search vehicles…"
              className="h-8 w-52 pl-8 text-xs"
            />
          </div>
          <Button onClick={openNew} size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add Vehicle
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Car className="h-10 w-10 opacity-30" />
            <p className="text-sm">{q ? `No vehicles matching "${q}"` : "No vehicles yet. Add your first vehicle."}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-xs min-w-[1040px]">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["Make", "Model", "Year", "Registration", "Live Location", "Color", "Capacity", "Mileage", "Insurance Expiry", "Status", ""].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-1.5 font-medium text-sm">{v.make}</td>
                    <td className="px-3 py-1.5">{v.model}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{v.year ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground font-mono">{v.registration ?? "—"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap"><LiveLocation v={v} /></td>
                    <td className="px-3 py-1.5 text-muted-foreground">{v.color ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{v.capacity}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{v.mileage?.toLocaleString()} km</td>
                    <td className="px-3 py-1.5"><InsuranceBadge expiry={v.insurance_expiry} /></td>
                    <td className="px-3 py-1.5"><StatusBadge status={v.status} /></td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(v)} className="h-7 w-7 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(v)}
                          className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Vehicle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Make <span className="text-destructive">*</span></Label><Input value={form.make} onChange={set("make")} placeholder="e.g. Toyota" /></div>
              <div className="space-y-1.5"><Label>Model <span className="text-destructive">*</span></Label><Input value={form.model} onChange={set("model")} placeholder="e.g. Land Cruiser" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Year</Label><Input type="number" value={form.year} onChange={set("year")} placeholder="2024" /></div>
              <div className="space-y-1.5"><Label>Registration</Label><Input value={form.registration} onChange={set("registration")} placeholder="DXB 12345" /></div>
              <div className="space-y-1.5"><Label>Color</Label><Input value={form.color} onChange={set("color")} placeholder="White" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Capacity</Label><Input type="number" value={form.capacity} onChange={set("capacity")} /></div>
              <div className="space-y-1.5"><Label>Mileage (km)</Label><Input type="number" value={form.mileage} onChange={set("mileage")} /></div>
              <div className="space-y-1.5"><Label>Insurance Expiry</Label><Input type="date" value={form.insurance_expiry} onChange={set("insurance_expiry")} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="in_use">In Use</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={set("notes")} placeholder="Any notes…" /></div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleSave} disabled={busy} className="gap-1.5">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save Changes" : "Add Vehicle"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.make} {deleteTarget?.model}</strong> will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
