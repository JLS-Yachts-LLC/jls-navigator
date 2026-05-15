import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  PERMIT_META, PERMIT_STATUSES, DMA_PHASES,
  type Permit, type PermitType, type PermitStatus,
  daysUntil, expiryVariant,
} from "@/lib/permit-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/status-pill";
import { Plus, Search, FileCheck2, Pencil, Trash2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Yacht = { id: string; vessel_name: string };

export function PermitsPage({ permitType }: { permitType: PermitType }) {
  const meta = PERMIT_META[permitType];
  const { user } = useAuth();
  const [rows, setRows] = useState<Permit[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Permit | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { void load(); void loadYachts(); }, [permitType]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("permits")
      .select("*")
      .eq("permit_type", permitType)
      .order("expiry_date", { ascending: true, nullsFirst: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Permit[]);
    setLoading(false);
  }
  async function loadYachts() {
    const { data } = await supabase.from("yachts").select("id, vessel_name").order("vessel_name");
    setYachts((data ?? []) as Yacht[]);
  }

  function startNew() { setEditing(null); setOpen(true); }
  function startEdit(p: Permit) { setEditing(p); setOpen(true); }

  async function remove(p: Permit) {
    if (!confirm(`Delete permit ${p.permit_number ?? ""}?`)) return;
    const { error } = await supabase.from("permits").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    void load();
  }

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    const yachtMap = new Map(yachts.map((y) => [y.id, y.vessel_name.toLowerCase()]));
    return rows.filter((r) =>
      [r.permit_number, r.holder_name, r.issuing_authority, r.notes, r.dma_phase, r.yacht_id ? yachtMap.get(r.yacht_id) ?? "" : ""]
        .some((v) => String(v ?? "").toLowerCase().includes(s)),
    );
  }, [rows, q, yachts]);

  const stats = useMemo(() => {
    const total = rows.length;
    let active = 0, expiring = 0, expired = 0;
    for (const r of rows) {
      const d = daysUntil(r.expiry_date);
      if (r.status === "expired" || (d !== null && d < 0)) expired++;
      else if (d !== null && d <= 30) expiring++;
      else if (r.status === "active") active++;
    }
    return { total, active, expiring, expired };
  }, [rows]);

  const yachtName = (id: string | null) => yachts.find((y) => y.id === id)?.vessel_name ?? "—";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-6 py-3">
        <div>
          <div className="text-xs text-muted-foreground">{meta.breadcrumb}</div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{meta.label}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-64 pl-8" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={startNew} className="h-9 gap-1.5">
                <Plus className="h-3.5 w-3.5" /> New permit
              </Button>
            </DialogTrigger>
            <PermitDialog
              permitType={permitType}
              yachts={yachts}
              editing={editing}
              userId={user?.id}
              onSaved={() => { setOpen(false); void load(); }}
            />
          </Dialog>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-3 px-6 py-4">
        <Stat label="Total" value={stats.total} icon={FileCheck2} accent="text-primary" />
        <Stat label="Active" value={stats.active} icon={CheckCircle2} accent="text-success" />
        <Stat label="Expiring ≤ 30d" value={stats.expiring} icon={Clock} accent="text-warning" />
        <Stat label="Expired" value={stats.expired} icon={AlertTriangle} accent="text-destructive" />
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
            <FileCheck2 className="h-10 w-10 text-muted-foreground/60" />
            <h3 className="mt-3 font-display text-lg font-semibold">No {meta.label.toLowerCase()} yet</h3>
            <p className="text-sm text-muted-foreground">Create the first record to get started.</p>
            <Button onClick={startNew} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> New permit</Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-card/95 backdrop-blur">
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Permit #</th>
                  <th className="px-3 py-2 text-left font-medium">Yacht</th>
                  <th className="px-3 py-2 text-left font-medium">Holder</th>
                  <th className="px-3 py-2 text-left font-medium">Authority</th>
                  {meta.showDmaPhase && <th className="px-3 py-2 text-left font-medium">Phase</th>}
                  <th className="px-3 py-2 text-left font-medium">Issued</th>
                  <th className="px-3 py-2 text-left font-medium">Expiry</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const days = daysUntil(r.expiry_date);
                  const variant = expiryVariant(days);
                  return (
                    <tr key={r.id} className="border-b border-border/50 transition hover:bg-accent/30">
                      <td className="px-3 py-2 font-medium tabular-nums">{r.permit_number ?? "—"}</td>
                      <td className="px-3 py-2">{yachtName(r.yacht_id)}</td>
                      <td className="px-3 py-2">{r.holder_name ?? "—"}</td>
                      <td className="px-3 py-2">{r.issuing_authority ?? "—"}</td>
                      {meta.showDmaPhase && <td className="px-3 py-2">{r.dma_phase ?? "—"}</td>}
                      <td className="px-3 py-2 tabular-nums">{r.issue_date ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">
                        <div className="flex items-center gap-2">
                          <span>{r.expiry_date ?? "—"}</span>
                          {days !== null && (
                            <span className={cn("pill", variant)}>
                              {days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => remove(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; accent: string }) {
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

function PermitDialog({
  permitType, yachts, editing, userId, onSaved,
}: {
  permitType: PermitType;
  yachts: Yacht[];
  editing: Permit | null;
  userId: string | undefined;
  onSaved: () => void;
}) {
  const meta = PERMIT_META[permitType];
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Partial<Permit>>(() => editing ?? { permit_type: permitType, status: "pending" });

  // Reset form when editing target changes
  useEffect(() => {
    setForm(editing ?? { permit_type: permitType, status: "pending" });
  }, [editing, permitType]);

  function set<K extends keyof Permit>(k: K, v: Permit[K] | string | null) {
    setForm((f) => ({ ...f, [k]: v as Permit[K] }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setBusy(true);
    try {
      const payload = {
        permit_type: permitType,
        yacht_id: form.yacht_id ?? null,
        permit_number: form.permit_number || null,
        status: (form.status ?? "pending") as PermitStatus,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        issuing_authority: form.issuing_authority || null,
        holder_name: form.holder_name || null,
        dma_phase: meta.showDmaPhase ? form.dma_phase || null : null,
        document_url: form.document_url || null,
        notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Permit updated");
      } else {
        const { error } = await supabase.from("permits").insert([{ ...payload, created_by: userId } as never]);
        if (error) throw error;
        toast.success("Permit created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit permit" : "New permit"} · {meta.label}</DialogTitle>
      </DialogHeader>
      <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Yacht</Label>
          <Select value={form.yacht_id ?? "__none"} onValueChange={(v) => set("yacht_id", v === "__none" ? null : v)}>
            <SelectTrigger><SelectValue placeholder="Select yacht" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— None —</SelectItem>
              {yachts.map((y) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Permit Number</Label>
          <Input value={form.permit_number ?? ""} onChange={(e) => set("permit_number", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Holder Name</Label>
          <Input value={form.holder_name ?? ""} onChange={(e) => set("holder_name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Issuing Authority</Label>
          <Input value={form.issuing_authority ?? ""} onChange={(e) => set("issuing_authority", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Issue Date</Label>
          <Input type="date" value={form.issue_date ?? ""} onChange={(e) => set("issue_date", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Expiry Date</Label>
          <Input type="date" value={form.expiry_date ?? ""} onChange={(e) => set("expiry_date", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status ?? "pending"} onValueChange={(v) => set("status", v as PermitStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERMIT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {meta.showDmaPhase && (
          <div className="space-y-1.5">
            <Label>DMA Phase</Label>
            <Select value={form.dma_phase ?? "__none"} onValueChange={(v) => set("dma_phase", v === "__none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Select phase" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {DMA_PHASES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Document URL</Label>
          <Input value={form.document_url ?? ""} onChange={(e) => set("document_url", e.target.value)} placeholder="https://…" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Notes</Label>
          <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <DialogFooter className="sm:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create permit"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
