import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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
import { KeyRound, Plus, Search, Pencil, Trash2, Loader2, AlertTriangle, Ship } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type License = {
  id: string;
  yacht_id: string | null;
  vessel_name: string | null;
  license_name: string;
  start_date: string | null;
  expiration_date: string | null;
  invoice_date: string | null;
  license_key: string | null;
  proof_document: string | null;
  company_contacts: string | null;
  party_responsible: string | null;
  configuration_item: string | null;
  user_license_count: number | null;
  notes: string | null;
  archived: boolean;
};
type Yacht = { id: string; vessel_name: string };

const EMPTY = {
  yacht_id: "", vessel_name: "", license_name: "", start_date: "", expiration_date: "",
  invoice_date: "", license_key: "", proof_document: "", company_contacts: "",
  party_responsible: "", configuration_item: "", user_license_count: "", notes: "", archived: false,
};

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const t = new Date(d + "T00:00:00").getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((t - today.getTime()) / 86400000);
}
const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

function ExpiryBadge({ date }: { date: string | null }) {
  const days = daysUntil(date);
  if (days === null) return <span className="text-muted-foreground/40">—</span>;
  let cls = "text-foreground/80"; let suffix = "";
  if (days < 0) { cls = "text-destructive font-semibold"; suffix = " (expired)"; }
  else if (days <= 30) { cls = "text-amber-500 font-semibold"; suffix = ` (${days}d)`; }
  return <span className={cls}>{(days < 0 || days <= 30) && <AlertTriangle className="mr-0.5 inline h-3 w-3" />}{fmtDate(date)}{suffix}</span>;
}

