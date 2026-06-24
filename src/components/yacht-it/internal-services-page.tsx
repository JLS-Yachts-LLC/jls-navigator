import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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
import { Boxes, Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type InternalService = {
  id: string;
  service_name: string;
  vendor: string | null;
  category: string;
  cost_amount: number | null;
  currency: string;
  billing_cycle: string;
  seats: number | null;
  owner: string | null;
  account_ref: string | null;
  start_date: string | null;
  renewal_date: string | null;
  status: string;
  notes: string | null;
  // Commercial / invoicing
  sell_price: number | null;
  commitment_term: string | null;
  jls_invoice_number: string | null;
  yacht_paid: boolean;
  yacht_po: string | null;
  renewal_alert_sent_at: string | null;
  created_at: string;
  updated_at: string;
};
type FormState = Omit<InternalService, "id" | "created_at" | "updated_at" | "renewal_alert_sent_at">;

const CATEGORIES = [
  { value: "software", label: "Software" },
  { value: "connectivity", label: "Connectivity" },
  { value: "security", label: "Security" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "support", label: "Support" },
  { value: "other", label: "Other" },
];
const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "one_off", label: "One-off" },
];
const EMPTY_FORM: FormState = {
  service_name: "", vendor: null, category: "software", cost_amount: null, currency: "AED",
  billing_cycle: "monthly", seats: null, owner: null, account_ref: null,
  start_date: null, renewal_date: null, status: "active", notes: null,
  sell_price: null, commitment_term: null, jls_invoice_number: null,
  yacht_paid: false, yacht_po: null,
};

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
function fmtMoney(n: number | null | undefined) {
  return n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function daysUntil(d: string | null): number | null {
  return d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
}
/** Effective status — active services within 30 days of renewal flag "expiring". */
function effectiveStatus(s: InternalService): string {
  if (s.status !== "active") return s.status;
  const days = daysUntil(s.renewal_date);
  if (days !== null && days < 0) return "expired";
  if (days !== null && days <= 30) return "expiring_soon";
  return "active";
}
/** Normalise an amount to a monthly figure for the roll-ups (cost or sell). */
function perMonth(amount: number | null, cycle: string): number {
  if (amount == null) return 0;
  switch (cycle) {
    case "annual": return amount / 12;
    case "quarterly": return amount / 3;
    case "one_off": return 0;
    default: return amount;
  }
}
function monthly(s: InternalService): number { return perMonth(s.cost_amount, s.billing_cycle); }
function monthlyRevenue(s: InternalService): number { return perMonth(s.sell_price, s.billing_cycle); }

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    expiring_soon: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
    expired: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
    cancelled: "bg-muted text-muted-foreground border-border",
  };
  const label: Record<string, string> = { active: "Active", expiring_soon: "Renewing", expired: "Lapsed", cancelled: "Cancelled" };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status] ?? map.cancelled}`}>{label[status] ?? status}</span>;
}

export function InternalServicesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InternalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InternalService | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InternalService | null>(null);

  useEffect(() => { void load(); }, []);
  // Fire the 90-day renewal check (idempotent server-side) so the alert email
  // goes out once a service enters the window, even without a separate cron.
  useEffect(() => {
    fetch("/api/internal-services/renewal-check", { method: "POST" }).catch(() => {});
  }, []);
  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any).from("internal_services").select("*").order("service_name");
    if (error) toast.error(error.message);
    else setRows((data ?? []) as InternalService[]);
    setLoading(false);
  }

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter !== "all" && effectiveStatus(r) !== statusFilter) return false;
    if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (![r.service_name, r.vendor, r.owner].join(" ").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [rows, statusFilter, categoryFilter, search]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => effectiveStatus(r) === "active").length;
    const renewing = rows.filter((r) => effectiveStatus(r) === "expiring_soon").length;
    const activeRows = rows.filter((r) => r.status === "active");
    // Annualised recurring figures (perMonth already handles each billing cycle).
    const annualCost = activeRows.reduce((sum, r) => sum + monthly(r) * 12, 0);
    const annualRev = activeRows.reduce((sum, r) => sum + monthlyRevenue(r) * 12, 0);
    const annualMargin = annualRev - annualCost;
    const marginPct = annualRev > 0 ? (annualMargin / annualRev) * 100 : null;
    return { total: rows.length, active, renewing, annualCost, annualRev, annualMargin, marginPct };
  }, [rows]);

  // Services within the 90-day renewal-quotation window (active, not yet lapsed).
  const renewalsDue = useMemo(() => rows.filter((r) => {
    if (r.status !== "active") return false;
    const d = daysUntil(r.renewal_date);
    return d !== null && d >= 0 && d <= 90;
  }).sort((a, b) => (daysUntil(a.renewal_date) ?? 0) - (daysUntil(b.renewal_date) ?? 0)), [rows]);

  function openNew() { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }
  function openEdit(r: InternalService) {
    setEditing(r);
    setForm({
      service_name: r.service_name, vendor: r.vendor, category: r.category, cost_amount: r.cost_amount,
      currency: r.currency, billing_cycle: r.billing_cycle, seats: r.seats, owner: r.owner,
      account_ref: r.account_ref, start_date: r.start_date, renewal_date: r.renewal_date,
      status: r.status, notes: r.notes,
      sell_price: r.sell_price, commitment_term: r.commitment_term, jls_invoice_number: r.jls_invoice_number,
      yacht_paid: r.yacht_paid, yacht_po: r.yacht_po,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.service_name.trim()) { toast.error("Service name is required"); return; }
    setBusy(true);
    try {
      if (editing) {
        // If the renewal date moved, clear the alert flag so the new cycle re-alerts.
        const renewalChanged = (editing.renewal_date ?? null) !== (form.renewal_date ?? null);
        const patch: any = { ...form, updated_at: new Date().toISOString() };
        if (renewalChanged) patch.renewal_alert_sent_at = null;
        const { error } = await (supabase as any).from("internal_services")
          .update(patch).eq("id", editing.id);
        if (error) throw error;
        toast.success("Service updated");
      } else {
        const { error } = await (supabase as any).from("internal_services").insert([{ ...form, created_by: user?.id }]);
        if (error) throw error;
        toast.success("Service added");
      }
      setOpen(false); void load();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from("internal_services").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message); else { toast.success("Service removed"); void load(); }
    setDeleteTarget(null);
  }

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Yacht IT Solutions</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">Internal Services &amp; Subscriptions</h1>
        </div>
        <Button size="sm" onClick={openNew} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm"><Plus className="h-3.5 w-3.5" /> Add Service</Button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        {/* 90-day renewal-quotation alert */}
        {renewalsDue.length > 0 && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <span aria-hidden>⏳</span>
              <span className="font-display text-sm font-bold">
                {renewalsDue.length} service{renewalsDue.length === 1 ? "" : "s"} due for renewal within 90 days
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Seek a quotation from the vendor and begin prepping the quotation for the Yacht. An email reminder is sent to the IT support inbox.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {renewalsDue.slice(0, 8).map((r) => {
                const d = daysUntil(r.renewal_date) ?? 0;
                return (
                  <button key={r.id} onClick={() => openEdit(r)}
                    className="rounded-full border border-amber-500/30 bg-background/40 px-2.5 py-1 text-[11.5px] font-medium hover:bg-accent/40">
                    {r.service_name} · <span className="text-amber-600 dark:text-amber-400">{d}d</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            { label: "Total services", value: stats.total },
            { label: "Active", value: stats.active },
            { label: "Renewing ≤30d", value: stats.renewing },
            { label: "Cost / year", value: `AED ${fmtMoney(stats.annualCost)}`, sub: "what we pay" },
            { label: "Revenue / year", value: `AED ${fmtMoney(stats.annualRev)}`, sub: "what we charge" },
            {
              label: "Margin / year",
              value: `AED ${fmtMoney(stats.annualMargin)}`,
              sub: stats.marginPct == null ? "revenue − cost" : `${stats.marginPct.toFixed(0)}% margin`,
              accent: stats.annualMargin > 0 ? "text-emerald-600 dark:text-emerald-400"
                : stats.annualMargin < 0 ? "text-red-600 dark:text-red-400" : undefined,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${(s as any).accent ?? ""}`}>{s.value}</div>
              {(s as any).sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{(s as any).sub}</div>}
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search service, vendor, owner…" className="h-9 w-64 pl-8 text-sm" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expiring_soon">Renewing</SelectItem>
              <SelectItem value="expired">Lapsed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="ml-auto text-[12px] text-muted-foreground">{filtered.length} of {rows.length}</span>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <Boxes className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-display text-base font-semibold">{rows.length === 0 ? "No internal services yet" : "No services match"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Track JLS's own subscriptions &amp; tools — M365, GitHub, hosting, security, connectivity.</p>
            {rows.length === 0 && <Button onClick={openNew} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> Add First Service</Button>}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/40 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {["Service", "Vendor", "Category", "Cost", "Price", "Billing", "Seats", "Renewal", "Owner", "Yacht Paid", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="group border-b border-border/40 hover:bg-accent/20">
                    <td className="px-4 py-3 font-medium text-foreground">{r.service_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.vendor ?? "—"}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{r.category}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground/80">{r.cost_amount == null ? "—" : `${r.currency} ${fmtMoney(r.cost_amount)}`}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground/80">{r.sell_price == null ? "—" : `${r.currency} ${fmtMoney(r.sell_price)}`}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{r.billing_cycle.replace("_", " ")}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.seats ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {fmtDate(r.renewal_date)}
                      {(() => { const d = daysUntil(r.renewal_date); return r.status === "active" && d !== null && d >= 0 && d <= 90
                        ? <div className="mt-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">Quote due · {d}d</div> : null; })()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.owner ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${r.yacht_paid ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"}`}>
                        {r.yacht_paid ? "Paid" : "Unpaid"}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={effectiveStatus(r)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-0.5 opacity-0 transition group-hover:opacity-100">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-primary" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Internal Service</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Service name <span className="text-destructive">*</span></Label>
                <Input value={form.service_name} onChange={(e) => set({ service_name: e.target.value })} className="h-8" placeholder="e.g. Microsoft 365" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Vendor</Label>
                <Input value={form.vendor ?? ""} onChange={(e) => set({ vendor: e.target.value || null })} className="h-8" placeholder="e.g. Microsoft" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => set({ category: v })}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Owner / dept</Label>
                <Input value={form.owner ?? ""} onChange={(e) => set({ owner: e.target.value || null })} className="h-8" placeholder="Responsible person" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Cost</Label>
                <Input type="number" step="0.01" value={form.cost_amount ?? ""} onChange={(e) => set({ cost_amount: e.target.value === "" ? null : Number(e.target.value) })} className="h-8" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Currency</Label>
                <Input value={form.currency} onChange={(e) => set({ currency: e.target.value })} className="h-8" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Billing</Label>
                <Select value={form.billing_cycle} onValueChange={(v) => set({ billing_cycle: v })}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{BILLING_CYCLES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Price <span className="font-normal text-muted-foreground">(sell)</span></Label>
                <Input type="number" step="0.01" value={form.sell_price ?? ""} onChange={(e) => set({ sell_price: e.target.value === "" ? null : Number(e.target.value) })} className="h-8" placeholder="What we charge the yacht" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Commitment term</Label>
                <Input value={form.commitment_term ?? ""} onChange={(e) => set({ commitment_term: e.target.value || null })} className="h-8" placeholder="e.g. 12 months" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Seats</Label>
                <Input type="number" value={form.seats ?? ""} onChange={(e) => set({ seats: e.target.value === "" ? null : Number(e.target.value) })} className="h-8" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Start date</Label>
                <Input type="date" value={form.start_date ?? ""} onChange={(e) => set({ start_date: e.target.value || null })} className="h-8" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Renewal date</Label>
                <Input type="date" value={form.renewal_date ?? ""} onChange={(e) => set({ renewal_date: e.target.value || null })} className="h-8" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Account / login ref</Label>
                <Input value={form.account_ref ?? ""} onChange={(e) => set({ account_ref: e.target.value || null })} className="h-8" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => set({ status: v })}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">JLS invoice no.</Label>
                <Input value={form.jls_invoice_number ?? ""} onChange={(e) => set({ jls_invoice_number: e.target.value || null })} className="h-8" placeholder="e.g. INV-1042" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Yacht PO</Label>
                <Input value={form.yacht_po ?? ""} onChange={(e) => set({ yacht_po: e.target.value || null })} className="h-8" placeholder="Yacht PO ref" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Yacht paid?</Label>
                <Select value={form.yacht_paid ? "yes" : "no"} onValueChange={(v) => set({ yacht_paid: v === "yes" })}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label>
              <Textarea value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} rows={2} className="resize-none text-sm" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save" : "Add service"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove service?</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.service_name} will be permanently removed.</AlertDialogDescription>
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
