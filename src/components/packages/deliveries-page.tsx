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
import { Plus, Pencil, Trash2, Loader2, Truck, Search, MapPin, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Delivery = {
  id: string;
  package_id: string | null;
  driver_id: string | null;
  yacht_id: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  status: string;
  priority: string;
  notes: string | null;
  created_at: string;
};

type Yacht = { id: string; vessel_name: string };
type Driver = { id: string; name: string };
type PackageRef = { id: string; tracking_number: string | null; description: string | null };

const STATUSES = [
  { value: "scheduled", label: "Scheduled", color: "bg-blue-500/15 text-blue-400", icon: Clock },
  { value: "in_progress", label: "In Progress", color: "bg-amber-500/15 text-amber-400", icon: Truck },
  { value: "completed", label: "Completed", color: "bg-emerald-500/15 text-emerald-400", icon: CheckCircle2 },
  { value: "failed", label: "Failed", color: "bg-destructive/15 text-destructive", icon: AlertCircle },
  { value: "cancelled", label: "Cancelled", color: "bg-muted text-muted-foreground", icon: AlertCircle },
];

const PRIORITIES = [
  { value: "low", label: "Low", color: "bg-muted text-muted-foreground" },
  { value: "normal", label: "Normal", color: "bg-blue-500/15 text-blue-400" },
  { value: "high", label: "High", color: "bg-amber-500/15 text-amber-400" },
  { value: "urgent", label: "Urgent", color: "bg-destructive/15 text-destructive" },
];

const EMPTY = {
  package_id: "__none", driver_id: "__none", yacht_id: "__none",
  scheduled_date: "", completed_date: "",
  pickup_address: "", dropoff_address: "",
  status: "scheduled", priority: "normal", notes: "",
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUSES.find((x) => x.value === status);
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s?.color ?? "bg-muted text-muted-foreground"}`}>
      {s?.label ?? status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITIES.find((x) => x.value === priority);
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p?.color ?? "bg-muted text-muted-foreground"}`}>
      {p?.label ?? priority}
    </span>
  );
}

