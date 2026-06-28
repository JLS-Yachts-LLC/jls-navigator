/**
 * Crew Placement — managed/placed crew suite (roster, certifications, contracts,
 * payroll, documents, templates). Separate from the core Crew module; a placed crew
 * record can link to a vessel and (later) to a crew_members row.
 *
 * Phase 1: full roster + certification/contract/payroll/document tracking + template
 * management. Phase 2 (next): PDF generation of contracts & payslips from templates,
 * e-sign hand-off, and payroll calculation.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ContractBuilder } from "@/components/crew-placement/contract-builder";
import {
  Users, BadgeCheck, FileText, Wallet, FolderOpen, LayoutTemplate, Plus, Search,
  Ship, XCircle, Pencil, Anchor as AnchorIcon, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, Loader2, Megaphone, Download, CalendarDays,
} from "lucide-react";

type Tab = "roster" | "vacancies" | "certs" | "contracts" | "leave" | "payroll" | "documents" | "templates";
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "roster", label: "Roster", icon: Users },
  { key: "vacancies", label: "Vacancies & Pool", icon: Megaphone },
  { key: "certs", label: "Certifications", icon: BadgeCheck },
  { key: "contracts", label: "Contracts", icon: FileText },
  { key: "leave", label: "Leave & Rotation", icon: CalendarDays },
  { key: "payroll", label: "Payroll", icon: Wallet },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "templates", label: "Templates", icon: LayoutTemplate },
];

const DEPARTMENTS = ["Bridge", "Deck", "Engineering", "Interior", "Galley", "Other"];
const PLACEMENT_TYPES = ["managed", "placed", "pool"];
const STATUSES = ["active", "available", "onboard", "on_leave", "inactive"];
const CURRENCIES = ["USD", "EUR", "GBP", "AED"];
const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400", onboard: "bg-blue-500/15 text-blue-400",
  available: "bg-amber-500/15 text-amber-400", on_leave: "bg-violet-500/15 text-violet-400",
  inactive: "bg-slate-500/15 text-slate-400",
};
const db = () => supabase as any;
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** Generate a contract/payslip PDF from its template and open it. */
async function genPdf(action: "contract-pdf" | "payslip-pdf", id: string): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  toast.loading("Generating PDF…", { id: "genpdf" });
  try {
    const r = await fetch("/api/crew-placement", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ action, id }),
    });
    const j = await r.json();
    toast.dismiss("genpdf");
    if (j.ok && j.url) { window.open(j.url, "_blank"); return true; }
    toast.error(j.error ?? "Failed to generate"); return false;
  } catch (e: any) { toast.dismiss("genpdf"); toast.error(String(e?.message ?? e)); return false; }
}
const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;

// ── Lightweight modal ─────────────────────────────────────────────────────────
function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[88vh] overflow-auto rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted/50"><XCircle className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>{children}</div>;
}
const fieldCls = "w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

