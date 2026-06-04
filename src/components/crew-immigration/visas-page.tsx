import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, FileText, Pencil, Trash2, Loader2, CheckCircle2, Clock, AlertTriangle, XCircle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CrewMember = { id: string; first_name: string; last_name: string; rank: string | null; yacht_id: string | null };
type Yacht = { id: string; vessel_name: string };

type VisaApplication = {
  id: string;
  crew_member_id: string;
  yacht_id: string | null;
  visa_type: string;
  destination_country: string | null;
  destination_city: string | null;
  planned_arrival: string | null;
  planned_departure: string | null;
  priority: string;
  status: string;
  jls_reference: string | null;
  assigned_to: string | null;
  application_notes: string | null;
  documents: Array<{ name: string; status: "pending" | "uploaded" | "approved" }>;
  submitted_at: string | null;
  created_at: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft:       { label: "Draft",       color: "bg-slate-500/15 text-slate-400",    icon: FileText },
  submitted:   { label: "Submitted",   color: "bg-blue-500/15 text-blue-400",      icon: CheckCircle2 },
  in_review:   { label: "In Review",   color: "bg-amber-500/15 text-amber-400",    icon: Clock },
  processing:  { label: "Processing",  color: "bg-violet-500/15 text-violet-400",  icon: Clock },
  approved:    { label: "Approved",    color: "bg-emerald-500/15 text-emerald-400",icon: CheckCircle2 },
  rejected:    { label: "Rejected",    color: "bg-red-500/15 text-red-400",        icon: XCircle },
  completed:   { label: "Completed",   color: "bg-teal-500/15 text-teal-400",      icon: CheckCircle2 },
};

const PRIORITY_CONFIG: Record<string, string> = {
  urgent: "text-red-400",
  high:   "text-amber-400",
  normal: "text-muted-foreground",
  low:    "text-slate-500",
};

const VISA_TYPES = ["Crew Visa", "Employment Visa", "Visit Visa", "Transit Visa", "Multi-Entry Visa", "Residence Visa"];
const REQUIRED_DOCS_DEFAULT = [
  "Passport Copy", "Photo (White Background)", "Seaman's Book",
  "STCW Certificates", "Medical Certificate", "Visa Application Form",
];

const EMPTY_FORM = {
  crew_member_id: "",
  yacht_id: "",
  visa_type: "Crew Visa",
  destination_country: "UAE",
  destination_city: "",
  planned_arrival: "",
  planned_departure: "",
  priority: "normal",
  assigned_to: "",
  application_notes: "",
};

