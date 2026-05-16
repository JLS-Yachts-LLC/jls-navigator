import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sailboat, Plus, Pencil, Trash2, Loader2, Search, ExternalLink,
  FileCheck2, CheckCircle2, Circle, ChevronDown, SlidersHorizontal,
  CalendarDays, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type SmallBoat = {
  id: string;
  boat_name: string;
  status: string | null;
  reg_type: string | null;
  authority: string | null;
  reg_start_date: string | null;
  reg_end_date: string | null;
  boat_type: string | null;
  reg_sub_type: string | null;
  eight_meters_or_below: boolean;
  marine_craft_length: string | null;
  client_email: string | null;
  login_username: string | null;
  login_password: string | null;
  quotation_no: string | null;
  signed_quote: boolean;
  quotation_approved: boolean;
  doc_emirates_id: boolean;
  doc_passport_copy: boolean;
  doc_visa_copy: boolean;
  doc_salary_certificate: boolean;
  doc_partnership_trade_license: boolean;
  doc_title_deed: boolean;
  doc_trade_license: boolean;
  doc_establishment_card: boolean;
  doc_builder_certificate: boolean;
  doc_proof_of_ownership: boolean;
  doc_cancellation_certificate: boolean;
  doc_sale_agreement: boolean;
  doc_customs_clearance: boolean;
  doc_tdra_license: boolean;
  doc_insurance_policy: boolean;
  doc_trailer_registration: boolean;
  doc_environment_certificate: boolean;
  doc_stability_booklet: boolean;
  document_submission_date: string | null;
  inspection_date: string | null;
  inspection_location: string | null;
  pro: string | null;
  receipts: string | null;
  marine_craft_license: string | null;
  link_to_folder: string | null;
  notes: string | null;
  send_email: boolean;
  archive: boolean;
  created_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = ["Registered", "Working on it", "Pending", "Archived"];
const BOAT_TYPES = ["Powerboat", "Jet Ski", "Sailing Yacht", "Motor Yacht", "Other"];
const AUTHORITIES = ["DMA", "FTA", "Other"];
const REG_TYPES = [
  "Pleasure",
  "Commercial",
  "New Reg Dubai Pleasure Above 12",
  "New Reg Dubai Pleasure Below 12",
  "New Reg Dubai Commercial Below 12",
  "New Reg DS <12",
  "Other",
];
const REG_SUB_TYPES = ["New Reg", "Reg. Renewal", "Transfer", "Reg. Cxl"];

const DOC_FIELDS: { key: keyof SmallBoat; label: string }[] = [
  { key: "doc_emirates_id", label: "Emirates ID" },
  { key: "doc_passport_copy", label: "Passport Copy" },
  { key: "doc_visa_copy", label: "Visa Copy" },
  { key: "doc_salary_certificate", label: "Salary Certificate (AED 20k+)" },
  { key: "doc_partnership_trade_license", label: "Partnership / Commercial Trade License (Dubai)" },
  { key: "doc_title_deed", label: "Title Deed (Freehold Property)" },
  { key: "doc_trade_license", label: "Valid Dubai-Issued Trade License" },
  { key: "doc_establishment_card", label: "Establishment Card" },
  { key: "doc_builder_certificate", label: "Marine Craft Builder Certificate" },
  { key: "doc_proof_of_ownership", label: "Proof of Ownership / Attested Purchase Invoice" },
  { key: "doc_cancellation_certificate", label: "Marine Craft Cancellation Certificate" },
  { key: "doc_sale_agreement", label: "Attested Sale Agreement" },
  { key: "doc_customs_clearance", label: "Customs Clearance Certificate" },
  { key: "doc_tdra_license", label: "TDRA – Ship Station License" },
  { key: "doc_insurance_policy", label: "Insurance Policy (valid 13 months)" },
  { key: "doc_trailer_registration", label: "Trailer Registration / Annual Berth Contract" },
  { key: "doc_environment_certificate", label: "ESMA Environment Specifications Certificate" },
  { key: "doc_stability_booklet", label: "Stability Booklet (>12 passengers)" },
];

const EMPTY_FORM: Omit<SmallBoat, "id" | "created_at"> = {
  boat_name: "",
  status: "Working on it",
  reg_type: "",
  authority: "",
  reg_start_date: null,
  reg_end_date: null,
  boat_type: "",
  reg_sub_type: "",
  eight_meters_or_below: false,
  marine_craft_length: "",
  client_email: "",
  login_username: "",
  login_password: "",
  quotation_no: "",
  signed_quote: false,
  quotation_approved: false,
  doc_emirates_id: false,
  doc_passport_copy: false,
  doc_visa_copy: false,
  doc_salary_certificate: false,
  doc_partnership_trade_license: false,
  doc_title_deed: false,
  doc_trade_license: false,
  doc_establishment_card: false,
  doc_builder_certificate: false,
  doc_proof_of_ownership: false,
  doc_cancellation_certificate: false,
  doc_sale_agreement: false,
  doc_customs_clearance: false,
  doc_tdra_license: false,
  doc_insurance_policy: false,
  doc_trailer_registration: false,
  doc_environment_certificate: false,
  doc_stability_booklet: false,
  document_submission_date: null,
  inspection_date: null,
  inspection_location: "",
  pro: "",
  receipts: "",
  marine_craft_license: "",
  link_to_folder: "",
  notes: "",
  send_email: false,
  archive: false,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isExpired(end: string | null) {
  if (!end) return false;
  return new Date(end) < new Date();
}

function docProgress(boat: SmallBoat) {
  const total = DOC_FIELDS.length;
  const done = DOC_FIELDS.filter(f => boat[f.key] === true).length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function statusColor(s: string | null) {
  switch (s) {
    case "Registered": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "Working on it": return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "Pending": return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

// ─── Boolean toggle row ───────────────────────────────────────────────────────

function BoolCheck({
  value, onChange, label,
}: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition text-left w-full"
    >
      {value
        ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        : <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
      <span className={value ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SmallBoatRegistrationPage() {
  const [boats, setBoats] = useState<SmallBoat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [authorityFilter, setAuthorityFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SmallBoat | null>(null);
  const [form, setForm] = useState<Omit<SmallBoat, "id" | "created_at">>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("small_boats")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setBoats((data ?? []) as SmallBoat[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = boats;
    if (statusFilter !== "all") list = list.filter(b => b.status === statusFilter);
    if (authorityFilter !== "all") list = list.filter(b => b.authority === authorityFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(b =>
        b.boat_name.toLowerCase().includes(s) ||
        (b.client_email ?? "").toLowerCase().includes(s) ||
        (b.boat_type ?? "").toLowerCase().includes(s) ||
        (b.reg_type ?? "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [boats, statusFilter, authorityFilter, search]);

  const stats = useMemo(() => ({
    total: boats.length,
    registered: boats.filter(b => b.status === "Registered").length,
    inProgress: boats.filter(b => b.status === "Working on it").length,
    expiring: boats.filter(b => {
      if (!b.reg_end_date) return false;
      const d = new Date(b.reg_end_date);
      const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 30;
    }).length,
  }), [boats]);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setOpen(true);
  }

  function openEdit(b: SmallBoat) {
    setEditing(b);
    const { id, created_at, ...rest } = b;
    setForm(rest);
    setOpen(true);
  }

  function setF<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.boat_name.trim()) { toast.error("Boat name is required"); return; }
    setBusy(true);
    try {
      const payload = {
        ...form,
        boat_name: form.boat_name.trim(),
        reg_type: form.reg_type || null,
        authority: form.authority || null,
        boat_type: form.boat_type || null,
        reg_sub_type: form.reg_sub_type || null,
        marine_craft_length: form.marine_craft_length || null,
        client_email: form.client_email || null,
        login_username: form.login_username || null,
        login_password: form.login_password || null,
        quotation_no: form.quotation_no || null,
        inspection_location: form.inspection_location || null,
        pro: form.pro || null,
        receipts: form.receipts || null,
        marine_craft_license: form.marine_craft_license || null,
        link_to_folder: form.link_to_folder || null,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await (supabase as any).from("small_boats").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Boat updated");
      } else {
        const { error } = await (supabase as any).from("small_boats").insert([payload]);
        if (error) throw error;
        toast.success("Boat added");
      }
      setOpen(false);
      await load();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function handleDelete(b: SmallBoat) {
    if (!confirm(`Delete "${b.boat_name}"? This cannot be undone.`)) return;
    const { error } = await (supabase as any).from("small_boats").delete().eq("id", b.id);
    if (error) toast.error(error.message);
    else { toast.success("Boat deleted"); await load(); }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/40 px-6 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span>Port &amp; Operations</span>
              <span className="opacity-40">/</span>
              <span className="text-foreground">Small Boat Registration</span>
            </div>
            <h1 className="font-display text-xl font-semibold tracking-tight flex items-center gap-2">
              <Sailboat className="h-5 w-5 text-primary" /> Small Boat Registration
            </h1>
          </div>
          <Button onClick={openNew} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Register Boat
          </Button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Boats", value: stats.total, color: "text-primary" },
            { label: "Registered", value: stats.registered, color: "text-emerald-400" },
            { label: "In Progress", value: stats.inProgress, color: "text-amber-400" },
            { label: "Expiring Soon", value: stats.expiring, color: "text-red-400" },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                <div className={`font-display text-xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                <SlidersHorizontal className="h-3 w-3" />
                {statusFilter === "all" ? "All Statuses" : statusFilter}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}>
                <DropdownMenuRadioItem value="all">All Statuses</DropdownMenuRadioItem>
                {STATUSES.map(s => <DropdownMenuRadioItem key={s} value={s}>{s}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Authority filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                {authorityFilter === "all" ? "All Authorities" : authorityFilter}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Authority</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={authorityFilter} onValueChange={setAuthorityFilter}>
                <DropdownMenuRadioItem value="all">All Authorities</DropdownMenuRadioItem>
                {AUTHORITIES.map(a => <DropdownMenuRadioItem key={a} value={a}>{a}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {(statusFilter !== "all" || authorityFilter !== "all" || search) && (
            <button
              onClick={() => { setStatusFilter("all"); setAuthorityFilter("all"); setSearch(""); }}
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              Clear filters
            </button>
          )}
          {/* Search */}
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search boats…"
              className="h-7 w-56 pl-8 text-xs"
            />
          </div>
        </div>
      </header>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Sailboat className="h-10 w-10 opacity-30" />
            <p className="text-sm">No boats found. Register your first small boat.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium w-8">●</th>
                  <th className="px-3 py-2 text-left font-medium">Boat Name</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Boat Type</th>
                  <th className="px-3 py-2 text-left font-medium">Authority</th>
                  <th className="px-3 py-2 text-left font-medium">Reg Type</th>
                  <th className="px-3 py-2 text-left font-medium">Reg End</th>
                  <th className="px-3 py-2 text-left font-medium">Docs</th>
                  <th className="px-3 py-2 text-left font-medium">PRO</th>
                  <th className="px-3 py-2 text-left font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => {
                  const { done, total, pct } = docProgress(b);
                  const expired = isExpired(b.reg_end_date);
                  return (
                    <tr key={b.id} className="border-b border-border/50 hover:bg-accent/20 transition group">
                      <td className="px-3 py-2 text-muted-foreground tabular-nums text-xs">{String(i + 1).padStart(3, "0")}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground flex items-center gap-1.5">
                          {b.boat_name}
                          {b.link_to_folder && (
                            <a
                              href={b.link_to_folder.startsWith("http") ? b.link_to_folder : `https://newhorizonit.sharepoint.com${b.link_to_folder}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title="Open SharePoint folder"
                              className="text-muted-foreground hover:text-primary transition"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        {b.client_email && <div className="text-[10px] text-muted-foreground">{b.client_email}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor(b.status)}`}>
                          {b.status ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-foreground/80 whitespace-nowrap">{b.boat_type ?? "—"}</td>
                      <td className="px-3 py-2 text-foreground/80">{b.authority ?? "—"}</td>
                      <td className="px-3 py-2 text-foreground/75 text-xs max-w-[180px] truncate">{b.reg_type ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {b.reg_end_date ? (
                          <span className={`flex items-center gap-1 text-xs ${expired ? "text-red-400" : "text-foreground/75"}`}>
                            {expired && <AlertTriangle className="h-3 w-3" />}
                            {fmtDate(b.reg_end_date)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : pct > 50 ? "bg-amber-400" : "bg-muted-foreground/30"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{done}/{total}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-foreground/75 text-xs">{b.pro ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => openEdit(b)}
                            className="rounded p-1 hover:bg-muted transition"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handleDelete(b)}
                            className="rounded p-1 hover:bg-destructive/10 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive/70" />
                          </button>
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

      {/* Add / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sailboat className="h-4 w-4 text-primary" />
              {editing ? `Edit — ${editing.boat_name}` : "Register New Small Boat"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basic" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid grid-cols-5 w-full shrink-0">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="dates">Dates</TabsTrigger>
              <TabsTrigger value="commercial">Commercial</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="other">Other</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-4">
              {/* ── Basic Info ── */}
              <TabsContent value="basic" className="space-y-4 px-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <Label>Boat Name <span className="text-destructive">*</span></Label>
                    <Input
                      value={form.boat_name}
                      onChange={e => setF("boat_name", e.target.value)}
                      placeholder="e.g. DESERT EAGLE 1"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={form.status ?? ""} onValueChange={v => setF("status", v)}>
                      <SelectTrigger><SelectValue placeholder="Select status…" /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Boat Type</Label>
                    <Select value={form.boat_type ?? ""} onValueChange={v => setF("boat_type", v)}>
                      <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                      <SelectContent>
                        {BOAT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Authority</Label>
                    <Select value={form.authority ?? ""} onValueChange={v => setF("authority", v)}>
                      <SelectTrigger><SelectValue placeholder="Select authority…" /></SelectTrigger>
                      <SelectContent>
                        {AUTHORITIES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reg. Sub-Type</Label>
                    <Select value={form.reg_sub_type ?? ""} onValueChange={v => setF("reg_sub_type", v)}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {REG_SUB_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Registration Type</Label>
                    <Select value={form.reg_type ?? ""} onValueChange={v => setF("reg_type", v)}>
                      <SelectTrigger><SelectValue placeholder="Select registration type…" /></SelectTrigger>
                      <SelectContent>
                        {REG_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Marine Craft Length</Label>
                    <Input
                      value={form.marine_craft_length ?? ""}
                      onChange={e => setF("marine_craft_length", e.target.value)}
                      placeholder="e.g. 6.32m"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Client Email</Label>
                    <Input
                      type="email"
                      value={form.client_email ?? ""}
                      onChange={e => setF("client_email", e.target.value)}
                      placeholder="client@example.com"
                    />
                  </div>
                </div>
                <BoolCheck
                  value={form.eight_meters_or_below}
                  onChange={v => setF("eight_meters_or_below", v)}
                  label="8 meters or below"
                />
              </TabsContent>

              {/* ── Dates ── */}
              <TabsContent value="dates" className="space-y-4 px-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Reg. Start Date</Label>
                    <Input
                      type="date"
                      value={form.reg_start_date ?? ""}
                      onChange={e => setF("reg_start_date", e.target.value || null)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reg. End Date</Label>
                    <Input
                      type="date"
                      value={form.reg_end_date ?? ""}
                      onChange={e => setF("reg_end_date", e.target.value || null)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Document Submission Date</Label>
                    <Input
                      type="date"
                      value={form.document_submission_date ?? ""}
                      onChange={e => setF("document_submission_date", e.target.value || null)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Inspection Date</Label>
                    <Input
                      type="date"
                      value={form.inspection_date ?? ""}
                      onChange={e => setF("inspection_date", e.target.value || null)}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Inspection Location</Label>
                    <Input
                      value={form.inspection_location ?? ""}
                      onChange={e => setF("inspection_location", e.target.value)}
                      placeholder="e.g. Dubai Marina, Port Rashid…"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* ── Commercial ── */}
              <TabsContent value="commercial" className="space-y-4 px-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Quotation No.</Label>
                    <Input
                      value={form.quotation_no ?? ""}
                      onChange={e => setF("quotation_no", e.target.value)}
                      placeholder="e.g. Q-24-4289"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>PRO</Label>
                    <Input
                      value={form.pro ?? ""}
                      onChange={e => setF("pro", e.target.value)}
                      placeholder="PRO name…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Marine Craft License</Label>
                    <Input
                      value={form.marine_craft_license ?? ""}
                      onChange={e => setF("marine_craft_license", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Receipts</Label>
                    <Input
                      value={form.receipts ?? ""}
                      onChange={e => setF("receipts", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Login Username</Label>
                    <Input
                      value={form.login_username ?? ""}
                      onChange={e => setF("login_username", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Login Password</Label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={form.login_password ?? ""}
                      onChange={e => setF("login_password", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <BoolCheck value={form.signed_quote} onChange={v => setF("signed_quote", v)} label="Signed Quote received" />
                  <BoolCheck value={form.quotation_approved} onChange={v => setF("quotation_approved", v)} label="Quotation Approved" />
                  <BoolCheck value={form.send_email} onChange={v => setF("send_email", v)} label="Send Email" />
                </div>
              </TabsContent>

              {/* ── Documents ── */}
              <TabsContent value="documents" className="px-1">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Tick documents that have been received / are in order.</p>
                  <span className="text-xs font-medium text-foreground">
                    {DOC_FIELDS.filter(f => (form as any)[f.key]).length} / {DOC_FIELDS.length} received
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-0.5">
                  {DOC_FIELDS.map(f => (
                    <BoolCheck
                      key={f.key}
                      value={(form as any)[f.key] as boolean}
                      onChange={v => setF(f.key as any, v)}
                      label={f.label}
                    />
                  ))}
                </div>
              </TabsContent>

              {/* ── Other ── */}
              <TabsContent value="other" className="space-y-4 px-1">
                <div className="space-y-1.5">
                  <Label>SharePoint Folder Link</Label>
                  <Input
                    value={form.link_to_folder ?? ""}
                    onChange={e => setF("link_to_folder", e.target.value)}
                    placeholder="https://newhorizonit.sharepoint.com/sites/PortOperations…"
                  />
                  <p className="text-[10px] text-muted-foreground">Paste the full SharePoint URL or the relative path from the CSV.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes &amp; Updates</Label>
                  <Textarea
                    rows={4}
                    value={form.notes ?? ""}
                    onChange={e => setF("notes", e.target.value)}
                    placeholder="Any additional notes or updates…"
                  />
                </div>
                <BoolCheck value={form.archive} onChange={v => setF("archive", v)} label="Archive this record" />
              </TabsContent>
            </div>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t border-border mt-2 shrink-0">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Register Boat"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
