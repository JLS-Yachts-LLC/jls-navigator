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
import { Plus, Pencil, Trash2, Loader2, UserCircle2, Search } from "lucide-react";
import { toast } from "sonner";

type Driver = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_no: string | null;
  status: string;
  notes: string | null;
};

const EMPTY = { full_name: "", phone: "", email: "", license_no: "", status: "active", notes: "" };

function StatusBadge({ status }: { status: string }) {
  const cls = status === "active"
    ? "bg-emerald-500/15 text-emerald-400"
    : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status === "active" ? "Active" : "Inactive"}
    </span>
  );
}

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() => (supabase as any).from("crew_drivers").select("*").order("full_name"));
    if (error) toast.error(error.message);
    else setDrivers(data as Driver[]);
    setLoading(false);
  }

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(d: Driver) {
    setEditing(d);
    setForm({
      full_name: d.full_name,
      phone: d.phone ?? "",
      email: d.email ?? "",
      license_no: d.license_no ?? "",
      status: d.status,
      notes: d.notes ?? "",
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.full_name.trim()) { toast.error("Full name is required"); return; }
    setBusy(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        license_no: form.license_no || null,
        status: form.status,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await (supabase as any).from("crew_drivers").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Driver updated");
      } else {
        const { error } = await (supabase as any).from("crew_drivers").insert([payload]);
        if (error) throw error;
        toast.success("Driver added");
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
    const { error } = await (supabase as any).from("crew_drivers").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Driver removed"); await load(); }
    setDeleteTarget(null);
  }

  const filtered = useMemo(() => {
    if (!q.trim()) return drivers;
    const s = q.toLowerCase();
    return drivers.filter((d) =>
      [d.full_name, d.phone, d.email, d.license_no]
        .some((v) => String(v ?? "").toLowerCase().includes(s)),
    );
  }, [drivers, q]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <UserCircle2 className="h-4 w-4 text-primary" />
          <h1 className="font-display text-base font-semibold">Drivers</h1>
          <span className="text-xs text-muted-foreground">({drivers.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search drivers…"
              className="h-8 w-52 pl-8 text-xs"
            />
          </div>
          <Button onClick={openNew} size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add Driver
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
            <UserCircle2 className="h-10 w-10 opacity-30" />
            <p className="text-sm">{q ? `No drivers matching "${q}"` : "No drivers yet. Add your first driver."}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["Full Name", "Phone", "Email", "License No.", "Status", ""].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-1.5 font-medium text-sm">{d.full_name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{d.phone ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{d.email ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{d.license_no ?? "—"}</td>
                    <td className="px-3 py-1.5"><StatusBadge status={d.status} /></td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(d)} className="h-7 w-7 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(d)}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Driver</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Ahmed Al Mansouri" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+971 50 000 0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="driver@jls.ae" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>License No.</Label>
                <Input value={form.license_no} onChange={(e) => setForm((f) => ({ ...f, license_no: e.target.value }))} placeholder="DXB-123456" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes…" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleSave} disabled={busy} className="gap-1.5">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save Changes" : "Add Driver"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete driver?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.full_name}</strong> will be permanently removed. This cannot be undone.
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