export function VisasPage() {
  const { user } = useAuth();
  const [visas, setVisas] = useState<VisaApplication[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VisaApplication | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VisaApplication | null>(null);
  const [selected, setSelected] = useState<VisaApplication | null>(null);

  useEffect(() => { void load(); void loadCrew(); void loadYachts(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("visa_applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setVisas(data ?? []);
    setLoading(false);
  }

  async function loadCrew() {
    const { data } = await (supabase as any).from("crew_members").select("id, first_name, last_name, rank, yacht_id").order("last_name");
    setCrew(data ?? []);
  }

  async function loadYachts() {
    const { data } = await supabase.from("yachts").select("id, vessel_name").order("vessel_name");
    setYachts((data ?? []) as Yacht[]);
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(v: VisaApplication) {
    setEditing(v);
    setForm({
      crew_member_id: v.crew_member_id,
      yacht_id: v.yacht_id ?? "",
      visa_type: v.visa_type,
      destination_country: v.destination_country ?? "",
      destination_city: v.destination_city ?? "",
      planned_arrival: v.planned_arrival ?? "",
      planned_departure: v.planned_departure ?? "",
      priority: v.priority,
      assigned_to: v.assigned_to ?? "",
      application_notes: v.application_notes ?? "",
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.crew_member_id) { toast.error("Please select a crew member"); return; }
    setBusy(true);
    try {
      const payload: any = {
        crew_member_id: form.crew_member_id,
        yacht_id: form.yacht_id || (crew.find(c => c.id === form.crew_member_id)?.yacht_id ?? null),
        visa_type: form.visa_type,
        destination_country: form.destination_country || null,
        destination_city: form.destination_city || null,
        planned_arrival: form.planned_arrival || null,
        planned_departure: form.planned_departure || null,
        priority: form.priority,
        assigned_to: form.assigned_to || null,
        application_notes: form.application_notes || null,
        documents: editing?.documents ?? REQUIRED_DOCS_DEFAULT.map(name => ({ name, status: "pending" })),
        status: editing?.status ?? "draft",
        created_by: user?.id,
        updated_at: new Date().toISOString(),
      };
      const db = supabase as any;
      const { error } = editing
        ? await db.from("visa_applications").update(payload).eq("id", editing.id)
        : await db.from("visa_applications").insert([payload]);
      if (error) throw error;
      toast.success(editing ? "Application updated" : "Visa application created");
      setOpen(false);
      void load();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === "submitted") patch.submitted_at = new Date().toISOString();
    if (status === "approved") patch.approved_at = new Date().toISOString();
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await (supabase as any).from("visa_applications").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Status updated"); void load(); setSelected(prev => prev?.id === id ? { ...prev, status } : prev); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from("visa_applications").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Application deleted"); void load(); if (selected?.id === deleteTarget.id) setSelected(null); }
    setDeleteTarget(null);
  }

  const crewName = (id: string) => { const c = crew.find(m => m.id === id); return c ? `${c.first_name} ${c.last_name}` : "—"; };
  const yachtName = (id: string | null) => yachts.find(y => y.id === id)?.vessel_name ?? "—";
  const fmtDate = (d: string | null) => d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const filtered = useMemo(() => visas.filter(v => {
    if (filterStatus !== "all" && v.status !== filterStatus) return false;
    if (q.trim()) {
      const s = q.toLowerCase();
      const hay = [crewName(v.crew_member_id), v.visa_type, v.destination_country, v.jls_reference, v.assigned_to].join(" ").toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }), [visas, filterStatus, q]);

  const STATUS_FLOW = ["draft", "submitted", "in_review", "processing", "approved", "completed"];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Superyacht Middle East / Crew & Immigration</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">Visa Applications</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search applications…" className="h-9 w-56 pl-8 text-sm" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={openNew} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm">
            <Plus className="h-3.5 w-3.5" /> New Application
          </Button>
        </div>
      </header>

      {/* Status pipeline summary */}
      <div className="flex items-center gap-0 border-b border-border/40 bg-muted/10 px-6">
        {STATUS_FLOW.map((s, i) => {
          const cfg = STATUS_CONFIG[s];
          const count = visas.filter(v => v.status === s).length;
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
              className={cn("flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
                filterStatus === s ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              <span className={cn("rounded-full px-1.5 py-px text-[10px] font-bold", cfg.color)}>{count}</span>
              {cfg.label}
              {i < STATUS_FLOW.length - 1 && <ChevronRight className="h-3 w-3 ml-1 text-border" />}
            </button>
          );
        })}
      </div>

      {/* Main content — list + detail panel */}
      <div className="flex flex-1 min-h-0">
        {/* List */}
        <div className={cn("flex-1 overflow-auto", selected ? "border-r border-border/60" : "")}>
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center px-6">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="font-display text-base font-semibold">{q ? "No applications match" : "No visa applications yet"}</p>
              <p className="text-sm text-muted-foreground mt-1">Create applications for crew requiring visas or permits.</p>
              {!q && <Button onClick={openNew} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> New Application</Button>}
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {filtered.map(v => {
                const cfg = STATUS_CONFIG[v.status] ?? STATUS_CONFIG.draft;
                const Icon = cfg.icon;
                const isSelected = selected?.id === v.id;
                return (
                  <div key={v.id}
                    onClick={() => setSelected(isSelected ? null : v)}
                    className={cn("cursor-pointer rounded-xl border p-4 transition-all hover:border-border",
                      isSelected ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/60 hover:bg-card"
                    )}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                        {crewName(v.crew_member_id).split(" ").map(n => n[0]).slice(0,2).join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{crewName(v.crew_member_id)}</span>
                          <span className={cn("text-[10.5px] font-bold uppercase tracking-wide", PRIORITY_CONFIG[v.priority])}>
                            {v.priority !== "normal" ? v.priority : ""}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {v.visa_type} · {v.destination_country ?? "—"}{v.destination_city ? `, ${v.destination_city}` : ""}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground/60 mt-0.5">
                          {v.planned_arrival ? `Arrival: ${fmtDate(v.planned_arrival)}` : "No arrival date"}
                          {v.assigned_to ? ` · Assigned: ${v.assigned_to}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", cfg.color)}>
                          <Icon className="h-2.5 w-2.5" />{cfg.label}
                        </span>
                        <div className="flex items-center gap-1">
                          <button onClick={e => { e.stopPropagation(); openEdit(v); }}
                            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); setDeleteTarget(v); }}
                            className="rounded p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 shrink-0 overflow-auto p-4 space-y-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Application Summary</div>
              <div className="rounded-xl border border-border bg-card/60 p-3.5 space-y-2 text-xs">
                {[
                  ["Crew Member", crewName(selected.crew_member_id)],
                  ["Vessel", yachtName(selected.yacht_id)],
                  ["Visa Type", selected.visa_type],
                  ["Destination", [selected.destination_country, selected.destination_city].filter(Boolean).join(", ") || "—"],
                  ["Planned Arrival", fmtDate(selected.planned_arrival)],
                  ["Priority", selected.priority.charAt(0).toUpperCase() + selected.priority.slice(1)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-muted-foreground/70 shrink-0">{k}</span>
                    <span className="font-medium text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status flow */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Update Status</div>
              <div className="grid grid-cols-2 gap-1.5">
                {STATUS_FLOW.filter(s => s !== selected.status).map(s => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <button key={s} onClick={() => updateStatus(selected.id, s)}
                      className={cn("rounded-lg px-2.5 py-1.5 text-[10.5px] font-semibold border transition-colors hover:opacity-90", cfg.color, "border-transparent hover:border-current/20")}>
                      → {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Required documents */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Required Documents</div>
              <div className="rounded-xl border border-border bg-card/60 divide-y divide-border/40 overflow-hidden">
                {(selected.documents ?? []).map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", doc.status === "approved" ? "bg-emerald-400" : doc.status === "uploaded" ? "bg-blue-400" : "bg-amber-400")} />
                    <span className="flex-1 text-foreground/80">{doc.name}</span>
                    <span className={cn("text-[10px] font-semibold uppercase", doc.status === "approved" ? "text-emerald-400" : doc.status === "uploaded" ? "text-blue-400" : "text-amber-400")}>
                      {doc.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {selected.application_notes && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Notes</div>
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">{selected.application_notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Visa Application" : "New Visa Application"}</DialogTitle>
            <p className="text-sm text-muted-foreground">Crew data is reused automatically — select a crew member to pre-fill vessel and profile details.</p>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Crew Member <span className="text-destructive">*</span></Label>
                <Select value={form.crew_member_id || "__none"} onValueChange={v => setForm(f => ({ ...f, crew_member_id: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— Select crew member —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Select crew member —</SelectItem>
                    {crew.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}{c.rank ? ` · ${c.rank}` : ""}{c.yacht_id ? ` · ${yachtName(c.yacht_id)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Visa Type</Label>
                <Select value={form.visa_type} onValueChange={v => setForm(f => ({ ...f, visa_type: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{VISA_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">🔴 Urgent</SelectItem>
                    <SelectItem value="high">🟠 High</SelectItem>
                    <SelectItem value="normal">🟢 Normal</SelectItem>
                    <SelectItem value="low">⚪ Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Destination Country</Label>
                <Input value={form.destination_country} onChange={e => setForm(f => ({ ...f, destination_country: e.target.value }))} placeholder="UAE" className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Destination City</Label>
                <Input value={form.destination_city} onChange={e => setForm(f => ({ ...f, destination_city: e.target.value }))} placeholder="Dubai" className="h-8" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Planned Arrival</Label>
                <Input type="date" value={form.planned_arrival} onChange={e => setForm(f => ({ ...f, planned_arrival: e.target.value }))} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Planned Departure</Label>
                <Input type="date" value={form.planned_departure} onChange={e => setForm(f => ({ ...f, planned_departure: e.target.value }))} className="h-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Assigned To (JLS Staff)</Label>
              <Input value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="Staff name" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.application_notes} onChange={e => setForm(f => ({ ...f, application_notes: e.target.value }))} rows={2} className="resize-none text-sm" placeholder="Any special requirements or notes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete application?</AlertDialogTitle>
            <AlertDialogDescription>
              The visa application for <strong>{deleteTarget ? crewName(deleteTarget.crew_member_id) : ""}</strong> will be permanently deleted.
            </AlertDialogDescription>
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
