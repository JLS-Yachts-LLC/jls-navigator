import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Ship, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ItYacht = {
  id: string;
  name: string;
  vessel_type: string | null;
  flag: string | null;
  imo: string | null;
  owner: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
};

const EMPTY = { name: "", vessel_type: "", flag: "", imo: "", owner: "", notes: "", active: true };

export function ItYachtsPage() {
  const [rows, setRows] = useState<ItYacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ItYacht | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ItYacht | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() => (supabase as any).from("it_yachts").select("*").order("name"));
    if (error) toast.error(error.message);
    else setRows((data ?? []) as ItYacht[]);
    setLoading(false);
  }

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(y: ItYacht) {
    setEditing(y);
    setForm({ name: y.name, vessel_type: y.vessel_type ?? "", flag: y.flag ?? "", imo: y.imo ?? "", owner: y.owner ?? "", notes: y.notes ?? "", active: y.active });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Yacht name is required"); return; }
    setBusy(true);
    const payload: any = {
      name: form.name.trim(), vessel_type: form.vessel_type.trim() || null, flag: form.flag.trim() || null,
      imo: form.imo.trim() || null, owner: form.owner.trim() || null, notes: form.notes.trim() || null,
      active: form.active, updated_at: new Date().toISOString(),
    };
    const db = supabase as any;
    const { error } = editing
      ? await db.from("it_yachts").update(payload).eq("id", editing.id)
      : await db.from("it_yachts").insert([payload]);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Yacht updated" : "Yacht added");
    setOpen(false);
    void load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from("it_yachts").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Yacht removed"); void load(); }
    setDeleteTarget(null);
  }

  const filtered = useMemo(() => rows.filter(y => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [y.name, y.vessel_type, y.flag, y.imo, y.owner].filter(Boolean).join(" ").toLowerCase().includes(s);
  }), [rows, q]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Yacht IT Solutions</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight flex items-center gap-2"><Ship className="h-5 w-5 text-primary" /> IT Yachts</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary/70" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search yachts…" className="h-9 w-56 pl-8 text-sm border-primary/30" />
          </div>
          <Button size="sm" onClick={openNew} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm"><Plus className="h-3.5 w-3.5" /> Add Yacht</Button>
        </div>
      </header>

      <div className="flex items-center gap-4 border-b border-border/40 bg-muted/10 px-6 py-2 text-xs text-muted-foreground">
        <span><strong className="text-foreground">{rows.filter(r => r.active).length}</strong> active</span>
        <span className="ml-auto">{filtered.length} of {rows.length}</span>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <Ship className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-display text-base font-semibold">{q ? `No yachts match "${q}"` : "No IT yachts yet"}</p>
            <p className="text-sm text-muted-foreground mt-1">Register yachts managed by Yacht IT that aren't in the main fleet.</p>
            {!q && <Button onClick={openNew} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> Add First Yacht</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Yacht", "Type", "Flag", "IMO", "Owner", "Status", "Actions"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(y => (
                  <tr key={y.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3 font-semibold">{y.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{y.vessel_type ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{y.flag ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{y.imo ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{y.owner ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", y.active ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400")}>
                        {y.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(y)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleteTarget(y)} className="rounded p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition"><Trash2 className="h-3.5 w-3.5" /></button>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Yacht" : "Add Yacht"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Yacht Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Plvs Vltra" className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Vessel Type</Label><Input value={form.vessel_type} onChange={e => setForm(f => ({ ...f, vessel_type: e.target.value }))} placeholder="Motor Yacht" className="h-9" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Flag</Label><Input value={form.flag} onChange={e => setForm(f => ({ ...f, flag: e.target.value }))} placeholder="Cayman Islands" className="h-9" /></div>
              <div className="space-y-1.5"><Label className="text-xs">IMO No.</Label><Input value={form.imo} onChange={e => setForm(f => ({ ...f, imo: e.target.value }))} className="h-9" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Owner</Label><Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} className="h-9" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" /></div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="h-4 w-4" style={{ accentColor: "var(--primary)" }} />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save Changes" : "Add Yacht"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove yacht?</AlertDialogTitle>
            <AlertDialogDescription><strong>{deleteTarget?.name}</strong> will be removed from the IT Yachts registry.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
