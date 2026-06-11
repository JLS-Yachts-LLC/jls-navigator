import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
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
import {
  Plus, Pencil, Trash2, Loader2, Package, Search, Truck, CheckCircle2, Clock, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

type PackageRow = {
  id: string;
  yacht_id: string | null;
  tracking_number: string | null;
  carrier: string | null;
  description: string | null;
  sender_name: string | null;
  recipient_name: string | null;
  received_date: string | null;
  delivered_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

type Yacht = { id: string; vessel_name: string };

const STATUSES = [
  { value: "received", label: "Received", color: "bg-blue-500/15 text-blue-400" },
  { value: "in_transit", label: "In Transit", color: "bg-amber-500/15 text-amber-400" },
  { value: "out_for_delivery", label: "Out for Delivery", color: "bg-orange-500/15 text-orange-400" },
  { value: "delivered", label: "Delivered", color: "bg-emerald-500/15 text-emerald-400" },
  { value: "returned", label: "Returned", color: "bg-muted text-muted-foreground" },
  { value: "lost", label: "Lost", color: "bg-destructive/15 text-destructive" },
];

const CARRIERS = ["DHL", "FedEx", "UPS", "Aramex", "Emirates Post", "DHL Express", "TNT", "Other"];

const EMPTY = {
  yacht_id: "__none",
  tracking_number: "", carrier: "", description: "",
  sender_name: "", recipient_name: "",
  received_date: "", delivered_date: "",
  status: "received", notes: "",
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUSES.find((x) => x.value === status);
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s?.color ?? "bg-muted text-muted-foreground"}`}>
      {s?.label ?? status}
    </span>
  );
}

/** SQL to run in Supabase if table doesn't exist yet */
const SETUP_SQL = `-- Run this in Supabase SQL Editor if packages table doesn't exist:
create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid references yachts(id) on delete set null,
  tracking_number text,
  carrier text,
  description text,
  sender_name text,
  recipient_name text,
  received_date date,
  delivered_date date,
  status text not null default 'received',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table packages enable row level security;
create policy "auth users can manage packages" on packages
  for all to authenticated using (true) with check (true);
create trigger set_packages_updated_at before update on packages
  for each row execute function set_updated_at();`;

export function PackagesPage() {
  const { user } = useAuth();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PackageRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PackageRow | null>(null);
  const [sqlVisible, setSqlVisible] = useState(false);

  useEffect(() => { void load(); void loadYachts(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("packages")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      if (String(error.message).includes("does not exist") || String(error.code) === "42P01") {
        setTableError(true);
      } else {
        toast.error(error.message);
      }
    } else {
      setPackages(data as PackageRow[]);
      setTableError(false);
    }
    setLoading(false);
  }

  async function loadYachts() {
    const { data } = await fetchAllRows(() => supabase.from("yachts").select("id, vessel_name").order("vessel_name"));
    setYachts((data ?? []) as Yacht[]);
  }

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(p: PackageRow) {
    setEditing(p);
    setForm({
      yacht_id: p.yacht_id ?? "__none",
      tracking_number: p.tracking_number ?? "",
      carrier: p.carrier ?? "",
      description: p.description ?? "",
      sender_name: p.sender_name ?? "",
      recipient_name: p.recipient_name ?? "",
      received_date: p.received_date ?? "",
      delivered_date: p.delivered_date ?? "",
      status: p.status,
      notes: p.notes ?? "",
    });
    setOpen(true);
  }

  async function handleSave() {
    setBusy(true);
    try {
      const payload = {
        yacht_id: form.yacht_id === "__none" ? null : form.yacht_id,
        tracking_number: form.tracking_number || null,
        carrier: form.carrier || null,
        description: form.description || null,
        sender_name: form.sender_name || null,
        recipient_name: form.recipient_name || null,
        received_date: form.received_date || null,
        delivered_date: form.delivered_date || null,
        status: form.status,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await (supabase as any).from("packages").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Package updated");
      } else {
        const { error } = await (supabase as any)
          .from("packages")
          .insert([{ ...payload, created_by: user?.id }]);
        if (error) throw error;
        toast.success("Package logged");
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
    const { error } = await (supabase as any).from("packages").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Package removed"); await load(); }
    setDeleteTarget(null);
  }

  const yachtName = (id: string | null) => yachts.find((y) => y.id === id)?.vessel_name ?? "—";

  const stats = useMemo(() => ({
    total: packages.length,
    inTransit: packages.filter((p) => ["received", "in_transit", "out_for_delivery"].includes(p.status)).length,
    delivered: packages.filter((p) => p.status === "delivered").length,
    issues: packages.filter((p) => ["returned", "lost"].includes(p.status)).length,
  }), [packages]);

  const filtered = useMemo(() => {
    let rows = packages;
    if (statusFilter !== "all") rows = rows.filter((p) => p.status === statusFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      rows = rows.filter((p) =>
        [p.tracking_number, p.carrier, p.sender_name, p.recipient_name, p.description,
          p.yacht_id ? yachtName(p.yacht_id) : ""]
          .some((v) => String(v ?? "").toLowerCase().includes(s)),
      );
    }
    return rows;
  }, [packages, statusFilter, q]);

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // ── Table not set up yet ──────────────────────────────────────────────────
  if (tableError) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card/40 px-5 py-3">
          <div>
            <div className="text-xs text-muted-foreground">Port & Operations / Packages</div>
            <h1 className="font-display text-base font-semibold tracking-tight">ShipSync</h1>
          </div>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <Package className="h-12 w-12 text-muted-foreground/40" />
          <h2 className="font-display text-lg font-semibold">Database table not set up yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            The <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">packages</code> table
            doesn't exist in your Supabase database. Run the SQL below in the{" "}
            <strong>Supabase SQL Editor</strong> to enable this module.
          </p>
          <Button variant="outline" size="sm" onClick={() => setSqlVisible((v) => !v)}>
            {sqlVisible ? "Hide SQL" : "Show SQL to run"}
          </Button>
          {sqlVisible && (
            <pre className="w-full max-w-2xl overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-left text-xs text-muted-foreground">
              {SETUP_SQL}
            </pre>
          )}
          <Button onClick={load} variant="default" size="sm">Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-5 py-3">
        <div>
          <div className="text-xs text-muted-foreground">Port & Operations / Packages</div>
          <h1 className="font-display text-base font-semibold tracking-tight">ShipSync</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search packages…"
              className="h-8 w-56 pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Log Package
          </Button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 px-5 py-3">
        <StatCard label="Total" value={stats.total} icon={Package} accent="text-primary" />
        <StatCard label="Active" value={stats.inTransit} icon={Truck} accent="text-blue-400" />
        <StatCard label="Delivered" value={stats.delivered} icon={CheckCircle2} accent="text-success" />
        <StatCard label="Issues" value={stats.issues} icon={AlertTriangle} accent="text-destructive" />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-5 pb-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
            <Package className="h-10 w-10 text-muted-foreground/60" />
            <h3 className="mt-3 font-display text-lg font-semibold">
              {q || statusFilter !== "all" ? "No matching packages" : "No packages logged yet"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {q || statusFilter !== "all"
                ? "Try adjusting your search or filter."
                : "Log your first package to get started."}
            </p>
            {!q && statusFilter === "all" && (
              <Button onClick={openNew} className="mt-4 gap-1.5">
                <Plus className="h-4 w-4" /> Log Package
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="min-w-full text-xs">
              <thead className="bg-card/95 backdrop-blur border-b border-border">
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Tracking #</th>
                  <th className="px-3 py-2 text-left font-medium">Carrier</th>
                  <th className="px-3 py-2 text-left font-medium">Yacht</th>
                  <th className="px-3 py-2 text-left font-medium">Sender</th>
                  <th className="px-3 py-2 text-left font-medium">Recipient</th>
                  <th className="px-3 py-2 text-left font-medium">Received</th>
                  <th className="px-3 py-2 text-left font-medium">Delivered</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 transition hover:bg-accent/30">
                    <td className="px-3 py-1.5 font-mono font-medium">{p.tracking_number ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{p.carrier ?? "—"}</td>
                    <td className="px-3 py-1.5">{yachtName(p.yacht_id)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{p.sender_name ?? "—"}</td>
                    <td className="px-3 py-1.5">{p.recipient_name ?? "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{p.received_date ?? "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{p.delivered_date ?? "—"}</td>
                    <td className="px-3 py-1.5"><StatusBadge status={p.status} /></td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive"
                          onClick={() => setDeleteTarget(p)}
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

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Package" : "Log Package"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tracking Number</Label>
              <Input value={form.tracking_number} onChange={setF("tracking_number")} placeholder="1Z999AA10123456784" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Carrier</Label>
              <Select value={form.carrier} onValueChange={(v) => setForm((f) => ({ ...f, carrier: v }))}>
                <SelectTrigger><SelectValue placeholder="Select carrier" /></SelectTrigger>
                <SelectContent>
                  {CARRIERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
              <Label>Sender Name</Label>
              <Input value={form.sender_name} onChange={setF("sender_name")} placeholder="Company or person" />
            </div>
            <div className="space-y-1.5">
              <Label>Recipient Name</Label>
              <Input value={form.recipient_name} onChange={setF("recipient_name")} placeholder="Who it's for" />
            </div>
            <div className="space-y-1.5">
              <Label>Date Received</Label>
              <Input type="date" value={form.received_date} onChange={setF("received_date")} />
            </div>
            <div className="space-y-1.5">
              <Label>Date Delivered</Label>
              <Input type="date" value={form.delivered_date} onChange={setF("delivered_date")} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={setF("description")} placeholder="What's in the package?" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={setF("notes")} placeholder="Any additional notes…" />
            </div>
            <div className="col-span-2 flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleSave} disabled={busy} className="gap-1.5">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save Changes" : "Log Package"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete package?</AlertDialogTitle>
            <AlertDialogDescription>
              Tracking <strong>{deleteTarget?.tracking_number ?? "record"}</strong> will be permanently removed.
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

function StatCard({
  label, value, icon: Icon, accent,
}: {
  label: string; value: number;
  icon: React.ComponentType<{ className?: string }>; accent: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`font-display text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      </div>
      <Icon className={`h-7 w-7 ${accent} opacity-60`} />
    </div>
  );
}