export function CrewPlacementPage() {
  const [tab, setTab] = useState<Tab>("roster");
  const [openCrewId, setOpenCrewId] = useState<string | null>(null);
  const [crew, setCrew] = useState<any[]>([]);
  const [yachts, setYachts] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [vacancies, setVacancies] = useState<any[]>([]);

  useEffect(() => { void loadAll(); }, []);
  async function loadAll() {
    const [c, y, ce, co, pa, dc, te, va] = await Promise.all([
      db().from("placed_crew").select("*, yacht:yachts(vessel_name)").order("full_name"),
      db().from("yachts").select("id, vessel_name, flag").eq("archive", false).order("vessel_name"),
      db().from("crew_placement_certs").select("*, crew:placed_crew(full_name)").order("expiry_date", { ascending: true }),
      db().from("crew_contracts").select("*, crew:placed_crew(full_name), yacht:yachts(vessel_name)").order("created_at", { ascending: false }),
      db().from("crew_payslips").select("*, crew:placed_crew(full_name)").order("period_month", { ascending: false }),
      db().from("crew_placement_documents").select("*, crew:placed_crew(full_name, yacht_id, yacht:yachts(vessel_name))").order("created_at", { ascending: false }),
      db().from("crew_placement_templates").select("*").order("kind"),
      db().from("crew_vacancies").select("*, yacht:yachts(vessel_name), filled:placed_crew!crew_vacancies_filled_by_fkey(full_name)").order("created_at", { ascending: false }),
    ]);
    setCrew(c.data ?? []); setYachts(y.data ?? []); setCerts(ce.data ?? []);
    setContracts(co.data ?? []); setPayslips(pa.data ?? []); setDocs(dc.data ?? []); setTemplates(te.data ?? []); setVacancies(va.data ?? []);
  }

  const kpis = useMemo(() => ({
    managed: crew.filter((c) => c.placement_type === "managed").length,
    onboard: crew.filter((c) => c.status === "onboard").length,
    expiringCerts: certs.filter((c) => { const d = daysUntil(c.expiry_date); return d != null && d <= 60; }).length,
    activeContracts: contracts.filter((c) => c.status === "active" || c.status === "signed").length,
  }), [crew, certs, contracts]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/40 px-6 py-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AnchorIcon className="h-3.5 w-3.5" /> Services <span className="opacity-40">/</span> <span className="text-foreground">Crew Placement</span></div>
        <h1 className="font-display text-xl font-semibold tracking-tight">Crew Placement & Payroll</h1>
      </header>

      {openCrewId ? (
        <CrewProfile crewId={openCrewId} yachts={yachts} templates={templates}
          onBack={() => { setOpenCrewId(null); void loadAll(); }} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-3">
            {[
              { label: "Managed Crew", value: kpis.managed, icon: Users, accent: "text-primary" },
              { label: "Onboard", value: kpis.onboard, icon: Ship, accent: "text-blue-400" },
              { label: "Certs Expiring (60d)", value: kpis.expiringCerts, icon: AlertTriangle, accent: "text-amber-400" },
              { label: "Active Contracts", value: kpis.activeContracts, icon: FileText, accent: "text-emerald-400" },
            ].map((k) => (
              <div key={k.label} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.label}</div><div className={`font-display text-2xl font-bold tabular-nums ${k.accent}`}>{k.value}</div></div>
                <k.icon className={`h-6 w-6 ${k.accent} opacity-60`} />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1 border-b border-border px-6">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-6">
            {tab === "roster" && <Roster crew={crew} yachts={yachts} reload={loadAll} onOpen={setOpenCrewId} />}
            {tab === "vacancies" && <Vacancies vacancies={vacancies} crew={crew} yachts={yachts} reload={loadAll} onOpen={setOpenCrewId} />}
            {tab === "certs" && <Certs certs={certs} crew={crew} reload={loadAll} />}
            {tab === "contracts" && <Contracts contracts={contracts} crew={crew} yachts={yachts} templates={templates} reload={loadAll} />}
            {tab === "leave" && <LeaveRotation crew={crew} />}
            {tab === "payroll" && <Payroll payslips={payslips} crew={crew} templates={templates} reload={loadAll} />}
            {tab === "documents" && <Documents docs={docs} crew={crew} reload={loadAll} />}
            {tab === "templates" && <Templates templates={templates} reload={loadAll} />}
          </div>
        </>
      )}
    </div>
  );
}

// ── Roster ────────────────────────────────────────────────────────────────────
function Roster({ crew, yachts, reload, onOpen }: { crew: any[]; yachts: any[]; reload: () => Promise<void>; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "ship">("ship");
  const [edit, setEdit] = useState<any | null>(null);
  const blank = { full_name: "", email: "", phone: "", nationality: "", rank: "", department: "", placement_type: "managed", status: "active", yacht_id: "", rotation: "", salary: "", currency: "USD", start_date: "" };
  const filtered = crew.filter((c) => !q.trim() || [c.full_name, c.rank, c.nationality, c.yacht?.vessel_name, c.department].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase()));

  async function save(form: any) {
    const row = { ...form, salary: form.salary ? Number(form.salary) : null, yacht_id: form.yacht_id || null, updated_at: new Date().toISOString() };
    Object.keys(row).forEach((k) => row[k] === "" && (row[k] = null));
    const { error } = edit?.id ? await db().from("placed_crew").update(row).eq("id", edit.id) : await db().from("placed_crew").insert(row);
    if (error) return toast.error(error.message);
    toast.success(edit?.id ? "Updated" : "Crew added"); setEdit(null); await reload();
  }

  // Ship view: group by vessel → department.
  const byVessel = useMemo(() => {
    const m = new Map<string, Map<string, any[]>>();
    for (const c of filtered) {
      const v = c.yacht?.vessel_name ?? "Unassigned / Pool";
      const d = c.department ?? "Other";
      if (!m.has(v)) m.set(v, new Map());
      const dm = m.get(v)!;
      if (!dm.has(d)) dm.set(d, []);
      dm.get(d)!.push(c);
    }
    return m;
  }, [filtered]);

  const rowActions = (c: any) => (
    <button onClick={(e) => { e.stopPropagation(); setEdit({ ...blank, ...c, yacht_id: c.yacht_id ?? "", salary: c.salary ?? "", start_date: c.start_date ?? "" }); }}
      className="rounded p-1 text-muted-foreground/60 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search crew…" className="pl-8 h-8 text-sm" /></div>
        <div className="flex h-8 rounded-md border border-border bg-card p-0.5">
          <button onClick={() => setView("ship")} className={`flex items-center gap-1 rounded px-2.5 text-xs ${view === "ship" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}><Ship className="h-3.5 w-3.5" /> Ship View</button>
          <button onClick={() => setView("list")} className={`flex items-center gap-1 rounded px-2.5 text-xs ${view === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}><Users className="h-3.5 w-3.5" /> List</button>
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => setEdit(blank)}><Plus className="h-3.5 w-3.5" /> Add Crew</Button>
      </div>

      {view === "list" ? (
        <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead><tr className="bg-muted/40 border-b border-border">{["Name", "Rank", "Dept", "Nationality", "Type", "Vessel", "Rotation", "Salary", "Status", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border/50">
              {filtered.length === 0 ? <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">No crew yet.</td></tr> :
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/10 cursor-pointer" onClick={() => onOpen(c.id)}>
                    <td className="px-3 py-2 text-xs font-medium">{c.full_name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.rank ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.department ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.nationality ?? "—"}</td>
                    <td className="px-3 py-2 text-xs capitalize">{c.placement_type}</td>
                    <td className="px-3 py-2 text-xs">{c.yacht?.vessel_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.rotation ?? "—"}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{c.salary != null ? `${Number(c.salary).toLocaleString()} ${c.currency ?? ""}` : "—"}</td>
                    <td className="px-3 py-2"><span className={`inline-flex rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase ${STATUS_COLOR[c.status] ?? "bg-muted/60 text-muted-foreground"}`}>{(c.status ?? "").replace(/_/g, " ")}</span></td>
                    <td className="px-3 py-2 text-right">{rowActions(c)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-5">
          {byVessel.size === 0 && <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">No crew yet. Add your first placed/managed crew member.</div>}
          {Array.from(byVessel.entries()).map(([vessel, depts]) => (
            <div key={vessel} className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-2 bg-card/60 px-4 py-2.5 border-b border-border">
                <Ship className="h-4 w-4 text-primary" /><span className="font-semibold text-sm">{vessel}</span>
                <span className="text-[11px] text-muted-foreground">{Array.from(depts.values()).reduce((s, a) => s + a.length, 0)} crew</span>
              </div>
              {DEPARTMENTS.filter((d) => depts.has(d)).concat(Array.from(depts.keys()).filter((d) => !DEPARTMENTS.includes(d))).map((dept) => (
                <div key={dept}>
                  <div className="px-4 pt-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">{dept} <span className="opacity-60">· {depts.get(dept)!.length}</span></div>
                  {depts.get(dept)!.map((c) => (
                    <button key={c.id} onClick={() => onOpen(c.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/10 transition border-t border-border/40">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{c.full_name?.slice(0, 2).toUpperCase()}</div>
                      <div className="flex-1 min-w-0"><div className="text-xs font-medium truncate">{c.full_name}</div><div className="text-[11px] text-muted-foreground truncate">{c.rank ?? "—"} · {c.email ?? "—"}</div></div>
                      <span className="text-[11px] text-muted-foreground hidden sm:block">{c.rotation ?? ""}</span>
                      <span className={`inline-flex rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase ${STATUS_COLOR[c.status] ?? "bg-muted/60 text-muted-foreground"}`}>{(c.status ?? "").replace(/_/g, " ")}</span>
                      {rowActions(c)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {edit && <CrewModal init={edit} yachts={yachts} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  );
}
function CrewModal({ init, yachts, onClose, onSave }: { init: any; yachts: any[]; onClose: () => void; onSave: (f: any) => void }) {
  const [f, setF] = useState(init);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  return (
    <Modal title={init.id ? "Edit Crew" : "Add Crew"} onClose={onClose}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!f.full_name?.trim()} onClick={() => onSave(f)}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Full name"><input className={fieldCls} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></Labeled>
        <Labeled label="Rank / position"><input className={fieldCls} value={f.rank} onChange={(e) => set("rank", e.target.value)} /></Labeled>
        <Labeled label="Email"><input className={fieldCls} value={f.email} onChange={(e) => set("email", e.target.value)} /></Labeled>
        <Labeled label="Phone"><input className={fieldCls} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Labeled>
        <Labeled label="Nationality"><input className={fieldCls} value={f.nationality} onChange={(e) => set("nationality", e.target.value)} /></Labeled>
        <Labeled label="Start date"><input type="date" className={fieldCls} value={f.start_date} onChange={(e) => set("start_date", e.target.value)} /></Labeled>
        <Labeled label="Department"><select className={fieldCls} value={f.department ?? ""} onChange={(e) => set("department", e.target.value)}><option value="">—</option>{DEPARTMENTS.map((t) => <option key={t} value={t}>{t}</option>)}</select></Labeled>
        <Labeled label="Type"><select className={fieldCls} value={f.placement_type} onChange={(e) => set("placement_type", e.target.value)}>{PLACEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Labeled>
        <Labeled label="Status"><select className={fieldCls} value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></Labeled>
        <Labeled label="Vessel association"><select className={fieldCls} value={f.yacht_id} onChange={(e) => set("yacht_id", e.target.value)}><option value="">— none —</option>{yachts.map((y) => <option key={y.id} value={y.id}>{y.vessel_name}</option>)}</select></Labeled>
        <Labeled label="Rotation"><input className={fieldCls} value={f.rotation} onChange={(e) => set("rotation", e.target.value)} placeholder="e.g. 2:2" /></Labeled>
        <Labeled label="Salary"><input type="number" className={fieldCls} value={f.salary} onChange={(e) => set("salary", e.target.value)} /></Labeled>
        <Labeled label="Currency"><select className={fieldCls} value={f.currency} onChange={(e) => set("currency", e.target.value)}>{CURRENCIES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Labeled>
      </div>
    </Modal>
  );
}

// ── Vacancies & Talent Pool ───────────────────────────────────────────────────
const VAC_STATUS: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-400", filled: "bg-blue-500/15 text-blue-400",
  on_hold: "bg-amber-500/15 text-amber-400", closed: "bg-slate-500/15 text-slate-400",
};
const EMP_TYPES = ["Rotational", "Permanent", "Temporary", "Freelance", "Daywork"];

function Vacancies({ vacancies, crew, yachts, reload, onOpen }: { vacancies: any[]; crew: any[]; yachts: any[]; reload: () => Promise<void>; onOpen: (id: string) => void }) {
  const [add, setAdd] = useState(false);
  const pool = useMemo(() => crew.filter((c) => c.placement_type === "pool" || c.status === "available"), [crew]);
  const open = vacancies.filter((v) => v.status === "open");

  async function save(f: any) {
    const row = { ...f, yacht_id: f.yacht_id || null }; Object.keys(row).forEach((k) => row[k] === "" && (row[k] = null));
    const { error } = await db().from("crew_vacancies").insert(row);
    if (error) return toast.error(error.message);
    toast.success("Vacancy posted"); setAdd(false); await reload();
  }
  async function setStatus(id: string, status: string) {
    const { error } = await db().from("crew_vacancies").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    await reload();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[{ l: "Open vacancies", v: open.length, a: "text-emerald-400" }, { l: "Filled", v: vacancies.filter(v => v.status === "filled").length, a: "text-blue-400" }, { l: "Talent pool", v: pool.length, a: "text-primary" }].map(k => (
          <div key={k.l} className="rounded-lg border border-border bg-card px-4 py-3"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.l}</div><div className={`font-display text-2xl font-bold ${k.a}`}>{k.v}</div></div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold flex items-center gap-1.5"><Megaphone className="h-4 w-4 text-primary" /> Vacancies</h3><Button size="sm" className="h-8 gap-1.5" onClick={() => setAdd(true)}><Plus className="h-3.5 w-3.5" /> Post Vacancy</Button></div>
        <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="bg-muted/40 border-b border-border">{["Role", "Vessel", "Dept", "Type", "Salary", "Start", "Status", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border/50">
              {vacancies.length === 0 ? <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">No vacancies posted yet.</td></tr> :
                vacancies.map(v => (
                  <tr key={v.id} className="hover:bg-muted/10">
                    <td className="px-3 py-2 text-xs font-medium">{v.title}{v.rank ? <span className="text-muted-foreground"> · {v.rank}</span> : ""}</td>
                    <td className="px-3 py-2 text-xs">{v.yacht?.vessel_name ?? v.vessel_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{v.department ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{v.employment_type ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{v.salary_range ? `${v.salary_range} ${v.currency ?? ""}` : "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(v.start_date)}</td>
                    <td className="px-3 py-2"><span className={`inline-flex rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase ${VAC_STATUS[v.status] ?? "bg-muted/60 text-muted-foreground"}`}>{(v.status ?? "").replace(/_/g, " ")}</span></td>
                    <td className="px-3 py-2 text-right">
                      <select value={v.status} onChange={(e) => setStatus(v.id, e.target.value)} className="h-6 rounded border border-border bg-background text-[11px] px-1">
                        {["open", "filled", "on_hold", "closed"].map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> Talent Pool <span className="text-[11px] font-normal text-muted-foreground">crew open to work (pool / available)</span></h3>
        {pool.length === 0 ? <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">No crew in the pool. Set a crew member's type to “pool” or status to “available”.</div> : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {pool.map(c => (
              <button key={c.id} onClick={() => onOpen(c.id)} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:border-primary/40 transition">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{c.full_name?.slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0"><div className="text-sm font-medium truncate">{c.full_name}</div><div className="text-[11px] text-muted-foreground truncate">{[c.rank, c.nationality].filter(Boolean).join(" · ") || "—"}</div></div>
                <span className="ml-auto inline-flex rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase bg-amber-500/15 text-amber-400">{c.status === "available" ? "Available" : "Pool"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {add && <SimpleAdd title="Post Vacancy" onClose={() => setAdd(false)} onSave={save}
        init={{ title: "", yacht_id: "", vessel_name: "", department: "", rank: "", employment_type: "Rotational", salary_range: "", currency: "EUR", location: "", start_date: "", status: "open", description: "" }}
        fields={[
          { k: "title", label: "Role / title" }, { k: "yacht_id", label: "Vessel (tracked)", type: "yacht" },
          { k: "vessel_name", label: "Vessel (free text)" }, { k: "department", label: "Department", type: "department" },
          { k: "rank", label: "Rank" }, { k: "employment_type", label: "Type", type: "emptype" },
          { k: "salary_range", label: "Salary range" }, { k: "currency", label: "Currency", type: "currency" },
          { k: "location", label: "Location" }, { k: "start_date", label: "Start", type: "date" },
          { k: "description", label: "Description" },
        ]} crew={[]} yachts={yachts} required={["title"]} />}
    </div>
  );
}

// ── Crew profile (per-crew drill-down) ────────────────────────────────────────
type ProfileTab = "personal" | "documents" | "certs" | "contracts" | "finance" | "payroll";
const PROFILE_TABS: { key: ProfileTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "personal", label: "Personal", icon: Users },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "certs", label: "Certifications", icon: BadgeCheck },
  { key: "contracts", label: "Contracts", icon: FileText },
  { key: "finance", label: "Finance", icon: Wallet },
  { key: "payroll", label: "Payroll", icon: Wallet },
];

function CrewProfile({ crewId, yachts, templates, onBack }: { crewId: string; yachts: any[]; templates: any[]; onBack: () => void }) {
  const [tab, setTab] = useState<ProfileTab>("personal");
  const [c, setC] = useState<any | null>(null);
  const [data, setData] = useState<{ certs: any[]; docs: any[]; contracts: any[]; payslips: any[]; bank: any[] }>({ certs: [], docs: [], contracts: [], payslips: [], bank: [] });
  const [add, setAdd] = useState<string | null>(null);

  useEffect(() => { void load(); }, [crewId]);
  async function load() {
    const [cr, ce, dc, co, pa, bk] = await Promise.all([
      db().from("placed_crew").select("*, yacht:yachts(vessel_name)").eq("id", crewId).maybeSingle(),
      db().from("crew_placement_certs").select("*").eq("placed_crew_id", crewId).order("expiry_date"),
      db().from("crew_placement_documents").select("*").eq("placed_crew_id", crewId).order("created_at", { ascending: false }),
      db().from("crew_contracts").select("*, yacht:yachts(vessel_name)").eq("placed_crew_id", crewId).order("created_at", { ascending: false }),
      db().from("crew_payslips").select("*").eq("placed_crew_id", crewId).order("period_month", { ascending: false }),
      db().from("placed_crew_bank").select("*").eq("placed_crew_id", crewId).order("created_at"),
    ]);
    setC(cr.data); setData({ certs: ce.data ?? [], docs: dc.data ?? [], contracts: co.data ?? [], payslips: pa.data ?? [], bank: bk.data ?? [] });
  }
  async function insert(table: string, row: any) {
    const clean = { ...row, placed_crew_id: crewId }; Object.keys(clean).forEach((k) => clean[k] === "" && (clean[k] = null));
    const { error } = await db().from(table).insert(clean);
    if (error) return toast.error(error.message);
    toast.success("Added"); setAdd(null); await load();
  }
  if (!c) return <div className="py-16 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>;

  const expiryBadge = (d: string | null) => {
    const days = daysUntil(d); if (days == null) return <span className="text-muted-foreground">—</span>;
    const cls = days < 0 ? "bg-red-500/15 text-red-400" : days <= 60 ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400";
    return <span className={`inline-flex rounded-full px-1.5 py-0 text-[10px] font-semibold ${cls}`}>{fmtDate(d)}</span>;
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeftIcon /> Back to roster</button>
      <div className="flex items-center gap-4 mb-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">{c.full_name?.slice(0, 2).toUpperCase()}</div>
        <div>
          <h2 className="font-display text-xl font-semibold">{c.full_name}</h2>
          <p className="text-sm text-muted-foreground">{[c.department, c.rank].filter(Boolean).join(" : ")}{c.yacht?.vessel_name ? ` · ${c.yacht.vessel_name}` : ""}</p>
        </div>
        <span className={`ml-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_COLOR[c.status] ?? "bg-muted/60 text-muted-foreground"}`}>{(c.status ?? "").replace(/_/g, " ")}</span>
      </div>

      <div className="flex items-center gap-1 border-b border-border mb-4">
        {PROFILE_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "personal" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-3xl">
          {[["Email", c.email], ["Phone", c.phone], ["Nationality", c.nationality], ["Date of birth", c.date_of_birth], ["Rank", c.rank], ["Department", c.department], ["Type", c.placement_type], ["Vessel", c.yacht?.vessel_name], ["Rotation", c.rotation], ["Salary", c.salary != null ? `${Number(c.salary).toLocaleString()} ${c.currency ?? ""}` : null], ["Start date", c.start_date]].map(([l, v]) => (
            <div key={l as string} className="rounded-lg border border-border bg-card px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div><div className="text-sm">{(v as any) || "—"}</div></div>
          ))}
        </div>
      )}

      {tab === "documents" && (
        <ProfileList title="Documents" onAdd={() => setAdd("doc")} cols={["Type", "Title", "Added"]}
          rows={data.docs.map((d) => [<span className="capitalize">{d.doc_type}</span>, d.title, fmtDate(d.created_at)])} empty="No documents yet." />
      )}
      {tab === "certs" && (
        <ProfileList title="Certifications" onAdd={() => setAdd("cert")} cols={["Certificate", "Number", "Authority", "Expiry"]}
          rows={data.certs.map((d) => [d.cert_type, d.cert_number ?? "—", d.issuing_authority ?? "—", expiryBadge(d.expiry_date)])} empty="No certificates yet." />
      )}
      {tab === "contracts" && (
        <ProfileList title="Contracts" onAdd={() => setAdd("contract")} cols={["Vessel", "Type", "Start", "End", "Salary", "Status"]}
          rows={data.contracts.map((d) => [d.yacht?.vessel_name ?? "—", d.contract_type ?? "—", fmtDate(d.start_date), fmtDate(d.end_date), d.salary != null ? `${Number(d.salary).toLocaleString()} ${d.currency ?? ""}` : "—", d.status])} empty="No contracts yet." />
      )}
      {tab === "payroll" && (
        <ProfileList title="Payslips" onAdd={() => setAdd("payslip")} cols={["Period", "Gross", "Net", "Currency", "Status"]}
          rows={data.payslips.map((d) => [d.period_month ? new Date(d.period_month).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—", d.gross != null ? Number(d.gross).toLocaleString() : "—", d.net != null ? Number(d.net).toLocaleString() : "—", d.currency, d.status])} empty="No payslips yet." />
      )}
      {tab === "finance" && (
        <ProfileList title="Bank Accounts" onAdd={() => setAdd("bank")} cols={["Currency", "Bank", "IBAN", "BIC", "Country"]}
          rows={data.bank.map((d) => [d.account_currency, d.bank_name ?? "—", d.iban ?? "—", d.bic ?? "—", d.account_country ?? "—"])} empty="No bank accounts yet." />
      )}

      {add === "doc" && <SimpleAdd title="Add Document" onClose={() => setAdd(null)} onSave={(f: any) => insert("crew_placement_documents", f)} init={{ doc_type: "cv", title: "" }} fields={[{ k: "doc_type", label: "Type" }, { k: "title", label: "Title" }]} crew={[]} required={["title"]} />}
      {add === "cert" && <SimpleAdd title="Add Certificate" onClose={() => setAdd(null)} onSave={(f: any) => insert("crew_placement_certs", f)} init={{ cert_type: "", cert_number: "", issuing_authority: "", issued_date: "", expiry_date: "" }} fields={[{ k: "cert_type", label: "Certificate type" }, { k: "cert_number", label: "Number" }, { k: "issuing_authority", label: "Authority" }, { k: "issued_date", label: "Issued", type: "date" }, { k: "expiry_date", label: "Expiry", type: "date" }]} crew={[]} required={["cert_type"]} />}
      {add === "contract" && <SimpleAdd title="New Contract" onClose={() => setAdd(null)} onSave={(f: any) => insert("crew_contracts", { ...f, salary: f.salary ? Number(f.salary) : null })} init={{ yacht_id: c.yacht_id ?? "", template_id: "", contract_type: "SEA", start_date: "", end_date: "", salary: c.salary ?? "", currency: c.currency ?? "USD", rotation: c.rotation ?? "", status: "draft" }} fields={[{ k: "yacht_id", label: "Vessel", type: "yacht" }, { k: "template_id", label: "Template", type: "template", templateKind: "contract" }, { k: "contract_type", label: "Type" }, { k: "start_date", label: "Start", type: "date" }, { k: "end_date", label: "End", type: "date" }, { k: "salary", label: "Salary", type: "number" }, { k: "currency", label: "Currency", type: "currency" }, { k: "rotation", label: "Rotation" }, { k: "status", label: "Status" }]} crew={[]} yachts={yachts} templates={templates} required={[]} />}
      {add === "payslip" && <SimpleAdd title="New Payslip" onClose={() => setAdd(null)} onSave={(f: any) => insert("crew_payslips", { ...f, gross: f.gross ? Number(f.gross) : null, net: f.net ? Number(f.net) : null })} init={{ period_month: "", gross: "", net: "", currency: c.currency ?? "USD", status: "draft" }} fields={[{ k: "period_month", label: "Pay month", type: "date" }, { k: "gross", label: "Gross", type: "number" }, { k: "net", label: "Net", type: "number" }, { k: "currency", label: "Currency", type: "currency" }, { k: "status", label: "Status" }]} crew={[]} required={["period_month"]} />}
      {add === "bank" && <SimpleAdd title="Add Bank Account" onClose={() => setAdd(null)} onSave={(f: any) => insert("placed_crew_bank", f)} init={{ account_holder: c.full_name, account_currency: "EUR", account_country: "", iban: "", bic: "", bank_name: "", bank_country: "" }} fields={[{ k: "account_holder", label: "Account holder" }, { k: "account_currency", label: "Currency", type: "currency" }, { k: "account_country", label: "Account country" }, { k: "iban", label: "IBAN" }, { k: "bic", label: "BIC" }, { k: "bank_name", label: "Bank name" }, { k: "bank_country", label: "Bank country" }]} crew={[]} required={[]} />}
    </div>
  );
}
function ChevronLeftIcon() { return <ChevronLeft className="h-3.5 w-3.5" />; }
function ProfileList({ title, onAdd, cols, rows, empty }: { title: string; onAdd: () => void; cols: string[]; rows: any[][]; empty: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{title}</h3><Button size="sm" className="h-8 gap-1.5" onClick={onAdd}><Plus className="h-3.5 w-3.5" /> Add</Button></div>
      <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead><tr className="bg-muted/40 border-b border-border">{cols.map((h) => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border/50">
            {rows.length === 0 ? <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-sm text-muted-foreground">{empty}</td></tr> :
              rows.map((r, i) => <tr key={i} className="hover:bg-muted/10">{r.map((cell, j) => <td key={j} className="px-3 py-2 text-xs">{cell}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Leave & Rotation ──────────────────────────────────────────────────────────
const LEAVE_TYPES = ["rotation", "paid", "unpaid", "travel", "other"];
const LEAVE_COLOR: Record<string, string> = {
  rotation: "bg-violet-500", paid: "bg-emerald-500", unpaid: "bg-slate-500", travel: "bg-blue-500", other: "bg-amber-500",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayOfYear(d: Date) { return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000; }
function daysBetween(a: string, b: string) { return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1); }

function LeaveRotation({ crew }: { crew: any[] }) {
  const [year, setYear] = useState(String(new Date().getUTCFullYear()));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [add, setAdd] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await db().from("crew_leave")
      .select("*, crew:placed_crew(full_name, rank)")
      .gte("start_date", `${year}-01-01`).lte("start_date", `${year}-12-31`).order("start_date");
    setRows(data ?? []); setLoading(false);
  }
  useEffect(() => { void load(); }, [year]);

  // Group leave by crew for the Gantt.
  const byCrew = useMemo(() => {
    const m = new Map<string, { name: string; rank: string; items: any[] }>();
    for (const r of rows) {
      if (!m.has(r.placed_crew_id)) m.set(r.placed_crew_id, { name: r.crew?.full_name ?? "Crew", rank: r.crew?.rank ?? "", items: [] });
      m.get(r.placed_crew_id)!.items.push(r);
    }
    return Array.from(m.values());
  }, [rows]);

  const now = new Date();
  const onLeaveNow = rows.filter((r) => r.status !== "cancelled" && new Date(r.start_date) <= now && new Date(r.end_date) >= now).length;
  const totalDays = rows.filter((r) => r.status !== "cancelled").reduce((s, r) => s + (Number(r.days) || daysBetween(r.start_date, r.end_date)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="grid grid-cols-3 gap-2.5 flex-1 max-w-xl">
          {[{ l: "On leave now", v: onLeaveNow }, { l: "Leave periods", v: rows.length }, { l: "Total days", v: totalDays }].map((k) => (
            <div key={k.l} className="rounded-lg border border-border bg-card px-3 py-2"><div className="text-lg font-bold">{k.v}</div><div className="text-[11px] text-muted-foreground">{k.l}</div></div>
          ))}
        </div>
        <select value={year} onChange={(e) => setYear(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs ml-auto">
          {["2027", "2026", "2025"].map((y) => <option key={y}>{y}</option>)}
        </select>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => setAdd(true)}><Plus className="h-3.5 w-3.5" /> Schedule Leave</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        {LEAVE_TYPES.map((t) => <span key={t} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${LEAVE_COLOR[t]}`} /> <span className="capitalize text-muted-foreground">{t}</span></span>)}
      </div>

      {/* Year Gantt */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="w-44 shrink-0 px-3 py-2">Crew</div>
          <div className="flex flex-1">{MONTHS.map((m) => <div key={m} className="flex-1 border-l border-border/40 px-1 py-2 text-center">{m}</div>)}</div>
        </div>
        {loading ? <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div> :
          byCrew.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">No leave scheduled for {year}.</div> :
          byCrew.map((c, i) => (
            <div key={i} className="flex items-center border-b border-border/40 last:border-0 hover:bg-muted/10">
              <div className="w-44 shrink-0 px-3 py-2"><div className="text-xs font-medium truncate">{c.name}</div><div className="text-[10px] text-muted-foreground truncate">{c.rank}</div></div>
              <div className="relative flex-1 h-8">
                {MONTHS.map((_, mi) => <div key={mi} className="absolute top-0 bottom-0 border-l border-border/30" style={{ left: `${(mi / 12) * 100}%` }} />)}
                {c.items.filter((it) => it.status !== "cancelled").map((it) => {
                  const s = new Date(it.start_date), e = new Date(it.end_date);
                  const left = (dayOfYear(s) / 365) * 100;
                  const width = Math.max(1.2, ((dayOfYear(e) - dayOfYear(s) + 1) / 365) * 100);
                  return <div key={it.id} title={`${it.leave_type}: ${it.start_date} → ${it.end_date}`}
                    className={`absolute top-1.5 h-5 rounded ${LEAVE_COLOR[it.leave_type] ?? "bg-muted"} opacity-80`} style={{ left: `${left}%`, width: `${width}%` }} />;
                })}
              </div>
            </div>
          ))}
      </div>

      {add && <ScheduleLeaveDialog crew={crew} onClose={() => setAdd(false)} onDone={() => { setAdd(false); void load(); }} />}
    </div>
  );
}
function ScheduleLeaveDialog({ crew, onClose, onDone }: { crew: any[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ placed_crew_id: "", leave_type: "rotation", start_date: "", end_date: "", accrues: false, status: "scheduled", note: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const days = f.start_date && f.end_date ? daysBetween(f.start_date, f.end_date) : 0;
  async function submit() {
    if (!f.placed_crew_id || !f.start_date || !f.end_date) { toast.error("Crew, start and end are required"); return; }
    setBusy(true);
    const { error } = await db().from("crew_leave").insert({ ...f, days, note: f.note || null });
    if (error) { toast.error(error.message); setBusy(false); return; }
    toast.success("Leave scheduled"); onDone();
  }
  return (
    <Modal title="Schedule Leave" onClose={onClose}
      footer={<><Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button><Button size="sm" onClick={submit} disabled={busy}>Schedule{days ? ` · ${days} days` : ""}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Crew"><select className={fieldCls} value={f.placed_crew_id} onChange={(e) => set("placed_crew_id", e.target.value)}><option value="">— select —</option>{crew.map((c: any) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></Labeled>
        <Labeled label="Type"><select className={fieldCls} value={f.leave_type} onChange={(e) => set("leave_type", e.target.value)}>{LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Labeled>
        <Labeled label="Start"><input type="date" className={fieldCls} value={f.start_date} onChange={(e) => set("start_date", e.target.value)} /></Labeled>
        <Labeled label="End"><input type="date" className={fieldCls} value={f.end_date} onChange={(e) => set("end_date", e.target.value)} /></Labeled>
        <Labeled label="Accrues leave"><select className={fieldCls} value={String(f.accrues)} onChange={(e) => set("accrues", e.target.value === "true")}><option value="false">No</option><option value="true">Yes</option></select></Labeled>
        <Labeled label="Status"><select className={fieldCls} value={f.status} onChange={(e) => set("status", e.target.value)}>{["scheduled", "taken", "cancelled"].map((s) => <option key={s}>{s}</option>)}</select></Labeled>
        <div className="col-span-2"><Labeled label="Note"><input className={fieldCls} value={f.note} onChange={(e) => set("note", e.target.value)} /></Labeled></div>
      </div>
    </Modal>
  );
}

// ── Certifications ──────────────────────────────────────────────────────────────
function Certs({ certs, crew, reload }: { certs: any[]; crew: any[]; reload: () => Promise<void> }) {
  const [add, setAdd] = useState(false);
  async function viewCert(path: string) {
    const { data } = await db().storage.from("crew-docs").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank"); else toast.error("Could not open file");
  }
  function expiryBadge(d: string | null) {
    const days = daysUntil(d);
    if (days == null) return <span className="text-muted-foreground">—</span>;
    const cls = days < 0 ? "bg-red-500/15 text-red-400" : days <= 60 ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400";
    return <span className={`inline-flex rounded-full px-1.5 py-0 text-[10px] font-semibold ${cls}`}>{fmtDate(d)}{days < 0 ? " · expired" : days <= 60 ? ` · ${days}d` : ""}</span>;
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" className="h-8 gap-1.5" onClick={() => setAdd(true)}><Plus className="h-3.5 w-3.5" /> Add Certificate</Button></div>
      <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="bg-muted/40 border-b border-border">{["Crew", "Certificate", "Number", "Authority", "Issued", "Expiry", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border/50">
            {certs.length === 0 ? <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">No certificates tracked yet.</td></tr> :
              certs.map((c) => (
                <tr key={c.id} className="hover:bg-muted/10">
                  <td className="px-3 py-2 text-xs font-medium">{c.crew?.full_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{c.cert_type}</td>
                  <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{c.cert_number ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.issuing_authority ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(c.issued_date)}</td>
                  <td className="px-3 py-2 text-xs">{expiryBadge(c.expiry_date)}</td>
                  <td className="px-3 py-2 text-right">{c.document_path
                    ? <button onClick={() => viewCert(c.document_path)} className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10"><Download className="h-3 w-3" /> View</button>
                    : <span className="text-[10px] text-muted-foreground/50">no file</span>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {add && <CertUploadDialog crew={crew} onClose={() => setAdd(false)} onDone={() => { setAdd(false); void reload(); }} />}
    </div>
  );
}

function CertUploadDialog({ crew, onClose, onDone }: { crew: any[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ placed_crew_id: "", cert_type: "", cert_number: "", issuing_authority: "", issued_date: "", expiry_date: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function submit() {
    if (!f.placed_crew_id || !f.cert_type.trim()) { toast.error("Crew and certificate type are required"); return; }
    setBusy(true);
    try {
      let document_path: string | null = null;
      if (file) {
        if (file.size > 20 * 1024 * 1024) { toast.error("Max 20 MB"); setBusy(false); return; }
        const path = `${f.placed_crew_id}/certs/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
        const { error: upErr } = await db().storage.from("crew-docs").upload(path, file);
        if (upErr) { toast.error(`Upload failed: ${upErr.message}`); setBusy(false); return; }
        document_path = path;
      }
      const row: any = { ...f, document_path };
      Object.keys(row).forEach((k) => row[k] === "" && (row[k] = null));
      const { error } = await db().from("crew_placement_certs").insert(row);
      if (error) { toast.error(error.message); setBusy(false); return; }
      toast.success("Certificate added"); onDone();
    } catch (e: any) { toast.error(String(e?.message ?? e)); setBusy(false); }
  }
  return (
    <Modal title="Add Certificate" onClose={onClose}
      footer={<><Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button><Button size="sm" onClick={submit} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Crew"><select className={fieldCls} value={f.placed_crew_id} onChange={(e) => set("placed_crew_id", e.target.value)}><option value="">— select —</option>{crew.map((c: any) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></Labeled>
        <Labeled label="Certificate type"><input className={fieldCls} value={f.cert_type} onChange={(e) => set("cert_type", e.target.value)} /></Labeled>
        <Labeled label="Number"><input className={fieldCls} value={f.cert_number} onChange={(e) => set("cert_number", e.target.value)} /></Labeled>
        <Labeled label="Issuing authority"><input className={fieldCls} value={f.issuing_authority} onChange={(e) => set("issuing_authority", e.target.value)} /></Labeled>
        <Labeled label="Issued"><input type="date" className={fieldCls} value={f.issued_date} onChange={(e) => set("issued_date", e.target.value)} /></Labeled>
        <Labeled label="Expiry"><input type="date" className={fieldCls} value={f.expiry_date} onChange={(e) => set("expiry_date", e.target.value)} /></Labeled>
      </div>
      <Labeled label="Certificate file (optional)">
        <label className="mt-0.5 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-3 text-xs text-muted-foreground hover:border-primary/40">
          <Download className="h-4 w-4 rotate-180" />{file ? <span className="text-foreground">{file.name}</span> : <span>Click to upload · PDF, JPG, PNG · max 20 MB</span>}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </Labeled>
    </Modal>
  );
}

// ── Contracts ────────────────────────────────────────────────────────────────
function Contracts({ contracts, crew, yachts, templates, reload }: any) {
  const [add, setAdd] = useState(false);
  void templates;
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" className="h-8 gap-1.5" onClick={() => setAdd(true)}><Plus className="h-3.5 w-3.5" /> New Contract</Button></div>
      <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="bg-muted/40 border-b border-border">{["Crew", "Vessel", "Type", "Start", "End", "Salary", "Status", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border/50">
            {contracts.length === 0 ? <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">No contracts yet.</td></tr> :
              contracts.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/10">
                  <td className="px-3 py-2 text-xs font-medium">{c.crew?.full_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{c.yacht?.vessel_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{c.contract_type ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(c.start_date)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(c.end_date)}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{c.salary != null ? `${Number(c.salary).toLocaleString()} ${c.currency ?? ""}` : "—"}</td>
                  <td className="px-3 py-2"><span className="inline-flex rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase bg-muted/60 text-muted-foreground">{c.status}</span></td>
                  <td className="px-3 py-2 text-right"><button onClick={() => genPdf("contract-pdf", c.id)} className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10"><FileText className="h-3 w-3" /> PDF</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {add && <ContractBuilder crew={crew} yachts={yachts} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); void reload(); }} />}
    </div>
  );
}

// ── Payroll ────────────────────────────────────────────────────────────────────
function Payroll({ payslips, crew, templates, reload }: any) {
  const [add, setAdd] = useState(false);
  const blank = { placed_crew_id: "", period_month: "", gross: "", net: "", currency: "USD", status: "draft" };
  async function save(f: any) {
    const row = { ...f, gross: f.gross ? Number(f.gross) : null, net: f.net ? Number(f.net) : null }; Object.keys(row).forEach((k) => row[k] === "" && (row[k] = null));
    const { error } = await db().from("crew_payslips").insert(row);
    if (error) return toast.error(error.message);
    toast.success("Payslip created (PDF generation comes in Phase 2)"); setAdd(false); await reload();
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" className="h-8 gap-1.5" onClick={() => setAdd(true)}><Plus className="h-3.5 w-3.5" /> New Payslip</Button></div>
      <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead><tr className="bg-muted/40 border-b border-border">{["Crew", "Period", "Gross", "Net", "Currency", "Status", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border/50">
            {payslips.length === 0 ? <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">No payslips yet.</td></tr> :
              payslips.map((p: any) => (
                <tr key={p.id} className="hover:bg-muted/10">
                  <td className="px-3 py-2 text-xs font-medium">{p.crew?.full_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.period_month ? new Date(p.period_month).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{p.gross != null ? Number(p.gross).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums font-medium">{p.net != null ? Number(p.net).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.currency}</td>
                  <td className="px-3 py-2"><span className="inline-flex rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase bg-muted/60 text-muted-foreground">{p.status}</span></td>
                  <td className="px-3 py-2 text-right"><button onClick={() => genPdf("payslip-pdf", p.id).then((ok) => ok && reload())} className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10"><FileText className="h-3 w-3" /> Payslip</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {add && <SimpleAdd title="New Payslip" onClose={() => setAdd(false)} onSave={save} init={blank}
        fields={[
          { k: "placed_crew_id", label: "Crew", type: "crew" }, { k: "period_month", label: "Pay month", type: "date" },
          { k: "gross", label: "Gross", type: "number" }, { k: "net", label: "Net", type: "number" },
          { k: "currency", label: "Currency", type: "currency" }, { k: "status", label: "Status" },
        ]} crew={crew} templates={templates} required={["placed_crew_id", "period_month"]} />}
    </div>
  );
}

// ── Documents ────────────────────────────────────────────────────────────────
const POOL_KEY = "Unassigned / Pool";
function Documents({ docs, crew, reload }: { docs: any[]; crew: any[]; reload: () => Promise<void> }) {
  // Branch-tree explorer: Vessel → Crew → Documents. Left = tree, right = contents.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<{ vessel: string; crewId: string; name: string } | null>(null);
  const [add, setAdd] = useState(false);

  const tree = useMemo(() => {
    const m = new Map<string, Map<string, { name: string; docs: any[] }>>();
    for (const d of docs) {
      const v = d.crew?.yacht?.vessel_name ?? POOL_KEY;
      const cid = d.placed_crew_id;
      if (!m.has(v)) m.set(v, new Map());
      const cm = m.get(v)!;
      if (!cm.has(cid)) cm.set(cid, { name: d.crew?.full_name ?? "Unknown", docs: [] });
      cm.get(cid)!.docs.push(d);
    }
    return m;
  }, [docs]);

  function toggle(v: string) {
    setCollapsed((p) => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; });
  }
  async function viewDoc(path: string) {
    const { data } = await db().storage.from("crew-docs").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank"); else toast.error("Could not open file");
  }

  const vessels = Array.from(tree.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const selDocs = sel ? (tree.get(sel.vessel)?.get(sel.crewId)?.docs ?? []) : [];

  if (tree.size === 0) return <Empty msg="No documents yet. Open a crew member's profile to add documents." />;

  return (
    <div className="flex gap-4">
      {/* Branch tree */}
      <div className="w-72 shrink-0 rounded-lg border border-border bg-card/40 p-2 max-h-[64vh] overflow-auto">
        <button onClick={() => setSel(null)} className="mb-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:bg-muted/30">
          <FolderOpen className="h-3.5 w-3.5" /> All Vessels
        </button>
        {vessels.map(([v, cm]) => {
          const open = !collapsed.has(v);
          const docCount = Array.from(cm.values()).reduce((s, c) => s + c.docs.length, 0);
          return (
            <div key={v}>
              <button onClick={() => toggle(v)} className="flex w-full items-center gap-1 rounded px-1.5 py-1.5 text-left hover:bg-muted/30">
                {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <Ship className="h-3.5 w-3.5 text-primary" />
                <span className="flex-1 truncate text-xs font-medium">{v}</span>
                <span className="text-[10px] text-muted-foreground">{docCount}</span>
              </button>
              {open && (
                <div className="ml-3 border-l border-border/60 pl-1">
                  {Array.from(cm.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([cid, c]) => {
                    const active = sel?.crewId === cid;
                    return (
                      <button key={cid} onClick={() => setSel({ vessel: v, crewId: cid, name: c.name })}
                        className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition ${active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`}>
                        <FolderOpen className={`h-3.5 w-3.5 ${active ? "text-amber-400" : "text-muted-foreground/70"}`} />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="text-[10px] opacity-70">{c.docs.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Contents */}
      <div className="flex-1 min-w-0">
        {!sel ? (
          <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            Select a crew member from the tree to view their documents.
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <div className="text-sm"><span className="text-muted-foreground">{sel.vessel} / </span><span className="font-semibold">{sel.name}</span></div>
              <Button size="sm" className="h-7 gap-1.5 ml-auto" onClick={() => setAdd(true)}><Plus className="h-3.5 w-3.5" /> Add Document</Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/40 border-b border-border">{["Type", "Title", "Added", ""].map((h) => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border/50">
                  {selDocs.length === 0 ? <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">No documents.</td></tr> :
                    selDocs.map((d) => (
                      <tr key={d.id} className="hover:bg-muted/10">
                        <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-xs"><FileText className="h-3.5 w-3.5 text-muted-foreground" /><span className="capitalize">{d.doc_type}</span></span></td>
                        <td className="px-3 py-2 text-xs">{d.title}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(d.created_at)}</td>
                        <td className="px-3 py-2 text-right">{d.file_path
                          ? <button onClick={() => viewDoc(d.file_path)} className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10"><Download className="h-3 w-3" /> View</button>
                          : <span className="text-[10px] text-muted-foreground/60">no file</span>}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {add && sel && <DocUploadDialog crewId={sel.crewId} name={sel.name} onClose={() => setAdd(false)} onDone={() => { setAdd(false); void reload(); }} />}
    </div>
  );
}
function Empty({ msg }: { msg: string }) { return <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">{msg}</div>; }

const DOC_TYPES = ["passport", "visa", "cv", "contract", "certificate", "seamans_book", "medical", "driving_licence", "reference", "other"];
function DocUploadDialog({ crewId, name, onClose, onDone }: { crewId: string; name: string; onClose: () => void; onDone: () => void }) {
  const [docType, setDocType] = useState("cv");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(f: File | null) {
    setFile(f);
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }
  async function submit() {
    if (!title.trim() && !file) { toast.error("Add a title or a file"); return; }
    setBusy(true);
    try {
      let file_path: string | null = null;
      if (file) {
        if (file.size > 20 * 1024 * 1024) { toast.error("Max file size 20 MB"); setBusy(false); return; }
        const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `${crewId}/${Date.now()}-${safe}`;
        const { error: upErr } = await db().storage.from("crew-docs").upload(path, file, { upsert: false });
        if (upErr) { toast.error(`Upload failed: ${upErr.message}`); setBusy(false); return; }
        file_path = path;
      }
      const { error } = await db().from("crew_placement_documents").insert({
        placed_crew_id: crewId, doc_type: docType, title: title.trim() || file?.name || "Document", file_path,
      });
      if (error) { toast.error(error.message); setBusy(false); return; }
      toast.success("Document added");
      onDone();
    } catch (e: any) { toast.error(String(e?.message ?? e)); setBusy(false); }
  }

  return (
    <Modal title={`Add Document — ${name}`} onClose={onClose}
      footer={<><Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Document type"><select className={fieldCls} value={docType} onChange={(e) => setDocType(e.target.value)}>{DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></Labeled>
        <Labeled label="Title"><input className={fieldCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Passport" /></Labeled>
      </div>
      <Labeled label="File (optional)">
        <label className="mt-0.5 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground hover:border-primary/40">
          <Download className="h-4 w-4 rotate-180" />
          {file ? <span className="text-foreground">{file.name}</span> : <span>Click to upload · PDF, JPG, PNG · max 20 MB</span>}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </label>
      </Labeled>
    </Modal>
  );
}

// ── Templates ────────────────────────────────────────────────────────────────
function Templates({ templates, reload }: { templates: any[]; reload: () => Promise<void> }) {
  const [edit, setEdit] = useState<any | null>(null);
  const blank = { kind: "contract", name: "", body: "" };
  async function save(f: any) {
    const row = { kind: f.kind, name: f.name, body: f.body, updated_at: new Date().toISOString() };
    const { error } = f.id ? await db().from("crew_placement_templates").update(row).eq("id", f.id) : await db().from("crew_placement_templates").insert(row);
    if (error) return toast.error(error.message);
    toast.success("Template saved"); setEdit(null); await reload();
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Contract & payslip templates. Use <code className="rounded bg-muted px-1">{"{{placeholders}}"}</code> like <code className="rounded bg-muted px-1">{"{{crew_name}}"}</code>, <code className="rounded bg-muted px-1">{"{{salary}}"}</code> — they're filled when generating in Phase 2.</p>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => setEdit(blank)}><Plus className="h-3.5 w-3.5" /> New Template</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {templates.map((t) => (
          <button key={t.id} onClick={() => setEdit(t)} className="rounded-lg border border-border bg-card p-4 text-left hover:border-primary/40 transition">
            <div className="flex items-center justify-between"><span className="font-medium text-sm">{t.name}</span><span className="inline-flex rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase bg-primary/15 text-primary">{t.kind}</span></div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[11px] text-muted-foreground">{t.body}</p>
          </button>
        ))}
        {templates.length === 0 && <div className="text-sm text-muted-foreground">No templates yet.</div>}
      </div>
      {edit && <TemplateModal init={edit} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  );
}
function TemplateModal({ init, onClose, onSave }: { init: any; onClose: () => void; onSave: (f: any) => void }) {
  const [f, setF] = useState(init);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  return (
    <Modal title={init.id ? "Edit Template" : "New Template"} onClose={onClose}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!f.name?.trim()} onClick={() => onSave(f)}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Kind"><select className={fieldCls} value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="contract">Contract</option><option value="payslip">Payslip</option></select></Labeled>
        <Labeled label="Name"><input className={fieldCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></Labeled>
      </div>
      <Labeled label="Body"><textarea rows={12} className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring" value={f.body} onChange={(e) => set("body", e.target.value)} /></Labeled>
    </Modal>
  );
}

// ── Generic add dialog ─────────────────────────────────────────────────────────
function SimpleAdd({ title, init, fields, crew, yachts, templates, required, onClose, onSave }: any) {
  const [f, setF] = useState<any>(init);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const ok = (required ?? []).every((k: string) => String(f[k] ?? "").trim());
  return (
    <Modal title={title} onClose={onClose}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!ok} onClick={() => onSave(f)}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((fl: any) => (
          <Labeled key={fl.k} label={fl.label}>
            {fl.type === "crew" ? (
              <select className={fieldCls} value={f[fl.k]} onChange={(e) => set(fl.k, e.target.value)}><option value="">— select —</option>{crew.map((c: any) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select>
            ) : fl.type === "yacht" ? (
              <select className={fieldCls} value={f[fl.k]} onChange={(e) => set(fl.k, e.target.value)}><option value="">— none —</option>{(yachts ?? []).map((y: any) => <option key={y.id} value={y.id}>{y.vessel_name}</option>)}</select>
            ) : fl.type === "template" ? (
              <select className={fieldCls} value={f[fl.k]} onChange={(e) => set(fl.k, e.target.value)}><option value="">— none —</option>{(templates ?? []).filter((t: any) => !fl.templateKind || t.kind === fl.templateKind).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            ) : fl.type === "currency" ? (
              <select className={fieldCls} value={f[fl.k]} onChange={(e) => set(fl.k, e.target.value)}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            ) : fl.type === "department" ? (
              <select className={fieldCls} value={f[fl.k]} onChange={(e) => set(fl.k, e.target.value)}><option value="">—</option>{DEPARTMENTS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            ) : fl.type === "emptype" ? (
              <select className={fieldCls} value={f[fl.k]} onChange={(e) => set(fl.k, e.target.value)}>{EMP_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            ) : (
              <input type={fl.type === "number" ? "number" : fl.type === "date" ? "date" : "text"} className={fieldCls} value={f[fl.k]} onChange={(e) => set(fl.k, e.target.value)} />
            )}
          </Labeled>
        ))}
      </div>
    </Modal>
  );
}

export default CrewPlacementPage;