export function LicensingPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<License[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [vessel, setVessel] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<License | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<License | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [lRes, yRes] = await Promise.all([
      (supabase as any).from("yacht_licenses").select("*").order("expiration_date", { ascending: true, nullsFirst: false }),
      supabase.from("yachts").select("id, vessel_name").order("vessel_name"),
    ]);
    if (lRes.error) toast.error(lRes.error.message);
    setRows((lRes.data ?? []) as License[]);
    setYachts((yRes.data ?? []) as Yacht[]);
    setLoading(false);
  }

  const yachtName = (id: string | null) => yachts.find(y => y.id === id)?.vessel_name ?? null;
  const vesselLabel = (r: License) => yachtName(r.yacht_id) || r.vessel_name || "—";

  // Distinct vessel labels for the filter.
  const vessels = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) { const v = vesselLabel(r); if (v !== "—") set.add(v); }
    return Array.from(set).sort();
  }, [rows, yachts]);

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(r: License) {
    setEditing(r);
    setForm({
      yacht_id: r.yacht_id ?? "", vessel_name: r.vessel_name ?? "", license_name: r.license_name,
      start_date: r.start_date ?? "", expiration_date: r.expiration_date ?? "", invoice_date: r.invoice_date ?? "",
      license_key: r.license_key ?? "", proof_document: r.proof_document ?? "", company_contacts: r.company_contacts ?? "",
      party_responsible: r.party_responsible ?? "", configuration_item: r.configuration_item ?? "",
      user_license_count: r.user_license_count != null ? String(r.user_license_count) : "", notes: r.notes ?? "", archived: r.archived,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.license_name.trim()) { toast.error("License / software name is required"); return; }
    setBusy(true);
    try {
      const payload: Record<string, any> = {
        yacht_id: form.yacht_id || null,
        vessel_name: form.vessel_name.trim() || null,
        license_name: form.license_name.trim(),
        start_date: form.start_date || null,
        expiration_date: form.expiration_date || null,
        invoice_date: form.invoice_date || null,
        license_key: form.license_key.trim() || null,
        proof_document: form.proof_document.trim() || null,
        company_contacts: form.company_contacts.trim() || null,
        party_responsible: form.party_responsible.trim() || null,
        configuration_item: form.configuration_item.trim() || null,
        user_license_count: form.user_license_count ? Number(form.user_license_count) : null,
        notes: form.notes.trim() || null,
        archived: form.archived,
        updated_at: new Date().toISOString(),
      };
      const db = supabase as any;
      if (editing) {
        const { error } = await db.from("yacht_licenses").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("License updated");
      } else {
        const { error } = await db.from("yacht_licenses").insert([{ ...payload, created_by: user?.id ?? null }]);
        if (error) throw error;
        toast.success("License added");
      }
      setOpen(false); void load();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from("yacht_licenses").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("License removed"); void load(); }
    setDeleteTarget(null);
  }

  const filtered = useMemo(() => rows.filter(r => {
    if (!showArchived && r.archived) return false;
    if (vessel !== "all" && vesselLabel(r) !== vessel) return false;
    if (q.trim()) {
      const hay = [r.license_name, r.license_key, r.configuration_item, r.company_contacts, r.party_responsible, vesselLabel(r)].join(" ").toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [rows, q, vessel, showArchived, yachts]);

  const expiringSoon = useMemo(() => rows.filter(r => { const d = daysUntil(r.expiration_date); return !r.archived && d !== null && d <= 30; }).length, [rows]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Yacht IT Solutions</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <KeyRound className="h-4 w-4 text-primary/80" /> Licensing
            <span className="text-sm font-normal text-muted-foreground">({rows.filter(r => !r.archived).length})</span>
            {expiringSoon > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                <AlertTriangle className="h-3 w-3" /> {expiringSoon} expiring ≤30d
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search licenses…" className="h-9 w-56 pl-8 text-sm" />
          </div>
          <Select value={vessel} onValueChange={setVessel}>
            <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="All Vessels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vessels</SelectItem>
              {vessels.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={openNew} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm"><Plus className="h-3.5 w-3.5" /> Add License</Button>
        </div>
      </header>

      <div className="flex items-center gap-4 border-b border-border/40 bg-muted/10 px-6 py-2 text-xs">
        <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
        </label>
        <span className="ml-auto text-muted-foreground">{filtered.length} of {rows.length}</span>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <KeyRound className="mb-3 h-7 w-7 text-muted-foreground/40" />
            <p className="font-display text-base font-semibold">{rows.length === 0 ? "No licenses yet" : "No licenses match"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Track software licenses, subscriptions and renewals per vessel.</p>
            {rows.length === 0 && <Button onClick={openNew} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> Add License</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
            <table className="w-full min-w-[1000px] text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                {["License / Software", "Vessel", "Start", "Expiration", "License Key", "Config Item", "Users", "Responsible", ""].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className={cn("border-b border-border/40 hover:bg-accent/20 transition-colors", r.archived && "opacity-50")}>
                    <td className="px-4 py-3 font-medium max-w-xs"><span className="line-clamp-2">{r.license_name}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Ship className="h-3 w-3" />{vesselLabel(r)}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtDate(r.start_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><ExpiryBadge date={r.expiration_date} /></td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">{r.license_key || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.configuration_item || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.user_license_count ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.party_responsible || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> {editing ? "Edit License" : "Add License"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-1 max-h-[70vh] overflow-y-auto pr-1">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">License / Software name <span className="text-destructive">*</span></Label>
              <Input value={form.license_name} onChange={e => setForm(f => ({ ...f, license_name: e.target.value }))} className="h-8" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vessel (fleet)</Label>
              <Select value={form.yacht_id || "__none"} onValueChange={v => setForm(f => ({ ...f, yacht_id: v === "__none" ? "" : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vessel name (if not in fleet)</Label>
              <Input value={form.vessel_name} onChange={e => setForm(f => ({ ...f, vessel_name: e.target.value }))} className="h-8" placeholder="e.g. M/Y Solaris" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expiration date</Label>
              <Input type="date" value={form.expiration_date} onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))} className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Invoice date</Label>
              <Input type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">User / seat count</Label>
              <Input type="number" value={form.user_license_count} onChange={e => setForm(f => ({ ...f, user_license_count: e.target.value }))} className="h-8" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">License key</Label>
              <Input value={form.license_key} onChange={e => setForm(f => ({ ...f, license_key: e.target.value }))} className="h-8 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Configuration item</Label>
              <Input value={form.configuration_item} onChange={e => setForm(f => ({ ...f, configuration_item: e.target.value }))} className="h-8" placeholder="e.g. esx-host-1.my-solaris.net" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Responsible for payment</Label>
              <Input value={form.party_responsible} onChange={e => setForm(f => ({ ...f, party_responsible: e.target.value }))} className="h-8" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Company contacts</Label>
              <Input value={form.company_contacts} onChange={e => setForm(f => ({ ...f, company_contacts: e.target.value }))} className="h-8" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Proof document</Label>
              <Input value={form.proof_document} onChange={e => setForm(f => ({ ...f, proof_document: e.target.value }))} className="h-8" placeholder="File name or link" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="resize-none text-sm" />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.archived} onChange={e => setForm(f => ({ ...f, archived: e.target.checked }))} /> Archived
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save Changes" : "Add License"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete license?</AlertDialogTitle>
            <AlertDialogDescription><strong>{deleteTarget?.license_name}</strong> will be permanently removed.</AlertDialogDescription>
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
