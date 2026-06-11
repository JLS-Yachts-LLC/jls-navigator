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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/status-pill";
import { SanitationDialog } from "@/components/sanitation-dialog";
import { ExitEntryDialog } from "@/components/exit-entry-dialog";
import { CruisingTendersDialog } from "@/components/cruising-tenders-dialog";
import { CruisingMothershipDialog } from "@/components/cruising-mothership-dialog";
import { TdraDialog } from "@/components/tdra-dialog";
import { DmaDialog } from "@/components/dma-dialog";
import { NavigationLicenseDialog } from "@/components/navigation-license-dialog";
import { GatePassDialog } from "@/components/gate-pass-dialog";
import { AbuDhabiDialog } from "@/components/abu-dhabi-dialog";
import { doSendPermitEmail } from "@/lib/permit-email.server";
import { Plus, Search, FileCheck2, Pencil, Trash2, AlertTriangle, CheckCircle2, Clock, Mail, MailCheck, Loader2 as SpinnerIcon } from "lucide-react";
import { toast } from "sonner";
import { doPushToSharePoint } from "@/lib/sharepoint-push.server";
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
  const [deleteTarget, setDeleteTarget] = useState<Permit | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  useEffect(() => { void load(); void loadYachts(); }, [permitType]);

  async function handleSendEmail(permit: Permit) {
    if (!user?.email) { toast.error("You must be signed in to send emails"); return; }
    if (!permit.contact_email) { toast.error("This permit has no contact email address"); return; }
    setSendingEmail(permit.id);
    try {
      await (doSendPermitEmail as any)({ data: { permitId: permit.id, senderEmail: user.email } });
      toast.success(`Email sent to ${permit.contact_email}`);
      void load(); // refresh to show email_sent_at
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Email failed to send");
    } finally {
      setSendingEmail(null);
    }
  }

  async function load() {
    setLoading(true);
    // PostgREST caps a response at 1000 rows — page through (Gate Pass alone
    // exceeds 1000) so the full list for this permit type loads.
    const PAGE = 1000;
    const all: Permit[] = [];
    let from = 0;
    let errMsg: string | null = null;
    for (;;) {
      const { data, error } = await (supabase as any)
        .from("permits")
        .select("*")
        .eq("permit_type", permitType)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .range(from, from + PAGE - 1);
      if (error) { errMsg = error.message; break; }
      const batch = (data ?? []) as Permit[];
      all.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    if (errMsg) toast.error(errMsg);
    else setRows(all);
    setLoading(false);
  }
  async function loadYachts() {
    const { data } = await supabase.from("yachts").select("id, vessel_name").order("vessel_name");
    setYachts((data ?? []) as Yacht[]);
  }

  function startNew() { setEditing(null); setOpen(true); }
  function startEdit(p: Permit) { setEditing(p); setOpen(true); }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("permits").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); void load(); }
    setDeleteTarget(null);
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
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 backdrop-blur-sm px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">{meta.breadcrumb}</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight text-foreground">{meta.label}</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search permits…" className="h-9 w-60 pl-8 text-sm bg-background/50 border-border/60 placeholder:text-muted-foreground/40" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={startNew} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm">
                <Plus className="h-3.5 w-3.5" /> New permit
              </Button>
            </DialogTrigger>
            {permitType === "sanitation" ? (
              <SanitationDialog
                yachts={yachts}
                editing={editing}
                userId={user?.id}
                onSaved={() => { setOpen(false); void load(); }}
              />
            ) : permitType === "exit_entry" ? (
              <ExitEntryDialog
                yachts={yachts}
                editing={editing}
                userId={user?.id}
                onSaved={() => { setOpen(false); void load(); }}
              />
            ) : permitType === "cruising_tenders" ? (
              <CruisingTendersDialog
                yachts={yachts}
                editing={editing}
                userId={user?.id}
                onSaved={() => { setOpen(false); void load(); }}
              />
            ) : permitType === "cruising_mothership" ? (
              <CruisingMothershipDialog
                yachts={yachts}
                editing={editing}
                userId={user?.id}
                onSaved={() => { setOpen(false); void load(); }}
              />
            ) : permitType === "tdra" ? (
              <TdraDialog
                yachts={yachts}
                editing={editing}
                userId={user?.id}
                onSaved={() => { setOpen(false); void load(); }}
              />
            ) : permitType === "dma" ? (
              <DmaDialog
                yachts={yachts}
                editing={editing}
                userId={user?.id}
                onSaved={() => { setOpen(false); void load(); }}
              />
            ) : permitType === "gate_pass" ? (
              <GatePassDialog
                yachts={yachts}
                editing={editing}
                userId={user?.id}
                onSaved={() => { setOpen(false); void load(); }}
              />
            ) : permitType === "navigation_license" ? (
              <NavigationLicenseDialog
                yachts={yachts}
                editing={editing}
                userId={user?.id}
                onSaved={() => { setOpen(false); void load(); }}
              />
            ) : permitType === "abu_dhabi" ? (
              <AbuDhabiDialog
                yachts={yachts}
                editing={editing}
                userId={user?.id}
                onSaved={() => { setOpen(false); void load(); }}
              />
            ) : (
              <PermitDialog
                permitType={permitType}
                yachts={yachts}
                editing={editing}
                userId={user?.id}
                onSaved={() => { setOpen(false); void load(); }}
              />
            )}
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
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Permit #</th>
                  <th>Yacht</th>
                  <th>Holder</th>
                  <th>Authority</th>
                  {meta.showDmaPhase && <th>Phase</th>}
                  <th>Issued</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  <th>Email</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const days = daysUntil(r.expiry_date);
                  const variant = expiryVariant(days);
                  return (
                    <tr key={r.id}>
                      <td className="font-medium tabular-nums text-foreground/90">{r.permit_number ?? <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="font-medium">{yachtName(r.yacht_id)}</td>
                      <td className="text-foreground/75">{r.holder_name ?? <span className="text-muted-foreground/50">—</span>}</td>
                      <td className="text-foreground/75">{r.issuing_authority ?? <span className="text-muted-foreground/50">—</span>}</td>
                      {meta.showDmaPhase && <td className="text-foreground/75">{r.dma_phase ?? <span className="text-muted-foreground/50">—</span>}</td>}
                      <td className="tabular-nums text-foreground/60">{r.issue_date ?? "—"}</td>
                      <td className="tabular-nums">
                        <div className="flex items-center gap-2">
                          <span className={days !== null && days < 0 ? "text-destructive" : days !== null && days <= 30 ? "text-warning" : "text-foreground/75"}>
                            {r.expiry_date ?? <span className="text-muted-foreground/50">—</span>}
                          </span>
                          {days !== null && (
                            <span className={cn("pill", variant)}>
                              {days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td><StatusPill status={r.status} /></td>
                      {/* Email send / sent indicator */}
                      <td>
                        {r.contact_email ? (
                          r.email_sent_at ? (
                            <div className="flex items-center gap-1 text-emerald-400/80" title={`Sent ${new Date(r.email_sent_at).toLocaleString("en-GB")} by ${r.email_sent_by ?? "unknown"}`}>
                              <MailCheck className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-medium whitespace-nowrap">{new Date(r.email_sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                            </div>
                          ) : (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 gap-1 px-2 text-muted-foreground/60 hover:text-primary text-[11px]"
                              disabled={sendingEmail === r.id}
                              onClick={() => handleSendEmail(r)}
                              title={`Send to ${r.contact_email}`}
                            >
                              {sendingEmail === r.id
                                ? <SpinnerIcon className="h-3 w-3 animate-spin" />
                                : <Mail className="h-3 w-3" />}
                              Send
                            </Button>
                          )
                        ) : (
                          <span className="text-[11px] text-muted-foreground/30">—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="inline-flex gap-0.5">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => startEdit(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => setDeleteTarget(r)}>
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

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permit?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.permit_number
                ? <>Permit <strong>{deleteTarget.permit_number}</strong> will be permanently removed.</>
                : "This permit will be permanently removed."}
              {" "}This cannot be undone.
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

function Stat({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; accent: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:border-border/80 hover:bg-card/80">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/70">{label}</div>
        <div className={`mt-1 font-display text-[1.625rem] font-bold leading-none tabular-nums ${accent}`}>{value}</div>
      </div>
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent.replace('text-', 'bg-').replace('primary', 'primary/10').replace('success', 'success/10').replace('warning', 'warning/10').replace('destructive', 'destructive/10')}`}>
        <Icon className={`h-[1.125rem] w-[1.125rem] ${accent} opacity-80`} />
      </div>
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
      const db = supabase as any;
      if (editing) {
        const { error } = await db.from("permits").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Permit updated");
        doPushToSharePoint({ data: { target: "permits", id: editing.id } } as any).catch(() => {});
      } else {
        const { data: ins, error } = await db.from("permits").insert([{ ...payload, created_by: userId }]).select("id").single();
        if (error) throw error;
        toast.success("Permit created");
        if (ins?.id) doPushToSharePoint({ data: { target: "permits", id: ins.id } } as any).catch(() => {});
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
