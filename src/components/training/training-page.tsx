import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  GraduationCap, Award, Loader2, Plus, Search, Pencil, Trash2,
  AlertTriangle, CheckCircle2, Clock, BookOpen, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

type TrainingRecord = {
  id: string;
  crew_name: string;
  course: string;
  provider: string | null;
  status: "enrolled" | "in_progress" | "completed" | "failed";
  start_date: string | null;
  completion_date: string | null;
  certificate_no: string | null;
  notes: string | null;
  created_at: string;
};

type Certification = {
  id: string;
  crew_name: string;
  certificate: string;
  cert_type: "stcw" | "medical" | "safety" | "flag" | "other" | null;
  issuing_body: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: "valid" | "expiring" | "expired";
  notes: string | null;
  created_at: string;
};

type Tab = "records" | "certifications";

// ─── Constants ────────────────────────────────────────────────────────────────

const RECORD_STATUS_COLORS: Record<string, string> = {
  enrolled:    "bg-blue-500/15 text-blue-400 border-blue-500/20",
  in_progress: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  completed:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  failed:      "bg-red-500/15 text-red-400 border-red-500/20",
};

const RECORD_STATUS_LABELS: Record<string, string> = {
  enrolled:    "Enrolled",
  in_progress: "In Progress",
  completed:   "Completed",
  failed:      "Failed",
};

const CERT_STATUS_COLORS: Record<string, string> = {
  valid:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  expiring: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  expired:  "bg-red-500/15 text-red-400 border-red-500/20",
};

const CERT_TYPE_LABELS: Record<string, string> = {
  stcw:    "STCW",
  medical: "Medical",
  safety:  "Safety",
  flag:    "Flag State",
  other:   "Other",
};

const DAY = 86_400_000;
const daysUntil = (d: string | null) =>
  d ? Math.ceil((new Date(d + "T00:00").getTime() - Date.now()) / DAY) : null;

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

// ─── Main Component ───────────────────────────────────────────────────────────

