import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, FileText, Pencil, Trash2, Loader2, CheckCircle2, Clock, AlertTriangle, XCircle, ChevronRight, Download, FileSpreadsheet, Mail, BarChart3, X, Filter } from "lucide-react";
import { toast } from "sonner";
import { doPushToSharePoint } from "@/lib/sharepoint-push.server";
import { fetchAllRows } from "@/lib/fetch-all";
import { cn } from "@/lib/utils";
import { useActiveVessel } from "@/components/vessel-switcher";

type CrewMember = { id: string; first_name: string; last_name: string; rank: string | null; yacht_id: string | null };
type Yacht = { id: string; vessel_name: string };

type VisaApplication = {
  id: string;
  crew_member_id: string | null;
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
  // Enriched fields
  given_name: string | null;
  surname: string | null;
  nationality: string | null;
  passport_number: string | null;
  rank_rating: string | null;
  visa_number: string | null;
  visa_issuance_date: string | null;
  first_entry_expiry: string | null;
  visa_expiry: string | null;
  sign_on_date: string | null;
  sign_off_date: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft:       { label: "Draft",       color: "bg-slate-500/15 text-slate-400",    icon: FileText },
  submitted:   { label: "Submitted",   color: "bg-blue-500/15 text-blue-400",      icon: CheckCircle2 },
  in_review:   { label: "In Review",   color: "bg-amber-500/15 text-amber-400",    icon: Clock },
  processing:  { label: "Processing",  color: "bg-violet-500/15 text-violet-400",  icon: Clock },
  approved:    { label: "Approved",    color: "bg-emerald-500/15 text-emerald-400",icon: CheckCircle2 },
  rejected:    { label: "Rejected",    color: "bg-red-500/15 text-red-400",        icon: XCircle },
  completed:   { label: "Completed",   color: "bg-teal-500/15 text-teal-400",      icon: CheckCircle2 },
  cancelled:   { label: "Cancelled",   color: "bg-slate-500/15 text-slate-300",    icon: XCircle },
  need_to_apply: { label: "Need to Apply", color: "bg-amber-500/15 text-amber-400", icon: AlertTriangle },
};

const PRIORITY_CONFIG: Record<string, string> = {
  urgent: "text-red-400", high: "text-amber-400", normal: "text-muted-foreground", low: "text-slate-500",
};
const VISA_TYPES = ["Crew Visa", "Employment Visa", "Visit Visa", "Transit Visa", "Multi-Entry Visa", "Residence Visa"];
const REQUIRED_DOCS_DEFAULT = [
  "Passport Copy", "Photo (White Background)", "Seaman's Book",
  "STCW Certificates", "Medical Certificate", "Visa Application Form",
];
const EMPTY_FORM = {
  crew_member_id: "", yacht_id: "", visa_type: "Crew Visa", destination_country: "UAE",
  destination_city: "", planned_arrival: "", planned_departure: "", priority: "normal",
  assigned_to: "", application_notes: "",
};
const STATUS_FLOW = ["draft", "submitted", "in_review", "processing", "approved", "completed"];