export function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [packages, setPackages] = useState<PackageRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Delivery | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Delivery | null>(null);

  useEffect(() => {
    void load();
    void loadYachts();
    void loadDrivers();
    void loadPackages();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() => (supabase as any)
      .from("deliveries")
      .select("*")
      .order("scheduled_date", { ascending: false }));
    if (error) {
      if (String(error.message).includes("does not exist") || String(error.code) === "42P01") {
        setTableError(true);
      } else {
        toast.error(error.message);
      }
    } else {
      setDeliveries(data as Delivery[]);
      setTableError(false);
    }
    setLoading(false);
  }

  async function loadYachts() {
    const { data } = await fetchAllRows(() => supabase.from("yachts").select("id, vessel_name").order("vessel_name"));
    setYachts((data ?? []) as Yacht[]);
  }

  async function loadDrivers() {
    const { data } = await fetchAllRows(() => (supabase as any).from("delivery_drivers").select("id, name").order("name"));
    setDrivers((data ?? []) as Driver[]);
  }

  async function loadPackages() {
    const { data } = await fetchAllRows(() => (supabase as any)
      .from("packages")
      .select("id, tracking_number, description")
      .order("created_at", { ascending: false }));
    setPackages((data ?? []) as PackageRef[]);
  }

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(d: Delivery) {
    setEditing(d);
    setForm({
      package_id: d.package_id ?? "__none",
      driver_id: d.driver_id ?? "__none",
      yacht_id: d.yacht_id ?? "__none",
      scheduled_date: d.scheduled_date ?? "",
      completed_date: d.completed_date ?? "",
      pickup_address: d.pickup_address ?? "",
      dropoff_address: d.dropoff_address ?? "",
      status: d.status,
      priority: d.priority,
      notes: d.notes ?? "",
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.pickup_address.trim() && !form.dropoff_address.trim()) {
      toast.error("At least one address is required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        package_id: form.package_id === "__none" ? null : form.package_id,
        driver_id: form.driver_id === "__none" ? null : form.driver_id,
        yacht_id: form.yacht_id === "__none" ? null : form.yacht_id,
        scheduled_date: form.scheduled_date || null,
        completed_date: form.completed_date || null,
        pickup_address: form.pickup_address || null,
        dropoff_address: form.dropoff_address || null,
        status: form.status,
        priority: form.priority,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await (supabase as any).from("deliveries").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Delivery updated");
      } else {
        const { error } = await (supabase as any).from("deliveries").insert([payload]);
        if (error) throw error;
        toast.success("Delivery added");
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
    const { error } = await (supabase as any).from("deliveries").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Delivery removed"); await load(); }
    setDeleteTarget(null);
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const filtered = useMemo(() => {
    let list = deliveries;
    if (statusFilter !== "all") list = list.filter((d) => d.status === statusFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      const driverMap = Object.fromEntries(drivers.map((d) => [d.id, d.name]));
      const yachtMap = Object.fromEntries(yachts.map((y) => [y.id, y.vessel_name]));
      list = list.filter((d) =>
        [d.pickup_address, d.dropoff_address, d.notes, driverMap[d.driver_id ?? ""], yachtMap[d.yacht_id ?? ""]].some(
          (v) => String(v ?? "").toLowerCase().includes(s),
        ),
      );
    }
    return list;
  }, [deliveries, statusFilter, q, drivers, yachts]);

  const driverMap = Object.fromEntries(drivers.map((d) => [d.id, d.name]));
  const yachtMap = Object.fromEntries(yachts.map((y) => [y.id, y.vessel_name]));

  const stats = {
    total: deliveries.length,
    scheduled: deliveries.filter((d) => d.status === "scheduled").length,
    inProgress: deliveries.filter((d) => d.status === "in_progress").length,
    completed: deliveries.filter((d) => d.status === "completed").length,
  };

  if (tableError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Truck className="h-12 w-12 text-muted-foreground/40" />
        <div>
          <p className="font-semibold text-sm">Deliveries table not set up</p>
          <p className="text-xs text-muted-foreground mt-1">
            Apply migration <code>20260523000004_delivery_drivers.sql</code> in the Supabase Dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <h1 className="font-display text-base font-semibold">Deliveries / Route</h1>
          <span className="text-xs text-muted-foreground">({deliveries.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 w-44 pl-8 text-xs" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openNew} size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add Delivery
          </Button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 border-b border-border bg-card/20 px-5 py-3">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Scheduled", value: stats.scheduled, color: "text-blue-400" },
          { label: "In Progress", value: stats.inProgress, color: "text-amber-400" },
          { label: "Completed", value: stats.completed, color: "text-emerald-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card/60 px-4 py-2">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Truck className="h-10 w-10 opacity-30" />
            <p className="text-sm">{q || statusFilter !== "all" ? "No deliveries match the filters." : "No deliveries yet."}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["Date", "Pickup", "Dropoff", "Yacht", "Driver", "Priority", "Status", ""].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                      {d.scheduled_date ? new Date(d.scheduled_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-3 py-1.5 max-w-[160px]">
                      {d.pickup_address ? (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{d.pickup_address}</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5 max-w-[160px]">
                      {d.dropoff_address ? (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 text-primary shrink-0" />
                          <span className="truncate">{d.dropoff_address}</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{d.yacht_id ? yachtMap[d.yacht_id] ?? "—" : "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{d.driver_id ? driverMap[d.driver_id] ?? "—" : "—"}</td>
                    <td className="px-3 py-1.5"><PriorityBadge priority={d.priority} /></td>
                    <td className="px-3 py-1.5"><StatusBadge status={d.status} /></td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(d)} className="h-7 w-7 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(d)} className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive">
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Delivery</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Driver</Label>
                <Select value={form.driver_id} onValueChange={(v) => setForm((f) => ({ ...f, driver_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Yacht</Label>
                <Select value={form.yacht_id} onValueChange={(v) => setForm((f) => ({ ...f, yacht_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select yacht" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {yachts.map((y) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Pickup Address</Label>
              <Input value={form.pickup_address} onChange={set("pickup_address")} placeholder="e.g. Dubai Marina, Gate 3" />
            </div>
            <div className="space-y-1.5">
              <Label>Dropoff Address</Label>
              <Input value={form.dropoff_address} onChange={set("dropoff_address")} placeholder="e.g. Abu Dhabi Marina, Berth 12" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Scheduled Date</Label>
                <Input type="date" value={form.scheduled_date} onChange={set("scheduled_date")} />
              </div>
              <div className="space-y-1.5">
                <Label>Completed Date</Label>
                <Input type="date" value={form.completed_date} onChange={set("completed_date")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Linked Package</Label>
              <Select value={form.package_id} onValueChange={(v) => setForm((f) => ({ ...f, package_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Link to package (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {packages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.tracking_number ?? p.description ?? p.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={set("notes")} placeholder="Any special instructions…" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleSave} disabled={busy} className="gap-1.5">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save Changes" : "Add Delivery"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove delivery?</AlertDialogTitle>
            <AlertDialogDescription>This delivery record will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