export function TrainingPage() {
  const [records, setRecords]       = useState<TrainingRecord[]>([]);
  const [certs, setCerts]           = useState<Certification[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<Tab>("records");
  const [q, setQ]                   = useState("");

  // Record dialog state
  const [recordOpen, setRecordOpen]     = useState(false);
  const [editingRecord, setEditingRecord] = useState<TrainingRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<TrainingRecord | null>(null);

  // Cert dialog state
  const [certOpen, setCertOpen]     = useState(false);
  const [editingCert, setEditingCert] = useState<Certification | null>(null);
  const [deleteCert, setDeleteCert] = useState<Certification | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [r, c] = await Promise.all([
      fetchAllRows(() =>
        (supabase as any).from("training_records").select("*").order("start_date", { ascending: false, nullsFirst: false })
      ),
      fetchAllRows(() =>
        (supabase as any).from("training_certifications").select("*").order("expiry_date", { ascending: true, nullsFirst: false })
      ),
    ]);
    setRecords((r.data ?? []) as TrainingRecord[]);
    setCerts((c.data ?? []) as Certification[]);
    setLoading(false);
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const inProgress  = records.filter(r => r.status === "in_progress").length;
    const completed   = records.filter(r => r.status === "completed").length;
    const certExpired  = certs.filter(c => c.status === "expired").length;
    const certExpiring = certs.filter(c => c.status === "expiring").length;
    return { total: records.length, inProgress, completed, certExpired, certExpiring, totalCerts: certs.length };
  }, [records, certs]);

  // ── Filtered views ───────────────────────────────────────────────────────

  const filteredRecords = useMemo(() => {
    const lq = q.toLowerCase();
    return lq ? records.filter(r =>
      r.crew_name.toLowerCase().includes(lq) ||
      r.course.toLowerCase().includes(lq) ||
      (r.provider ?? "").toLowerCase().includes(lq)
    ) : records;
  }, [records, q]);

  const filteredCerts = useMemo(() => {
    const lq = q.toLowerCase();
    return lq ? certs.filter(c =>
      c.crew_name.toLowerCase().includes(lq) ||
      c.certificate.toLowerCase().includes(lq) ||
      (c.issuing_body ?? "").toLowerCase().includes(lq)
    ) : certs;
  }, [certs, q]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">

      {/* ── Header ───────────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
            Polaris / Crew
          </div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">
            JLS Training Institute
          </h1>
        </div>
        <button
          onClick={() => tab === "records" ? (setEditingRecord(null), setRecordOpen(true)) : (setEditingCert(null), setCertOpen(true))}
          className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          {tab === "records" ? "Add Training Record" : "Add Certification"}
        </button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">

          {/* ── Stat cards ─────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={BookOpen}
              label="Training records"
              value={stats.total}
              sub={`${stats.inProgress} in progress`}
              onClick={() => setTab("records")}
            />
            <StatCard
              icon={CheckCircle2}
              label="Completed"
              value={stats.completed}
              sub="all time"
              tone="ok"
              onClick={() => setTab("records")}
            />
            <StatCard
              icon={Award}
              label="Certifications"
              value={stats.totalCerts}
              sub={`${stats.certExpiring} expiring`}
              tone={stats.certExpiring > 0 ? "warn" : undefined}
              onClick={() => setTab("certifications")}
            />
            <StatCard
              icon={AlertTriangle}
              label="Cert. action needed"
              value={stats.certExpired + stats.certExpiring}
              sub={`${stats.certExpired} expired · ${stats.certExpiring} expiring`}
              tone={stats.certExpired > 0 ? "bad" : stats.certExpiring > 0 ? "warn" : "ok"}
              onClick={() => setTab("certifications")}
            />
          </div>

          {/* ── Expiry alerts ──────────────────────────────────────── */}
          {(stats.certExpired > 0 || stats.certExpiring > 0) && (
            <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-400" /> Certification Alerts
              </h2>
              <div className="divide-y divide-border/50">
                {certs
                  .filter(c => c.status === "expired" || c.status === "expiring")
                  .slice(0, 8)
                  .map(c => {
                    const days = daysUntil(c.expiry_date);
                    return (
                      <div key={c.id} className="flex items-center gap-3 py-3">
                        <span className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          c.status === "expired" ? "bg-red-400" : "bg-amber-400"
                        )} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {c.crew_name} — {c.certificate}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {c.status === "expired"
                              ? `Expired ${days !== null ? Math.abs(days) : "?"} day(s) ago`
                              : `Expires in ${days} day(s) — ${fmtDate(c.expiry_date)}`}
                          </div>
                        </div>
                        <button
                          onClick={() => { setEditingCert(c); setCertOpen(true); setTab("certifications"); }}
                          className="shrink-0 rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25"
                        >
                          Update
                        </button>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* ── Tabs + Search ──────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-1 rounded-lg border border-border bg-card/50 p-1">
              {(["records", "certifications"] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setQ(""); }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
                    tab === t
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t === "records" ? <><GraduationCap className="h-3.5 w-3.5" /> Training Records</> : <><Award className="h-3.5 w-3.5" /> Certifications</>}
                </button>
              ))}
            </div>

            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={tab === "records" ? "Search crew, course…" : "Search crew, cert…"}
                className="h-8 w-full rounded-md border border-border/60 bg-card/50 pl-8 pr-7 text-[12px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              {q && (
                <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* ── Table ─────────────────────────────────────────────── */}
          {tab === "records" ? (
            <RecordsTable
              rows={filteredRecords}
              onEdit={r => { setEditingRecord(r); setRecordOpen(true); }}
              onDelete={r => setDeleteRecord(r)}
            />
          ) : (
            <CertificationsTable
              rows={filteredCerts}
              onEdit={c => { setEditingCert(c); setCertOpen(true); }}
              onDelete={c => setDeleteCert(c)}
            />
          )}

        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      <RecordDialog
        open={recordOpen}
        editing={editingRecord}
        onClose={() => setRecordOpen(false)}
        onSaved={load}
      />
      <CertDialog
        open={certOpen}
        editing={editingCert}
        onClose={() => setCertOpen(false)}
        onSaved={load}
      />

      {/* Delete confirmations */}
      <AlertDialog open={!!deleteRecord} onOpenChange={v => !v && setDeleteRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete training record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the record for <strong>{deleteRecord?.crew_name}</strong> — <strong>{deleteRecord?.course}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteRecord) return;
                const { error } = await (supabase as any).from("training_records").delete().eq("id", deleteRecord.id);
                if (error) { toast.error(error.message); return; }
                toast.success("Record deleted");
                setDeleteRecord(null);
                void load();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteCert} onOpenChange={v => !v && setDeleteCert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete certification?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteCert?.certificate}</strong> for <strong>{deleteCert?.crew_name}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteCert) return;
                const { error } = await (supabase as any).from("training_certifications").delete().eq("id", deleteCert.id);
                if (error) { toast.error(error.message); return; }
                toast.success("Certification deleted");
                setDeleteCert(null);
                void load();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tables ───────────────────────────────────────────────────────────────────

function RecordsTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: TrainingRecord[];
  onEdit: (r: TrainingRecord) => void;
  onDelete: (r: TrainingRecord) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-14 text-center">
        <GraduationCap className="mb-3 h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">No training records yet</p>
        <p className="mt-1 text-xs text-muted-foreground/60">Track crew course enrolments, progress and completions.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              <Th>Crew Member</Th>
              <Th>Course</Th>
              <Th>Provider</Th>
              <Th>Status</Th>
              <Th>Start Date</Th>
              <Th>Completed</Th>
              <Th>Certificate No.</Th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map(r => (
              <tr key={r.id} className="group hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium">{r.crew_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.course}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.provider ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", RECORD_STATUS_COLORS[r.status])}>
                    {RECORD_STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.start_date)}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.completion_date)}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.certificate_no ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onEdit(r)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => onDelete(r)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CertificationsTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: Certification[];
  onEdit: (c: Certification) => void;
  onDelete: (c: Certification) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-14 text-center">
        <Award className="mb-3 h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">No certifications recorded</p>
        <p className="mt-1 text-xs text-muted-foreground/60">Track STCW, medical, safety and flag-state certifications with expiry alerts.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              <Th>Crew Member</Th>
              <Th>Certificate</Th>
              <Th>Type</Th>
              <Th>Issuing Body</Th>
              <Th>Issue Date</Th>
              <Th>Expiry</Th>
              <Th>Status</Th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map(c => {
              const days = daysUntil(c.expiry_date);
              return (
                <tr key={c.id} className="group hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.crew_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.certificate}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.cert_type ? CERT_TYPE_LABELS[c.cert_type] : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.issuing_body ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(c.issue_date)}</td>
                  <td className="px-4 py-3">
                    <div className="text-muted-foreground">{fmtDate(c.expiry_date)}</div>
                    {days !== null && days <= 90 && (
                      <div className={cn("text-[10.5px]", days < 0 ? "text-red-400" : "text-amber-400")}>
                        {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", CERT_STATUS_COLORS[c.status])}>
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(c)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onDelete(c)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
      {children}
    </th>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, tone, onClick,
}: {
  icon: any; label: string; value: number; sub?: string; tone?: "ok" | "warn" | "bad"; onClick?: () => void;
}) {
  const iconColor = tone === "bad" ? "text-red-400" : tone === "warn" ? "text-amber-400" : tone === "ok" ? "text-emerald-400" : "text-primary";
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border bg-card p-4 text-left shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)] transition",
        onClick && "hover:border-primary/50 cursor-pointer"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{label}</span>
        <Icon className={cn("h-4 w-4", iconColor)} />
      </div>
      <div className="mt-1 font-display text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </button>
  );
}

// ─── Record Dialog ────────────────────────────────────────────────────────────

function RecordDialog({
  open, editing, onClose, onSaved,
}: {
  open: boolean; editing: TrainingRecord | null; onClose: () => void; onSaved: () => void;
}) {
  const blank = { crew_name: "", course: "", provider: "", status: "enrolled" as const, start_date: "", completion_date: "", certificate_no: "", notes: "" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(editing ? {
      crew_name:       editing.crew_name,
      course:          editing.course,
      provider:        editing.provider ?? "",
      status:          editing.status,
      start_date:      editing.start_date ?? "",
      completion_date: editing.completion_date ?? "",
      certificate_no:  editing.certificate_no ?? "",
      notes:           editing.notes ?? "",
    } : blank);
  }, [editing, open]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.crew_name.trim() || !form.course.trim()) {
      toast.error("Crew name and course are required");
      return;
    }
    setBusy(true);
    const payload = {
      crew_name:       form.crew_name.trim(),
      course:          form.course.trim(),
      provider:        form.provider.trim() || null,
      status:          form.status,
      start_date:      form.start_date || null,
      completion_date: form.completion_date || null,
      certificate_no:  form.certificate_no.trim() || null,
      notes:           form.notes.trim() || null,
    };
    const { error } = editing
      ? await (supabase as any).from("training_records").update(payload).eq("id", editing.id)
      : await (supabase as any).from("training_records").insert(payload);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Record updated" : "Record added");
    onClose();
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Training Record" : "Add Training Record"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <Field label="Crew Member *" full>
            <Input value={form.crew_name} onChange={e => set("crew_name", e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Course *" full>
            <Input value={form.course} onChange={e => set("course", e.target.value)} placeholder="Course name" />
          </Field>
          <Field label="Provider">
            <Input value={form.provider} onChange={e => set("provider", e.target.value)} placeholder="e.g. STCW Academy" />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="enrolled">Enrolled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Start Date">
            <Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} />
          </Field>
          <Field label="Completion Date">
            <Input type="date" value={form.completion_date} onChange={e => set("completion_date", e.target.value)} />
          </Field>
          <Field label="Certificate No." full>
            <Input value={form.certificate_no} onChange={e => set("certificate_no", e.target.value)} placeholder="Optional" className="font-mono" />
          </Field>
          <Field label="Notes" full>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Optional notes" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {editing ? "Save Changes" : "Add Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cert Dialog ──────────────────────────────────────────────────────────────

function CertDialog({
  open, editing, onClose, onSaved,
}: {
  open: boolean; editing: Certification | null; onClose: () => void; onSaved: () => void;
}) {
  const blank = { crew_name: "", certificate: "", cert_type: "", issuing_body: "", issue_date: "", expiry_date: "", status: "valid" as const, notes: "" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(editing ? {
      crew_name:    editing.crew_name,
      certificate:  editing.certificate,
      cert_type:    editing.cert_type ?? "",
      issuing_body: editing.issuing_body ?? "",
      issue_date:   editing.issue_date ?? "",
      expiry_date:  editing.expiry_date ?? "",
      status:       editing.status,
      notes:        editing.notes ?? "",
    } : blank);
  }, [editing, open]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.crew_name.trim() || !form.certificate.trim()) {
      toast.error("Crew name and certificate are required");
      return;
    }
    setBusy(true);

    // Auto-compute status from expiry date if set
    let status = form.status;
    if (form.expiry_date) {
      const days = daysUntil(form.expiry_date);
      if (days !== null) {
        status = days < 0 ? "expired" : days <= 90 ? "expiring" : "valid";
      }
    }

    const payload = {
      crew_name:    form.crew_name.trim(),
      certificate:  form.certificate.trim(),
      cert_type:    form.cert_type || null,
      issuing_body: form.issuing_body.trim() || null,
      issue_date:   form.issue_date || null,
      expiry_date:  form.expiry_date || null,
      status,
      notes:        form.notes.trim() || null,
    };
    const { error } = editing
      ? await (supabase as any).from("training_certifications").update(payload).eq("id", editing.id)
      : await (supabase as any).from("training_certifications").insert(payload);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Certification updated" : "Certification added");
    onClose();
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Certification" : "Add Certification"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <Field label="Crew Member *" full>
            <Input value={form.crew_name} onChange={e => set("crew_name", e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Certificate *" full>
            <Input value={form.certificate} onChange={e => set("certificate", e.target.value)} placeholder="e.g. STCW Basic Safety Training" />
          </Field>
          <Field label="Type">
            <Select value={form.cert_type || "none"} onValueChange={v => set("cert_type", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                <SelectItem value="stcw">STCW</SelectItem>
                <SelectItem value="medical">Medical</SelectItem>
                <SelectItem value="safety">Safety</SelectItem>
                <SelectItem value="flag">Flag State</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Issuing Body">
            <Input value={form.issuing_body} onChange={e => set("issuing_body", e.target.value)} placeholder="e.g. MCA, Flag Admin" />
          </Field>
          <Field label="Issue Date">
            <Input type="date" value={form.issue_date} onChange={e => set("issue_date", e.target.value)} />
          </Field>
          <Field label="Expiry Date">
            <Input type="date" value={form.expiry_date} onChange={e => set("expiry_date", e.target.value)} />
          </Field>
          <Field label="Notes" full>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Optional notes" />
          </Field>
        </div>
        {form.expiry_date && (
          <p className="text-[11px] text-muted-foreground -mt-1 px-1">
            Status will be auto-set from expiry date: &lt;0 days = Expired, ≤90 days = Expiring, otherwise Valid.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {editing ? "Save Changes" : "Add Certification"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1.5", full && "col-span-2")}>
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