function displayName(v: VisaApplication): string {
  if (v.given_name && v.surname) return `${v.given_name} ${v.surname}`;
  if (v.given_name) return v.given_name;
  if (v.application_notes) return v.application_notes.split("\n")[0];
  return "—";
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function initials(name: string): string {
  return name.split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

// ─── Report View ──────────────────────────────────────────────────────────────
function ReportView({ visas, yachts, onClose }: {
  visas: VisaApplication[]; yachts: Yacht[]; onClose: () => void
}) {
  const [filterYacht, setFilterYacht] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reportType, setReportType] = useState<"visa" | "immigration">("visa");
  const [emailing, setEmailing] = useState(false);
  const { user } = useAuth();

  const filtered = useMemo(() => visas.filter(v => {
    if (filterYacht !== "all" && v.yacht_id !== filterYacht) return false;
    if (filterStatus !== "all" && v.status !== filterStatus) return false;
    if (dateFrom && v.planned_arrival && v.planned_arrival < dateFrom) return false;
    if (dateTo   && v.planned_arrival && v.planned_arrival > dateTo)   return false;
    if (dateFrom && v.visa_issuance_date && !v.planned_arrival && v.visa_issuance_date < dateFrom) return false;
    if (dateTo   && v.visa_issuance_date && !v.planned_arrival && v.visa_issuance_date > dateTo)   return false;
    return true;
  }), [visas, filterYacht, filterStatus, dateFrom, dateTo]);

  // Immigration summary counts
  const immSummary = useMemo(() => {
    const groups: Record<string, { vessel: string; approved: number; cancelled: number; rejected: number; total: number }> = {};
    for (const v of filtered) {
      const vid = v.yacht_id ?? "unknown";
      if (!groups[vid]) {
        groups[vid] = { vessel: yachts.find(y => y.id === vid)?.vessel_name ?? "Unknown", approved: 0, cancelled: 0, rejected: 0, total: 0 };
      }
      groups[vid].total++;
      if (v.status === "approved" || v.status === "completed") groups[vid].approved++;
      else if (v.status === "cancelled") groups[vid].cancelled++;
      else if (v.status === "rejected") groups[vid].rejected++;
    }
    return Object.values(groups).sort((a, b) => a.vessel.localeCompare(b.vessel));
  }, [filtered, yachts]);

  function downloadCsv(yachtId: string | null) {
    const rows = yachtId ? filtered.filter(v => v.yacht_id === yachtId) : filtered;
    const yName = yachtId ? (yachts.find(y => y.id === yachtId)?.vessel_name ?? "All") : "All";
    const headers = ["Given Name","Surname","Nationality","Passport No.","Rank","Visa Reference","Visa Issuance","Visa Expiry","Sign On","Sign Off","Status"];
    const esc = (v: string | null | undefined) => { const s = v ?? ""; return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s; };
    const lines = [headers.join(","), ...rows.map(r => [
      esc(r.given_name), esc(r.surname), esc(r.nationality), esc(r.passport_number),
      esc(r.rank_rating), esc(r.visa_number), esc(fmtDate(r.visa_issuance_date)),
      esc(fmtDate(r.visa_expiry)), esc(fmtDate(r.sign_on_date)), esc(fmtDate(r.sign_off_date)),
      esc(STATUS_CONFIG[r.status]?.label ?? r.status)
    ].join(","))];
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `Visa-Report-${yName.replace(/[^a-zA-Z0-9]/g, "-")}.csv`; a.click();
  }

  function downloadPdf(yachtId: string) {
    window.open(`/api/visa/export?yacht_id=${yachtId}&format=pdf`, "_blank");
  }

  async function emailReport(yachtId: string) {
    if (!user?.email) { toast.error("No user email found"); return; }
    setEmailing(true);
    try {
      const res = await fetch("/api/visa/export/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yacht_id: yachtId, to_email: user.email }),
      });
      const json = await res.json();
      if (json.ok) toast.success(`Report emailed to ${user.email}`);
      else toast.error(`Email failed: ${json.error}`);
    } catch (e: any) {
      toast.error(`Email error: ${e.message}`);
    } finally {
      setEmailing(false);
    }
  }

  // Group filtered by yacht for per-yacht export
  const byYacht = useMemo(() => {
    const m = new Map<string, { vessel: string; count: number }>();
    for (const v of filtered) {
      if (!v.yacht_id) continue;
      if (!m.has(v.yacht_id)) m.set(v.yacht_id, { vessel: yachts.find(y => y.id === v.yacht_id)?.vessel_name ?? v.yacht_id, count: 0 });
      m.get(v.yacht_id)!.count++;
    }
    return [...m.entries()].sort((a, b) => a[1].vessel.localeCompare(b[1].vessel));
  }, [filtered, yachts]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/70 bg-card/80 px-6 py-3.5 backdrop-blur">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Crew & Immigration</div>
          <h1 className="mt-0.5 font-display text-[1.15rem] font-semibold tracking-tight">Visa Reports</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/60 overflow-hidden text-xs">
            <button onClick={() => setReportType("visa")} className={cn("px-3 py-1.5 font-medium transition-colors", reportType === "visa" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")}>Visa Applications</button>
            <button onClick={() => setReportType("immigration")} className={cn("px-3 py-1.5 font-medium transition-colors", reportType === "immigration" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")}>Immigration Summary</button>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0"><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 border-b border-border/40 bg-muted/10 px-6 py-2.5">
        <Filter className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        <Select value={filterYacht} onValueChange={setFilterYacht}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All Vessels" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vessels</SelectItem>
            {yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/60">From</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/60">To</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-36 text-xs" />
        </div>
        <div className="ml-auto text-xs text-muted-foreground/60 font-medium">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</div>
        <Button size="sm" variant="outline" onClick={() => downloadCsv(filterYacht === "all" ? null : filterYacht)} className="h-8 gap-1.5 text-xs">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {reportType === "visa" ? (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border/60">
                <tr>
                  {["Vessel","Given Name","Surname","Nationality","Passport No.","Visa Reference","Visa Issuance","Visa Expiry","Sign On","Sign Off","Status"].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground/80 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-muted-foreground/50">No records match the selected filters</td></tr>
                ) : filtered.map((v, i) => {
                  const cfg = STATUS_CONFIG[v.status] ?? STATUS_CONFIG.draft;
                  return (
                    <tr key={v.id} className={cn("border-b border-border/40 hover:bg-muted/20 transition-colors", i % 2 === 0 ? "" : "bg-muted/10")}>
                      <td className="px-3 py-2 font-medium text-foreground/80">{yachts.find(y => y.id === v.yacht_id)?.vessel_name ?? "—"}</td>
                      <td className="px-3 py-2">{v.given_name ?? "—"}</td>
                      <td className="px-3 py-2 font-medium">{v.surname ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{v.nationality ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10.5px]">{v.passport_number ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10.5px]">{v.visa_number ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(v.visa_issuance_date)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(v.visa_expiry)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(v.sign_on_date)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(v.sign_off_date)}</td>
                      <td className="px-3 py-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", cfg.color)}>{cfg.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total", count: filtered.length, color: "text-foreground" },
                { label: "Approved / Completed", count: filtered.filter(v => v.status === "approved" || v.status === "completed").length, color: "text-emerald-400" },
                { label: "Cancelled", count: filtered.filter(v => v.status === "cancelled").length, color: "text-slate-400" },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-border/60 bg-card/60 p-4 text-center">
                  <div className={cn("text-2xl font-bold font-display", s.color)}>{s.count}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Per-yacht breakdown */}
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 border-b border-border/60">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground/80">Vessel</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground/80">Total</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-emerald-400/80">Approved</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-slate-400/80">Cancelled</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-red-400/80">Rejected/Denied</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground/80">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {immSummary.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground/50">No data</td></tr>
                  ) : immSummary.map((g, i) => {
                    const yId = yachts.find(y => y.vessel_name === g.vessel)?.id;
                    return (
                      <tr key={g.vessel} className={cn("border-b border-border/40", i % 2 === 0 ? "" : "bg-muted/10")}>
                        <td className="px-4 py-2.5 font-medium">{g.vessel}</td>
                        <td className="px-3 py-2.5 text-center font-bold">{g.total}</td>
                        <td className="px-3 py-2.5 text-center text-emerald-400 font-semibold">{g.approved}</td>
                        <td className="px-3 py-2.5 text-center text-slate-400 font-semibold">{g.cancelled}</td>
                        <td className="px-3 py-2.5 text-center text-red-400 font-semibold">{g.rejected}</td>
                        <td className="px-4 py-2">
                          {yId && (
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => downloadCsv(yId)} className="rounded px-2 py-1 text-[10.5px] bg-muted/30 hover:bg-muted/60 transition font-medium">CSV</button>
                              <button onClick={() => downloadPdf(yId)} className="rounded px-2 py-1 text-[10.5px] bg-muted/30 hover:bg-muted/60 transition font-medium">PDF</button>
                              <button onClick={() => emailReport(yId)} disabled={emailing} className="rounded px-2 py-1 text-[10.5px] bg-primary/10 text-primary hover:bg-primary/20 transition font-medium flex items-center gap-1">
                                {emailing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Email
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Individual records */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">All Records</div>
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 border-b border-border/60">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground/80">Given Name</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground/80">Surname</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground/80">Vessel</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground/80">Nationality</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground/80">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((v, i) => {
                      const cfg = STATUS_CONFIG[v.status] ?? STATUS_CONFIG.draft;
                      return (
                        <tr key={v.id} className={cn("border-b border-border/40", i % 2 === 0 ? "" : "bg-muted/10")}>
                          <td className="px-3 py-2">{v.given_name ?? "—"}</td>
                          <td className="px-3 py-2 font-medium">{v.surname ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{yachts.find(y => y.id === v.yacht_id)?.vessel_name ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{v.nationality ?? "—"}</td>
                          <td className="px-3 py-2"><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", cfg.color)}>{cfg.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function VisasPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const activeVessel = useActiveVessel();
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
  const [showReport, setShowReport] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "csv" | "email" | null>(null);

  useEffect(() => { void load(); void loadCrew(); void loadYachts(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() => (supabase as any)
      .from("visa_applications").select("*").order("created_at", { ascending: false }));
    if (error) toast.error(error.message);
    else setVisas(data ?? []);
    setLoading(false);
  }
  async function loadCrew() {
    const { data } = await fetchAllRows(() => (supabase as any).from("crew_members").select("id, first_name, last_name, rank, yacht_id").order("last_name"));
    setCrew(data ?? []);
  }
  async function loadYachts() {
    const { data } = await fetchAllRows(() => supabase.from("yachts").select("id, vessel_name").order("vessel_name"));
    setYachts((data ?? []) as Yacht[]);
  }

  function openNew() { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }
  function openEdit(v: VisaApplication) {
    setEditing(v);
    setForm({ crew_member_id: v.crew_member_id ?? "", yacht_id: v.yacht_id ?? "", visa_type: v.visa_type,
      destination_country: v.destination_country ?? "", destination_city: v.destination_city ?? "",
      planned_arrival: v.planned_arrival ?? "", planned_departure: v.planned_departure ?? "",
      priority: v.priority, assigned_to: v.assigned_to ?? "", application_notes: v.application_notes ?? "" });
    setOpen(true);
  }

  async function handleSave() {
    setBusy(true);
    try {
      const payload: any = {
        crew_member_id: form.crew_member_id || null,
        yacht_id: form.yacht_id || (form.crew_member_id ? crew.find(c => c.id === form.crew_member_id)?.yacht_id ?? null : null),
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
      const { data: saved, error } = editing
        ? await db.from("visa_applications").update(payload).eq("id", editing.id).select("id").single()
        : await db.from("visa_applications").insert([payload]).select("id").single();
      if (error) throw error;
      toast.success(editing ? "Application updated" : "Visa application created");
      if (saved?.id) doPushToSharePoint({ data: { target: "visa_applications", id: saved.id } } as any).catch(() => {});
      setOpen(false);
      void load();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally { setBusy(false); }
  }

  async function updateStatus(id: string, status: string) {
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === "submitted") patch.submitted_at = new Date().toISOString();
    if (status === "approved")  patch.approved_at = new Date().toISOString();
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

  // Per-vessel export actions
  async function handleExport(format: "pdf" | "csv" | "email") {
    const yachtId = selected?.yacht_id ?? (activeVessel ?? "");
    if (!yachtId) { toast.error("Select a vessel first"); return; }
    if (format === "pdf") {
      window.open(`/api/visa/export?yacht_id=${yachtId}&format=pdf`, "_blank");
      return;
    }
    if (format === "csv") {
      window.open(`/api/visa/export?yacht_id=${yachtId}&format=csv`);
      return;
    }
    if (format === "email") {
      if (!user?.email) { toast.error("No email address found"); return; }
      setExporting("email");
      try {
        const res = await fetch("/api/visa/export/email", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yacht_id: yachtId, to_email: user.email }),
        });
        const json = await res.json();
        if (json.ok) toast.success(`Report emailed to ${user.email}`);
        else toast.error(`Email failed: ${json.error}`);
      } catch (e: any) {
        toast.error(`Email error: ${e.message}`);
      } finally { setExporting(null); }
    }
  }

  const yachtName = (id: string | null) => yachts.find(y => y.id === id)?.vessel_name ?? "—";

  const filtered = useMemo(() => visas.filter(v => {
    if (filterStatus !== "all" && v.status !== filterStatus) return false;
    if (activeVessel && v.yacht_id !== activeVessel) return false;
    if (q.trim()) {
      const s = q.toLowerCase();
      const hay = [displayName(v), v.visa_type, v.destination_country, v.jls_reference, v.visa_number, v.nationality, v.passport_number].join(" ").toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }), [visas, filterStatus, q, activeVessel]);

  if (showReport) {
    return <ReportView visas={visas} yachts={yachts} onClose={() => setShowReport(false)} />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Polaris / Crew & Immigration</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">Visa Applications</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="h-9 w-48 pl-8 text-sm" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setShowReport(true)} className="h-9 gap-1.5 text-xs px-3">
            <BarChart3 className="h-3.5 w-3.5" /> Reports
          </Button>
          {(selected?.yacht_id ?? activeVessel) && (
            <div className="flex items-center gap-1 border border-border/50 rounded-lg p-0.5">
              <Button size="sm" variant="ghost" onClick={() => handleExport("pdf")} className="h-7 gap-1 text-[11px] px-2" title="Export PDF">
                <Download className="h-3 w-3" /> PDF
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleExport("csv")} className="h-7 gap-1 text-[11px] px-2" title="Export CSV">
                <FileSpreadsheet className="h-3 w-3" /> CSV
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleExport("email")} disabled={exporting === "email"} className="h-7 gap-1 text-[11px] px-2" title="Email report">
                {exporting === "email" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Email
              </Button>
            </div>
          )}
          <Button size="sm" onClick={() => navigate({ to: "/crew-immigration/visas/new" as any })} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm">
            <Plus className="h-3.5 w-3.5" /> New Application
          </Button>
        </div>
      </header>

      {/* Status pipeline */}
      <div className="flex items-center gap-0 border-b border-border/40 bg-muted/10 px-6">
        {STATUS_FLOW.map((s, i) => {
          const cfg = STATUS_CONFIG[s];
          const count = visas.filter(v => v.status === s).length;
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
              className={cn("flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
                filterStatus === s ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <span className={cn("rounded-full px-1.5 py-px text-[10px] font-bold", cfg.color)}>{count}</span>
              {cfg.label}
              {i < STATUS_FLOW.length - 1 && <ChevronRight className="h-3 w-3 ml-1 text-border" />}
            </button>
          );
        })}
      </div>

      {/* Main */}
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
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {filtered.map(v => {
                const cfg = STATUS_CONFIG[v.status] ?? STATUS_CONFIG.draft;
                const Icon = cfg.icon;
                const isSelected = selected?.id === v.id;
                const name = displayName(v);
                return (
                  <div key={v.id} onClick={() => setSelected(isSelected ? null : v)}
                    className={cn("cursor-pointer rounded-xl border p-4 transition-all hover:border-border",
                      isSelected ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/60 hover:bg-card")}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                        {initials(name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{name}</span>
                          {v.rank_rating && <span className="text-[10px] text-muted-foreground/60 font-medium">{v.rank_rating}</span>}
                          <span className={cn("text-[10.5px] font-bold uppercase tracking-wide", PRIORITY_CONFIG[v.priority])}>
                            {v.priority !== "normal" ? v.priority : ""}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {v.visa_type} · {v.nationality ?? v.destination_country ?? "—"}
                          {v.visa_number && <span className="ml-2 font-mono text-[10.5px] text-muted-foreground/60">{v.visa_number}</span>}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground/60 mt-0.5">
                          {v.sign_on_date ? `Sign On: ${fmtDate(v.sign_on_date)}` : (v.planned_arrival ? `Arrival: ${fmtDate(v.planned_arrival)}` : "No date")}
                          {v.visa_expiry && ` · Expires: ${fmtDate(v.visa_expiry)}`}
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
                  ["Crew Member",  displayName(selected)],
                  ["Vessel",       yachtName(selected.yacht_id)],
                  ["Nationality",  selected.nationality ?? "—"],
                  ["Passport No.", selected.passport_number ?? "—"],
                  ["Rank / Rating",selected.rank_rating ?? "—"],
                  ["Visa Type",    selected.visa_type],
                  ["Visa Reference", selected.visa_number ?? "—"],
                  ["Visa Issuance", fmtDate(selected.visa_issuance_date)],
                  ["Visa Expiry",  fmtDate(selected.visa_expiry)],
                  ["Sign On",      fmtDate(selected.sign_on_date)],
                  ["Sign Off",     fmtDate(selected.sign_off_date)],
                  ["1st Entry",    fmtDate(selected.first_entry_expiry)],
                  ["Priority",     selected.priority.charAt(0).toUpperCase() + selected.priority.slice(1)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-muted-foreground/70 shrink-0">{k}</span>
                    <span className="font-medium text-right truncate max-w-[140px]" title={v ?? ""}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-vessel export from detail panel */}
            {selected.yacht_id && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Export Vessel Report</div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-8 gap-1 text-xs"
                    onClick={() => window.open(`/api/visa/export?yacht_id=${selected.yacht_id}&format=pdf`, "_blank")}>
                    <Download className="h-3 w-3" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-8 gap-1 text-xs"
                    onClick={() => window.open(`/api/visa/export?yacht_id=${selected.yacht_id}&format=csv`)}>
                    <FileSpreadsheet className="h-3 w-3" /> CSV
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-8 gap-1 text-xs" disabled={exporting === "email"}
                    onClick={async () => {
                      if (!user?.email || !selected.yacht_id) return;
                      setExporting("email");
                      try {
                        const res = await fetch("/api/visa/export/email", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ yacht_id: selected.yacht_id, to_email: user.email }),
                        });
                        const j = await res.json();
                        if (j.ok) toast.success("Emailed to " + user.email);
                        else toast.error("Email failed: " + j.error);
                      } catch { toast.error("Email error"); }
                      finally { setExporting(null); }
                    }}>
                    {exporting === "email" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Email
                  </Button>
                </div>
              </div>
            )}

            {/* Status update */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Update Status</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[...STATUS_FLOW, "cancelled"].filter(s => s !== selected.status).map(s => {
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
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Crew Member</Label>
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
              <Textarea value={form.application_notes} onChange={e => setForm(f => ({ ...f, application_notes: e.target.value }))} rows={2} className="resize-none text-sm" placeholder="Any special requirements…" />
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
              The visa application for <strong>{deleteTarget ? displayName(deleteTarget) : ""}</strong> will be permanently deleted.
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
