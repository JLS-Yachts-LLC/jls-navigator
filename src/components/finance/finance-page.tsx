import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, RefreshCw, CheckCircle2, XCircle, FileText, FileCheck,
  Quote, Loader2, ExternalLink, ClipboardList, Search, Check, AlertTriangle,
  RotateCcw, LayoutGrid, Package, Cpu, ShoppingCart, Car, ChevronRight, Download, IdCard,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// ─── CSV export utility ───────────────────────────────────────────────────────

function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FinanceTab = "invoices" | "proforma" | "quotations" | "tracker" | "trackers";
type TrackerDept = "crew" | "packages" | "it" | "procurement";

type BillingStatus = "pending_review" | "pending_invoice" | "invoiced" | "not_billable";

type TrackerTrip = {
  id: string;
  trip_type: string;
  pickup_datetime: string | null;
  passenger_name: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  notes: string | null;
  status: string;
  billing_status: BillingStatus;
  invoice_ref: string | null;
  invoice_amount: number | null;
  driver?: { full_name: string } | null;
  yacht?: { vessel_name: string } | null;
};

type TrackerPackage = {
  id: string;
  tracking_number: string | null;
  carrier: string | null;
  description: string | null;
  recipient_name: string | null;
  received_date: string | null;
  status: string;
  billing_status: BillingStatus;
  invoice_ref: string | null;
  invoice_amount: number | null;
  yacht?: { vessel_name: string } | null;
};

type TrackerItContract = {
  id: string;
  service_name: string;
  vendor: string | null;
  category: string;
  charge_amount: number | null;
  billing_cycle: string;
  expiry_date: string | null;
  status: string;
  billing_status: BillingStatus;
  invoice_ref: string | null;
  invoice_amount: number | null;
  yacht?: { vessel_name: string } | null;
};

type TrackerProcurement = {
  id: string;
  item_name: string;
  vendor: string | null;
  category: string;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  status: string;
  requested_date: string | null;
  billing_status: BillingStatus;
  invoice_ref: string | null;
  invoice_amount: number | null;
  yacht?: { vessel_name: string } | null;
};

type TrackerVisa = {
  id: string;
  yacht_id?: string | null;
  given_name: string | null;
  surname: string | null;
  nationality: string | null;
  visa_type: string | null;
  visa_number: string | null;
  visa_issuance_date: string | null;
  country_code: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  billing_status: BillingStatus;
  invoice_ref: string | null;
  invoice_amount: number | null;
  yacht?: { vessel_name: string } | null;
};

const BILLING_LABEL: Record<BillingStatus, string> = {
  pending_review: "Pending Review",
  pending_invoice: "Needs Invoice",
  invoiced: "Invoiced",
  not_billable: "Not Billable",
};

const BILLING_COLOR: Record<BillingStatus, string> = {
  pending_review: "bg-muted/60 text-muted-foreground border-border",
  pending_invoice: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  invoiced: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  not_billable: "bg-slate-500/15 text-slate-400 border-slate-500/20",
};

const TRIP_TYPE_LABEL: Record<string, string> = {
  arrival_transport: "Arrival Transport",
  departure_transport: "Departure Transport",
  crew_pickup: "Crew Pickup",
  inhouse: "In-House",
  airport_transfer: "Airport Transfer",
  delivery_collection: "Delivery & Collection",
  seaport_crew_change: "Seaport Crew Change",
  shorebased: "Shorebased",
};

// ─── Shared Billing Actions ───────────────────────────────────────────────────

function BillingBadge({ status }: { status: BillingStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${BILLING_COLOR[status]}`}>
      {BILLING_LABEL[status]}
    </span>
  );
}

function BillingActions({
  id,
  bs,
  saving,
  isEditing,
  editRef,
  editAmount,
  onSetEditRef,
  onSetEditAmount,
  onStartEdit,
  onCancelEdit,
  onSaveInvoiced,
  onFlag,
  onNotBillable,
  onReset,
}: {
  id: string;
  bs: BillingStatus;
  saving: boolean;
  isEditing: boolean;
  editRef: string;
  editAmount: string;
  onSetEditRef: (v: string) => void;
  onSetEditAmount: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveInvoiced: () => void;
  onFlag: () => void;
  onNotBillable: () => void;
  onReset: () => void;
}) {
  if (isEditing) {
    return (
      <div className="flex items-center gap-1 min-w-[200px]">
        <input
          autoFocus
          value={editRef}
          onChange={e => onSetEditRef(e.target.value)}
          placeholder="INV-001"
          className="h-6 w-20 rounded border border-border bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          value={editAmount}
          onChange={e => onSetEditAmount(e.target.value)}
          placeholder="0.00"
          type="number"
          step="0.01"
          className="h-6 w-16 rounded border border-border bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={onSaveInvoiced}
          disabled={saving}
          className="rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-1.5 py-0.5 text-[10px] font-medium"
        >
          {saving ? "…" : "Save"}
        </button>
        <button onClick={onCancelEdit} className="rounded bg-muted/60 text-muted-foreground hover:bg-muted px-1.5 py-0.5 text-[10px]">✕</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      {bs === "pending_review" && (
        <button onClick={onFlag} disabled={saving} title="Mark as Needs Invoice"
          className="rounded p-1 text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition">
          <AlertTriangle className="h-3.5 w-3.5" />
        </button>
      )}
      {bs !== "invoiced" && bs !== "not_billable" && (
        <button onClick={onStartEdit} disabled={saving} title="Mark as Invoiced"
          className="rounded p-1 text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/10 transition">
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
      {bs !== "not_billable" && (
        <button onClick={onNotBillable} disabled={saving} title="Mark as Not Billable"
          className="rounded p-1 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/40 transition">
          <XCircle className="h-3.5 w-3.5" />
        </button>
      )}
      {bs !== "pending_review" && (
        <button onClick={onReset} disabled={saving} title="Reset to Pending Review"
          className="rounded p-1 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/40 transition">
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ items }: { items: { billing_status: BillingStatus; invoice_amount: number | null }[] }) {
  const stats = useMemo(() => ({
    total: items.length,
    pending_review: items.filter(i => i.billing_status === "pending_review").length,
    needs_invoice: items.filter(i => i.billing_status === "pending_invoice").length,
    invoiced: items.filter(i => i.billing_status === "invoiced").length,
    not_billable: items.filter(i => i.billing_status === "not_billable").length,
    total_invoiced: items.filter(i => i.billing_status === "invoiced" && i.invoice_amount)
      .reduce((s, i) => s + (i.invoice_amount ?? 0), 0),
  }), [items]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
      {[
        { label: "Total", value: stats.total, color: "text-foreground" },
        { label: "Pending Review", value: stats.pending_review, color: "text-muted-foreground" },
        { label: "Needs Invoice", value: stats.needs_invoice, color: "text-amber-400" },
        { label: "Invoiced", value: stats.invoiced, color: "text-emerald-400" },
        { label: "Not Billable", value: stats.not_billable, color: "text-slate-400" },
        { label: "Total Invoiced", value: `AED ${stats.total_invoiced.toLocaleString("en-AE", { minimumFractionDigits: 0 })}`, color: "text-primary" },
      ].map(s => (
        <div key={s.label} className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
          <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
          <div className="text-xs text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Invoice Tracker (Crew Cab standalone) ────────────────────────────────────

// Canonical order of trip types for grouping
const TRIP_TYPE_ORDER = [
  "arrival_transport",
  "departure_transport",
  "crew_pickup",
  "inhouse",
  "airport_transfer",
  "delivery_collection",
  "seaport_crew_change",
  "shorebased",
];

function InvoiceTracker() {
  const [trips, setTrips] = useState<TrackerTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterYacht, setFilterYacht] = useState("all");
  const [filterBilling, setFilterBilling] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editInvoiceRef, setEditInvoiceRef] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [grouped, setGrouped] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("crew_trips")
      .select("id, trip_type, pickup_datetime, passenger_name, pickup_address, dropoff_address, notes, status, billing_status, invoice_ref, invoice_amount, driver:crew_drivers(full_name), yacht:yachts(vessel_name)")
      .order("pickup_datetime", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    else setTrips((data ?? []) as TrackerTrip[]);
    setLoading(false);
  }

  const yachts = useMemo(() => {
    const names = new Set<string>();
    trips.forEach(t => { if (t.yacht?.vessel_name) names.add(t.yacht.vessel_name); });
    return Array.from(names).sort();
  }, [trips]);

  const filtered = useMemo(() => trips.filter(t => {
    if (filterYacht !== "all" && t.yacht?.vessel_name !== filterYacht) return false;
    if (filterBilling !== "all" && t.billing_status !== filterBilling) return false;
    if (filterType !== "all" && t.trip_type !== filterType) return false;
    if (q.trim()) {
      const qq = q.toLowerCase();
      const hay = [t.passenger_name, t.pickup_address, t.dropoff_address, t.yacht?.vessel_name, t.driver?.full_name, t.invoice_ref, t.notes].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  }), [trips, filterYacht, filterBilling, filterType, q]);

  // Group trips by type, maintaining canonical order
  const groupedTrips = useMemo(() => {
    const map = new Map<string, TrackerTrip[]>();
    TRIP_TYPE_ORDER.forEach(k => map.set(k, []));
    filtered.forEach(t => {
      const key = t.trip_type ?? "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    // Remove empty groups and sort canonical + unknown types last
    const result: Array<{ type: string; label: string; trips: TrackerTrip[] }> = [];
    map.forEach((tripsArr, type) => {
      if (tripsArr.length > 0)
        result.push({ type, label: TRIP_TYPE_LABEL[type] ?? type, trips: tripsArr });
    });
    return result;
  }, [filtered]);

  function toggleGroup(type: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  async function updateBilling(id: string, billing_status: BillingStatus, invoice_ref?: string, invoice_amount?: number | null) {
    setSaving(id);
    const patch: any = { billing_status };
    if (invoice_ref !== undefined) patch.invoice_ref = invoice_ref || null;
    if (invoice_amount !== undefined) patch.invoice_amount = invoice_amount;
    const { error } = await (supabase as any).from("crew_trips").update(patch).eq("id", id);
    if (error) { toast.error(error.message); setSaving(null); return; }
    setTrips(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    setEditingRow(null);
    setSaving(null);
    toast.success("Updated");
  }

  function fmtDate(dt: string | null) {
    if (!dt) return "—";
    return new Date(dt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtAed(n: number | null) {
    if (!n) return "—";
    return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return (
    <div className="space-y-4">
      <StatsBar items={trips} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search trips…" className="pl-8 h-8 text-sm" />
        </div>
        <Select value={filterYacht} onValueChange={setFilterYacht}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All yachts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Yachts</SelectItem>
            {yachts.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterBilling} onValueChange={setFilterBilling}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Billing</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="pending_invoice">Needs Invoice</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
            <SelectItem value="not_billable">Not Billable</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TRIP_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        {(q || filterYacht !== "all" || filterBilling !== "all" || filterType !== "all") && (
          <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => { setQ(""); setFilterYacht("all"); setFilterBilling("all"); setFilterType("all"); }}>
            <RotateCcw className="h-3 w-3" /> Clear
          </Button>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => setGrouped(g => !g)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors h-8 ${grouped ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-border/80"}`}
          >
            <LayoutGrid className="h-3 w-3" /> {grouped ? "Grouped" : "Group by Type"}
          </button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => {
            const rows = filtered.map(t => ({
              Date: t.pickup_datetime ? new Date(t.pickup_datetime).toLocaleDateString("en-GB") : "",
              Type: TRIP_TYPE_LABEL[t.trip_type] ?? t.trip_type,
              Yacht: t.yacht?.vessel_name ?? "",
              Driver: t.driver?.full_name ?? "",
              Pickup: t.pickup_address ?? "",
              Dropoff: t.dropoff_address ?? "",
              Notes: t.notes ?? "",
              "Billing Status": t.billing_status ?? "",
              "Invoice Ref": t.invoice_ref ?? "",
              "Amount (AED)": t.invoice_amount ?? "",
            }));
            downloadCSV(`trips-tracker-${new Date().toISOString().slice(0,10)}.csv`, rows);
          }} disabled={filtered.length === 0}>
            <Download className="h-3 w-3" /> Export
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {(grouped
                  ? ["Date", "Yacht", "Driver", "Pickup → Dropoff", "Notes", "Billing Status", "Invoice Ref", "Amount (AED)", "Actions"]
                  : ["Date", "Type", "Yacht", "Driver", "Pickup → Dropoff", "Notes", "Billing Status", "Invoice Ref", "Amount (AED)", "Actions"]
                ).map(col => (
                  <th key={col} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr><td colSpan={grouped ? 9 : 10} className="px-3 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={grouped ? 9 : 10} className="px-3 py-10 text-center text-sm text-muted-foreground">No trips match the current filters.</td></tr>
              ) : grouped ? (
                // ── Grouped view ──────────────────────────────────────────────
                groupedTrips.map(({ type, label, trips: groupTrips }) => {
                  const isCollapsed = collapsedGroups.has(type);
                  const groupTotal = groupTrips.reduce((s, t) => s + (t.invoice_amount ?? 0), 0);
                  const billable = groupTrips.filter(t => t.billing_status !== "not_billable").length;
                  const invoiced = groupTrips.filter(t => t.billing_status === "invoiced").length;
                  return (
                    <>
                      {/* Group header row */}
                      <tr
                        key={`group-${type}`}
                        className="bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleGroup(type)}
                      >
                        <td colSpan={9} className="px-3 py-2">
                          <div className="flex items-center gap-3">
                            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
                            <span className="font-semibold text-[13px] text-foreground">{label}</span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{groupTrips.length}</span>
                            <span className="text-[11px] text-muted-foreground">{billable} billable · {invoiced} invoiced</span>
                            {groupTotal > 0 && (
                              <span className="ml-auto text-[11px] font-semibold text-emerald-400">
                                AED {groupTotal.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Group rows — no Type column (shown in header) */}
                      {!isCollapsed && groupTrips.map(trip => {
                        const isEditing = editingRow === trip.id;
                        const isSaving = saving === trip.id;
                        const bs = (trip.billing_status ?? "pending_review") as BillingStatus;
                        return (
                          <tr key={trip.id} className="hover:bg-muted/10 transition-colors">
                            <td className="pl-8 pr-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDate(trip.pickup_datetime)}</td>
                            <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">{trip.yacht?.vessel_name ?? <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{trip.driver?.full_name ?? "—"}</td>
                            <td className="px-3 py-2 text-xs max-w-[200px]">
                              <div className="truncate text-muted-foreground">{[trip.pickup_address, trip.dropoff_address].filter(Boolean).join(" → ") || "—"}</div>
                            </td>
                            <td className="px-3 py-2 text-xs max-w-[150px]">
                              <div className="truncate text-muted-foreground">{trip.notes ?? "—"}</div>
                            </td>
                            <td className="px-3 py-2"><BillingBadge status={bs} /></td>
                            <td className="px-3 py-2 text-xs">
                              {isEditing ? null : <span className="text-muted-foreground">{trip.invoice_ref ?? "—"}</span>}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {isEditing ? null : <span className="text-muted-foreground">{fmtAed(trip.invoice_amount)}</span>}
                            </td>
                            <td className="px-3 py-2">
                              <BillingActions
                                id={trip.id} bs={bs} saving={isSaving} isEditing={isEditing}
                                editRef={isEditing ? editInvoiceRef : ""}
                                editAmount={isEditing ? editAmount : ""}
                                onSetEditRef={setEditInvoiceRef} onSetEditAmount={setEditAmount}
                                onStartEdit={() => { setEditingRow(trip.id); setEditInvoiceRef(trip.invoice_ref ?? ""); setEditAmount(trip.invoice_amount ? String(trip.invoice_amount) : ""); }}
                                onCancelEdit={() => setEditingRow(null)}
                                onSaveInvoiced={() => updateBilling(trip.id, "invoiced", editInvoiceRef, editAmount ? parseFloat(editAmount) : null)}
                                onFlag={() => updateBilling(trip.id, "pending_invoice")}
                                onNotBillable={() => updateBilling(trip.id, "not_billable")}
                                onReset={() => updateBilling(trip.id, "pending_review")}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  );
                })
              ) : (
                // ── Flat view ─────────────────────────────────────────────────
                filtered.map(trip => {
                  const isEditing = editingRow === trip.id;
                  const isSaving = saving === trip.id;
                  const bs = (trip.billing_status ?? "pending_review") as BillingStatus;
                  return (
                    <tr key={trip.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDate(trip.pickup_datetime)}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{TRIP_TYPE_LABEL[trip.trip_type] ?? trip.trip_type}</td>
                      <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">{trip.yacht?.vessel_name ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{trip.driver?.full_name ?? "—"}</td>
                      <td className="px-3 py-2 text-xs max-w-[200px]">
                        <div className="truncate text-muted-foreground">{[trip.pickup_address, trip.dropoff_address].filter(Boolean).join(" → ") || "—"}</div>
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[150px]">
                        <div className="truncate text-muted-foreground">{trip.notes ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2"><BillingBadge status={bs} /></td>
                      <td className="px-3 py-2 text-xs">
                        {isEditing ? null : <span className="text-muted-foreground">{trip.invoice_ref ?? "—"}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {isEditing ? null : <span className="text-muted-foreground">{fmtAed(trip.invoice_amount)}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <BillingActions
                          id={trip.id} bs={bs} saving={isSaving} isEditing={isEditing}
                          editRef={isEditing ? editInvoiceRef : ""}
                          editAmount={isEditing ? editAmount : ""}
                          onSetEditRef={setEditInvoiceRef} onSetEditAmount={setEditAmount}
                          onStartEdit={() => { setEditingRow(trip.id); setEditInvoiceRef(trip.invoice_ref ?? ""); setEditAmount(trip.invoice_amount ? String(trip.invoice_amount) : ""); }}
                          onCancelEdit={() => setEditingRow(null)}
                          onSaveInvoiced={() => updateBilling(trip.id, "invoiced", editInvoiceRef, editAmount ? parseFloat(editAmount) : null)}
                          onFlag={() => updateBilling(trip.id, "pending_invoice")}
                          onNotBillable={() => updateBilling(trip.id, "not_billable")}
                          onReset={() => updateBilling(trip.id, "pending_review")}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
            Showing {filtered.length} of {trips.length} trips
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Packages Tracker ─────────────────────────────────────────────────────────

function PackagesTracker() {
  const [items, setItems] = useState<TrackerPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterBilling, setFilterBilling] = useState("all");
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editRef, setEditRef] = useState("");
  const [editAmount, setEditAmount] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("packages")
      .select("id, tracking_number, carrier, description, recipient_name, received_date, status, billing_status, invoice_ref, invoice_amount, yacht:yachts(vessel_name)")
      .order("received_date", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    else setItems((data ?? []) as TrackerPackage[]);
    setLoading(false);
  }

  const filtered = useMemo(() => items.filter(i => {
    if (filterBilling !== "all" && i.billing_status !== filterBilling) return false;
    if (q.trim()) {
      const qq = q.toLowerCase();
      const hay = [i.tracking_number, i.carrier, i.description, i.recipient_name, i.yacht?.vessel_name, i.invoice_ref].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  }), [items, filterBilling, q]);

  async function updateBilling(id: string, billing_status: BillingStatus, invoice_ref?: string, invoice_amount?: number | null) {
    setSaving(id);
    const patch: any = { billing_status };
    if (invoice_ref !== undefined) patch.invoice_ref = invoice_ref || null;
    if (invoice_amount !== undefined) patch.invoice_amount = invoice_amount;
    const { error } = await (supabase as any).from("packages").update(patch).eq("id", id);
    if (error) { toast.error(error.message); setSaving(null); return; }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setEditingRow(null);
    setSaving(null);
    toast.success("Updated");
  }

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  const STATUS_COLOR: Record<string, string> = {
    received: "bg-blue-500/15 text-blue-400",
    in_transit: "bg-amber-500/15 text-amber-400",
    delivered: "bg-emerald-500/15 text-emerald-400",
    returned: "bg-red-500/15 text-red-400",
  };

  return (
    <div className="space-y-4">
      <StatsBar items={items} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search packages…" className="pl-8 h-8 text-sm" />
        </div>
        <Select value={filterBilling} onValueChange={setFilterBilling}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All billing" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Billing</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="pending_invoice">Needs Invoice</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
            <SelectItem value="not_billable">Not Billable</SelectItem>
          </SelectContent>
        </Select>
        {(q || filterBilling !== "all") && (
          <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => { setQ(""); setFilterBilling("all"); }}>
            <RotateCcw className="h-3 w-3" /> Clear
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto" onClick={() => {
          const rows = filtered.map(p => ({
            "Tracking No": p.tracking_number ?? "", Carrier: p.carrier ?? "", Description: p.description ?? "",
            Recipient: p.recipient_name ?? "", Yacht: p.yacht?.vessel_name ?? "",
            "Received Date": p.received_date ?? "", Status: p.status ?? "",
            "Billing Status": p.billing_status ?? "", "Invoice Ref": p.invoice_ref ?? "", "Amount (AED)": p.invoice_amount ?? "",
          }));
          downloadCSV(`packages-tracker-${new Date().toISOString().slice(0,10)}.csv`, rows);
        }} disabled={filtered.length === 0}>
          <Download className="h-3 w-3" /> Export
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </Button>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {["Received", "Yacht", "Tracking #", "Carrier", "Description", "Recipient", "Status", "Billing", "Invoice Ref", "Amount", "Actions"].map(col => (
                  <th key={col} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr><td colSpan={11} className="px-3 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-sm text-muted-foreground">No packages match the current filters.</td></tr>
              ) : filtered.map(pkg => {
                const isEditing = editingRow === pkg.id;
                const isSaving = saving === pkg.id;
                const bs = (pkg.billing_status ?? "pending_review") as BillingStatus;
                return (
                  <tr key={pkg.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDate(pkg.received_date)}</td>
                    <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">{pkg.yacht?.vessel_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{pkg.tracking_number ?? "—"}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{pkg.carrier ?? "—"}</td>
                    <td className="px-3 py-2 text-xs max-w-[150px]"><div className="truncate text-muted-foreground">{pkg.description ?? "—"}</div></td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{pkg.recipient_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[pkg.status] ?? "bg-muted/60 text-muted-foreground"}`}>
                        {pkg.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2"><BillingBadge status={bs} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{isEditing ? null : (pkg.invoice_ref ?? "—")}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{isEditing ? null : (pkg.invoice_amount ? `AED ${pkg.invoice_amount.toLocaleString()}` : "—")}</td>
                    <td className="px-3 py-2">
                      <BillingActions
                        id={pkg.id} bs={bs} saving={isSaving} isEditing={isEditing}
                        editRef={editingRow === pkg.id ? editRef : ""}
                        editAmount={editingRow === pkg.id ? editAmount : ""}
                        onSetEditRef={setEditRef} onSetEditAmount={setEditAmount}
                        onStartEdit={() => { setEditingRow(pkg.id); setEditRef(pkg.invoice_ref ?? ""); setEditAmount(pkg.invoice_amount ? String(pkg.invoice_amount) : ""); }}
                        onCancelEdit={() => setEditingRow(null)}
                        onSaveInvoiced={() => updateBilling(pkg.id, "invoiced", editRef, editAmount ? parseFloat(editAmount) : null)}
                        onFlag={() => updateBilling(pkg.id, "pending_invoice")}
                        onNotBillable={() => updateBilling(pkg.id, "not_billable")}
                        onReset={() => updateBilling(pkg.id, "pending_review")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
            Showing {filtered.length} of {items.length} packages
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Yacht IT Tracker ─────────────────────────────────────────────────────────

function YachtItTracker() {
  const [items, setItems] = useState<TrackerItContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterBilling, setFilterBilling] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editRef, setEditRef] = useState("");
  const [editAmount, setEditAmount] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("yacht_it_contracts")
      .select("id, service_name, vendor, category, charge_amount, billing_cycle, expiry_date, status, billing_status, invoice_ref, invoice_amount, yacht:yachts(vessel_name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    else setItems((data ?? []) as TrackerItContract[]);
    setLoading(false);
  }

  const categories = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => { if (i.category) s.add(i.category); });
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => items.filter(i => {
    if (filterBilling !== "all" && i.billing_status !== filterBilling) return false;
    if (filterCategory !== "all" && i.category !== filterCategory) return false;
    if (q.trim()) {
      const qq = q.toLowerCase();
      const hay = [i.service_name, i.vendor, i.category, i.yacht?.vessel_name, i.invoice_ref].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  }), [items, filterBilling, filterCategory, q]);

  async function updateBilling(id: string, billing_status: BillingStatus, invoice_ref?: string, invoice_amount?: number | null) {
    setSaving(id);
    const patch: any = { billing_status };
    if (invoice_ref !== undefined) patch.invoice_ref = invoice_ref || null;
    if (invoice_amount !== undefined) patch.invoice_amount = invoice_amount;
    const { error } = await (supabase as any).from("yacht_it_contracts").update(patch).eq("id", id);
    if (error) { toast.error(error.message); setSaving(null); return; }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setEditingRow(null);
    setSaving(null);
    toast.success("Updated");
  }

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  const STATUS_COLOR: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-400",
    expired: "bg-red-500/15 text-red-400",
    cancelled: "bg-slate-500/15 text-slate-400",
    pending: "bg-amber-500/15 text-amber-400",
  };

  return (
    <div className="space-y-4">
      <StatsBar items={items} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search contracts…" className="pl-8 h-8 text-sm" />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterBilling} onValueChange={setFilterBilling}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All billing" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Billing</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="pending_invoice">Needs Invoice</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
            <SelectItem value="not_billable">Not Billable</SelectItem>
          </SelectContent>
        </Select>
        {(q || filterBilling !== "all" || filterCategory !== "all") && (
          <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => { setQ(""); setFilterBilling("all"); setFilterCategory("all"); }}>
            <RotateCcw className="h-3 w-3" /> Clear
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto" onClick={() => {
          const rows = filtered.map(c => ({
            Service: c.service_name, Vendor: c.vendor ?? "", Category: c.category,
            Yacht: c.yacht?.vessel_name ?? "", "Charge (AED)": c.charge_amount ?? "",
            "Billing Cycle": c.billing_cycle, "Expiry Date": c.expiry_date ?? "",
            Status: c.status, "Billing Status": c.billing_status ?? "",
            "Invoice Ref": c.invoice_ref ?? "", "Amount (AED)": c.invoice_amount ?? "",
          }));
          downloadCSV(`it-tracker-${new Date().toISOString().slice(0,10)}.csv`, rows);
        }} disabled={filtered.length === 0}>
          <Download className="h-3 w-3" /> Export
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </Button>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {["Service", "Yacht", "Vendor", "Category", "Charge", "Cycle", "Expiry", "Status", "Billing", "Invoice Ref", "Amount", "Actions"].map(col => (
                  <th key={col} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr><td colSpan={12} className="px-3 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-10 text-center text-sm text-muted-foreground">No IT contracts match the current filters.</td></tr>
              ) : filtered.map(c => {
                const isEditing = editingRow === c.id;
                const isSaving = saving === c.id;
                const bs = (c.billing_status ?? "pending_review") as BillingStatus;
                return (
                  <tr key={c.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">{c.service_name}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{c.yacht?.vessel_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{c.vendor ?? "—"}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] capitalize">{c.category.replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{c.charge_amount ? `AED ${c.charge_amount.toLocaleString()}` : "—"}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground capitalize">{c.billing_cycle}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDate(c.expiry_date)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[c.status] ?? "bg-muted/60 text-muted-foreground"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2"><BillingBadge status={bs} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{isEditing ? null : (c.invoice_ref ?? "—")}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{isEditing ? null : (c.invoice_amount ? `AED ${c.invoice_amount.toLocaleString()}` : "—")}</td>
                    <td className="px-3 py-2">
                      <BillingActions
                        id={c.id} bs={bs} saving={isSaving} isEditing={isEditing}
                        editRef={editingRow === c.id ? editRef : ""}
                        editAmount={editingRow === c.id ? editAmount : ""}
                        onSetEditRef={setEditRef} onSetEditAmount={setEditAmount}
                        onStartEdit={() => { setEditingRow(c.id); setEditRef(c.invoice_ref ?? ""); setEditAmount(c.invoice_amount ? String(c.invoice_amount) : ""); }}
                        onCancelEdit={() => setEditingRow(null)}
                        onSaveInvoiced={() => updateBilling(c.id, "invoiced", editRef, editAmount ? parseFloat(editAmount) : null)}
                        onFlag={() => updateBilling(c.id, "pending_invoice")}
                        onNotBillable={() => updateBilling(c.id, "not_billable")}
                        onReset={() => updateBilling(c.id, "pending_review")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
            Showing {filtered.length} of {items.length} contracts
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Procurement Tracker ──────────────────────────────────────────────────────

function ProcurementTracker() {
  const [items, setItems] = useState<TrackerProcurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterBilling, setFilterBilling] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editRef, setEditRef] = useState("");
  const [editAmount, setEditAmount] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("procurement_items")
      .select("id, item_name, vendor, category, quantity, unit_price, total_amount, status, requested_date, billing_status, invoice_ref, invoice_amount, yacht:yachts(vessel_name)")
      .order("requested_date", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    else setItems((data ?? []) as TrackerProcurement[]);
    setLoading(false);
  }

  const filtered = useMemo(() => items.filter(i => {
    if (filterBilling !== "all" && i.billing_status !== filterBilling) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (q.trim()) {
      const qq = q.toLowerCase();
      const hay = [i.item_name, i.vendor, i.category, i.yacht?.vessel_name].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  }), [items, filterBilling, filterStatus, q]);

  async function updateBilling(id: string, billing_status: BillingStatus, invoice_ref?: string, invoice_amount?: number | null) {
    setSaving(id);
    const patch: any = { billing_status };
    if (invoice_ref !== undefined) patch.invoice_ref = invoice_ref || null;
    if (invoice_amount !== undefined) patch.invoice_amount = invoice_amount;
    const { error } = await (supabase as any).from("procurement_items").update(patch).eq("id", id);
    if (error) { toast.error(error.message); setSaving(null); return; }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setEditingRow(null);
    setSaving(null);
    toast.success("Updated");
  }

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  const STATUS_COLOR: Record<string, string> = {
    requested: "bg-blue-500/15 text-blue-400",
    approved: "bg-emerald-500/15 text-emerald-400",
    ordered: "bg-amber-500/15 text-amber-400",
    received: "bg-emerald-500/15 text-emerald-400",
    cancelled: "bg-red-500/15 text-red-400",
  };

  const PRIORITY_COLOR: Record<string, string> = {
    low: "text-muted-foreground",
    normal: "text-foreground",
    high: "text-amber-400",
    urgent: "text-red-400",
  };

  return (
    <div className="space-y-4">
      <StatsBar items={items} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items…" className="pl-8 h-8 text-sm" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="requested">Requested</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="ordered">Ordered</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterBilling} onValueChange={setFilterBilling}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All billing" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Billing</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="pending_invoice">Needs Invoice</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
            <SelectItem value="not_billable">Not Billable</SelectItem>
          </SelectContent>
        </Select>
        {(q || filterBilling !== "all" || filterStatus !== "all") && (
          <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => { setQ(""); setFilterBilling("all"); setFilterStatus("all"); }}>
            <RotateCcw className="h-3 w-3" /> Clear
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto" onClick={() => {
          const rows = filtered.map(p => ({
            Item: p.item_name, Vendor: p.vendor ?? "", Category: p.category,
            Quantity: p.quantity, "Unit Price (AED)": p.unit_price ?? "",
            "Total (AED)": p.total_amount ?? "", Yacht: p.yacht?.vessel_name ?? "",
            "Requested Date": p.requested_date ?? "", Status: p.status,
            "Billing Status": p.billing_status ?? "", "Invoice Ref": p.invoice_ref ?? "",
            "Amount (AED)": p.invoice_amount ?? "",
          }));
          downloadCSV(`procurement-tracker-${new Date().toISOString().slice(0,10)}.csv`, rows);
        }} disabled={filtered.length === 0}>
          <Download className="h-3 w-3" /> Export
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </Button>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {["Requested", "Item", "Yacht", "Vendor", "Qty", "Unit Price", "Total", "Status", "Billing", "Invoice Ref", "Inv. Amount", "Actions"].map(col => (
                  <th key={col} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr><td colSpan={12} className="px-3 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-10 text-center text-sm text-muted-foreground">No procurement items match the current filters.</td></tr>
              ) : filtered.map(item => {
                const isEditing = editingRow === item.id;
                const isSaving = saving === item.id;
                const bs = (item.billing_status ?? "pending_review") as BillingStatus;
                return (
                  <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDate(item.requested_date)}</td>
                    <td className="px-3 py-2 text-xs font-medium max-w-[160px]"><div className="truncate">{item.item_name}</div></td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{item.yacht?.vessel_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{item.vendor ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{item.quantity}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{item.unit_price ? `AED ${item.unit_price.toLocaleString()}` : "—"}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap font-medium">{item.total_amount ? `AED ${item.total_amount.toLocaleString()}` : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[item.status] ?? "bg-muted/60 text-muted-foreground"}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2"><BillingBadge status={bs} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{isEditing ? null : (item.invoice_ref ?? "—")}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{isEditing ? null : (item.invoice_amount ? `AED ${item.invoice_amount.toLocaleString()}` : "—")}</td>
                    <td className="px-3 py-2">
                      <BillingActions
                        id={item.id} bs={bs} saving={isSaving} isEditing={isEditing}
                        editRef={editingRow === item.id ? editRef : ""}
                        editAmount={editingRow === item.id ? editAmount : ""}
                        onSetEditRef={setEditRef} onSetEditAmount={setEditAmount}
                        onStartEdit={() => { setEditingRow(item.id); setEditRef(item.invoice_ref ?? ""); setEditAmount(item.invoice_amount ? String(item.invoice_amount) : ""); }}
                        onCancelEdit={() => setEditingRow(null)}
                        onSaveInvoiced={() => updateBilling(item.id, "invoiced", editRef, editAmount ? parseFloat(editAmount) : null)}
                        onFlag={() => updateBilling(item.id, "pending_invoice")}
                        onNotBillable={() => updateBilling(item.id, "not_billable")}
                        onReset={() => updateBilling(item.id, "pending_review")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
            Showing {filtered.length} of {items.length} items
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Visa Tracker ─────────────────────────────────────────────────────────────

const VISA_STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-400",
  pending_docs: "bg-amber-500/15 text-amber-400",
  submitted: "bg-blue-500/15 text-blue-400",
  in_review: "bg-amber-500/15 text-amber-400",
  processing: "bg-violet-500/15 text-violet-400",
  approved: "bg-emerald-500/15 text-emerald-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  rejected: "bg-red-500/15 text-red-400",
  cancelled: "bg-slate-500/15 text-slate-400",
};

function visaName(v: TrackerVisa) {
  return `${v.given_name ?? ""} ${v.surname ?? ""}`.trim() || "—";
}

async function authToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

/** DD-MM-YY to match the printed tax invoice (e.g. "02-06-26"). */
function ddmmyy(d: string | null): string | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}-${m[2]}-${m[1].slice(2)}` : null;
}

type CatalogItem = { qbo_item_name: string; unit_price: number | null; tax_code: string | null; description_label: string | null };
type DialogLine = { itemName: string; label: string; unitPrice: string; crewIds: string[]; includeDate: boolean };

// ─── Generate Invoice (QuickBooks) dialog ─────────────────────────────────────
// Builds QBO invoice lines from the selected visa applications — each line is a
// service (an existing QBO Item) with the crew it covers. Mirrors the paper tax
// invoice (service line + numbered crew names + qty/unit/VAT).
function GenerateInvoiceDialog({
  apps, onClose, onDone,
}: {
  apps: TrackerVisa[];
  onClose: () => void;
  onDone: (docNumber: string) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [lines, setLines] = useState<DialogLine[]>([
    { itemName: "", label: "", unitPrice: "", crewIds: apps.map(a => a.id), includeDate: true },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vessels = useMemo(() => Array.from(new Set(apps.map(a => a.yacht?.vessel_name ?? "—"))), [apps]);
  const yachtId = (apps[0] as any)?.yacht_id ?? null;
  const singleVessel = vessels.length === 1;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/qb/invoice", { headers: { Authorization: `Bearer ${await authToken()}` } });
        const j = await res.json();
        if (j.ok) { setCatalog(j.catalog ?? []); setConfigured(!!j.configured); }
      } catch { /* non-fatal */ }
    })();
  }, []);

  function setLine(i: number, patch: Partial<DialogLine>) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function pickService(i: number, name: string) {
    const cat = catalog.find(c => c.qbo_item_name === name);
    setLine(i, {
      itemName: name,
      unitPrice: cat?.unit_price != null ? String(cat.unit_price) : lines[i].unitPrice,
      // Auto-fill the printed heading from the catalog label (editable).
      label: cat?.description_label || (lines[i].label || name),
    });
  }
  function toggleCrew(i: number, id: string) {
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l;
      const has = l.crewIds.includes(id);
      return { ...l, crewIds: has ? l.crewIds.filter(x => x !== id) : [...l.crewIds, id] };
    }));
  }

  const total = lines.reduce((s, l) => s + (parseFloat(l.unitPrice) || 0) * l.crewIds.length, 0);
  const canSubmit = singleVessel && yachtId && lines.length > 0 &&
    lines.every(l => l.itemName.trim() && l.crewIds.length > 0 && parseFloat(l.unitPrice) > 0) && !submitting;

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/qb/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await authToken()}` },
        body: JSON.stringify({
          source: "visa",
          yachtId,
          lines: lines.map(l => ({
            itemName: l.itemName.trim(),
            descriptionLabel: l.label.trim(),
            includeDate: l.includeDate,
            visaIds: l.crewIds,
            unitPrice: parseFloat(l.unitPrice),
          })),
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        setError(j.code === "not_configured"
          ? "QuickBooks isn’t connected yet. Add the QBO credentials and try again."
          : (j.error ?? "Failed to create invoice."));
        setSubmitting(false);
        return;
      }
      toast.success(`Invoice ${j.docNumber} created in QuickBooks (AED ${Number(j.total).toLocaleString()})`);
      onDone(j.docNumber);
    } catch (e: any) {
      setError(String(e?.message ?? e)); setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] overflow-auto rounded-xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Generate Invoice — QuickBooks</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{apps.length} application{apps.length === 1 ? "" : "s"} · {vessels.join(", ")}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted/50"><XCircle className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {!singleVessel && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              Selected applications span multiple vessels. An invoice is per-customer — select crew from a single vessel.
            </div>
          )}
          {!configured && singleVessel && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              QuickBooks isn’t connected yet — you can build the lines, but creating will fail until QBO credentials are set.
            </div>
          )}

          {lines.map((line, i) => {
            const qty = line.crewIds.length;
            const amt = (parseFloat(line.unitPrice) || 0) * qty;
            return (
              <div key={i} className="rounded-lg border border-border bg-background/50 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Service (QuickBooks Item)</label>
                    <input
                      list="qbo-visa-items"
                      value={line.itemName}
                      onChange={e => pickService(i, e.target.value)}
                      placeholder="e.g. UAE 6 Months Cabin Crew Visa per pax"
                      className="mt-0.5 w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Unit (AED)</label>
                    <input
                      type="number" step="0.01" value={line.unitPrice}
                      onChange={e => setLine(i, { unitPrice: e.target.value })}
                      placeholder="0.00"
                      className="mt-0.5 w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  {lines.length > 1 && (
                    <button onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))}
                      title="Remove line" className="mt-4 rounded p-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Description heading (prints above the crew names)</label>
                  <input
                    value={line.label}
                    onChange={e => setLine(i, { label: e.target.value })}
                    placeholder="e.g. UAE 6 Months Cabin Crew Visa per pax"
                    className="mt-0.5 w-full h-8 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Crew on this line ({qty})</label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {apps.map(a => {
                      const on = line.crewIds.includes(a.id);
                      return (
                        <button key={a.id} onClick={() => toggleCrew(i, a.id)}
                          className={`rounded-full border px-2 py-0.5 text-[11px] transition ${on ? "border-primary bg-primary/15 text-foreground" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}>
                          {visaName(a)}{line.includeDate && ddmmyy(a.visa_issuance_date) ? ` (${ddmmyy(a.visa_issuance_date)})` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={line.includeDate} onChange={e => setLine(i, { includeDate: e.target.checked })} />
                  Append each crew member’s visa issue date <span className="text-muted-foreground/60">(DD-MM-YY)</span>
                </label>
                {/* Live preview of how this line's Description will read on the invoice */}
                <div className="rounded border border-border/60 bg-muted/20 px-2.5 py-1.5">
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground/60">Invoice description preview</div>
                  <pre className="mt-0.5 whitespace-pre-wrap font-sans text-[11px] leading-snug text-foreground/90">
{[(line.label || line.itemName || "—"), ...line.crewIds.map((id, n) => {
  const a = apps.find(x => x.id === id);
  const dt = line.includeDate ? ddmmyy(a?.visa_issuance_date ?? null) : null;
  return `${n + 1}. ${a ? visaName(a) : ""}${dt ? ` (${dt})` : ""}`;
}).filter(Boolean)].join("\n")}
                  </pre>
                </div>
                <div className="text-right text-xs text-muted-foreground">Qty {qty} × {line.unitPrice || 0} = <span className="font-semibold text-foreground">AED {amt.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span></div>
              </div>
            );
          })}
          <datalist id="qbo-visa-items">
            {catalog.map(c => <option key={c.qbo_item_name} value={c.qbo_item_name} />)}
          </datalist>

          <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
            onClick={() => setLines(prev => [...prev, { itemName: "", label: "", unitPrice: "", crewIds: apps.map(a => a.id), includeDate: true }])}>
            + Add line
          </Button>

          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3.5">
          <div className="text-sm">Subtotal: <span className="font-semibold">AED {total.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</span> <span className="text-[11px] text-muted-foreground">(+ VAT in QBO)</span></div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="gap-1.5" disabled={!canSubmit} onClick={submit}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Create in QuickBooks
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisaTracker() {
  const [items, setItems] = useState<TrackerVisa[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showGen, setShowGen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterYacht, setFilterYacht] = useState("all");
  const [filterBilling, setFilterBilling] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editRef, setEditRef] = useState("");
  const [editAmount, setEditAmount] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("visa_applications")
      .select("id, yacht_id, given_name, surname, nationality, visa_type, visa_number, visa_issuance_date, country_code, status, submitted_at, created_at, billing_status, invoice_ref, invoice_amount, yacht:yachts(vessel_name)")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) toast.error(error.message);
    else setItems((data ?? []) as TrackerVisa[]);
    setLoading(false);
  }

  const yachts = useMemo(() => {
    const names = new Set<string>();
    items.forEach(i => { if (i.yacht?.vessel_name) names.add(i.yacht.vessel_name); });
    return Array.from(names).sort();
  }, [items]);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => { if (i.status) s.add(i.status); });
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => items.filter(i => {
    if (filterYacht !== "all" && i.yacht?.vessel_name !== filterYacht) return false;
    if (filterBilling !== "all" && i.billing_status !== filterBilling) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (q.trim()) {
      const qq = q.toLowerCase();
      const hay = [visaName(i), i.nationality, i.visa_number, i.visa_type, i.yacht?.vessel_name, i.invoice_ref].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  }), [items, filterYacht, filterBilling, filterStatus, q]);

  const pendingFiltered = useMemo(() => filtered.filter(i => (i.billing_status ?? "pending_review") === "pending_invoice"), [filtered]);
  const selectedApps = useMemo(() => items.filter(i => selected.has(i.id)), [items, selected]);
  const selectedVessels = useMemo(() => Array.from(new Set(selectedApps.map(a => a.yacht?.vessel_name ?? "—"))), [selectedApps]);

  async function updateBilling(id: string, billing_status: BillingStatus, invoice_ref?: string, invoice_amount?: number | null) {
    setSaving(id);
    const patch: any = { billing_status };
    if (invoice_ref !== undefined) patch.invoice_ref = invoice_ref || null;
    if (invoice_amount !== undefined) patch.invoice_amount = invoice_amount;
    const { error } = await (supabase as any).from("visa_applications").update(patch).eq("id", id);
    if (error) { toast.error(error.message); setSaving(null); return; }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setEditingRow(null);
    setSaving(null);
    toast.success("Updated");
  }

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="space-y-4">
      <StatsBar items={items} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search crew, passport, visa…" className="pl-8 h-8 text-sm" />
        </div>
        <Select value={filterYacht} onValueChange={setFilterYacht}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All yachts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Yachts</SelectItem>
            {yachts.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterBilling} onValueChange={setFilterBilling}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All billing" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Billing</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="pending_invoice">Needs Invoice</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
            <SelectItem value="not_billable">Not Billable</SelectItem>
          </SelectContent>
        </Select>
        {(q || filterYacht !== "all" || filterBilling !== "all" || filterStatus !== "all") && (
          <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => { setQ(""); setFilterYacht("all"); setFilterBilling("all"); setFilterStatus("all"); }}>
            <RotateCcw className="h-3 w-3" /> Clear
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto" onClick={() => {
          const rows = filtered.map(v => ({
            "Given Name": v.given_name ?? "", Surname: v.surname ?? "", Nationality: v.nationality ?? "",
            "Visa Type": v.visa_type ?? "", "Visa Ref": v.visa_number ?? "", Yacht: v.yacht?.vessel_name ?? "",
            Status: v.status ?? "", Submitted: v.submitted_at ?? v.created_at ?? "",
            "Billing Status": v.billing_status ?? "", "Invoice Ref": v.invoice_ref ?? "", "Amount (AED)": v.invoice_amount ?? "",
          }));
          downloadCSV(`visa-tracker-${new Date().toISOString().slice(0,10)}.csv`, rows);
        }} disabled={filtered.length === 0}>
          <Download className="h-3 w-3" /> Export
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </Button>
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected{selectedVessels.length === 1 ? ` · ${selectedVessels[0]}` : ""}</span>
          <Button size="sm" className="h-7 text-xs gap-1.5" disabled={selectedVessels.length !== 1}
            title={selectedVessels.length !== 1 ? "Select crew from a single vessel" : "Generate a QuickBooks invoice"}
            onClick={() => setShowGen(true)}>
            <FileText className="h-3.5 w-3.5" /> Generate Invoice
          </Button>
          {selectedVessels.length > 1 && <span className="text-xs text-amber-400">One vessel per invoice</span>}
          <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" aria-label="Select all billable"
                    checked={pendingFiltered.length > 0 && pendingFiltered.every(p => selected.has(p.id))}
                    onChange={e => {
                      setSelected(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) pendingFiltered.forEach(p => next.add(p.id));
                        else pendingFiltered.forEach(p => next.delete(p.id));
                        return next;
                      });
                    }} />
                </th>
                {["Crew", "Yacht", "Nationality", "Visa Type", "Visa Ref", "Submitted", "Status", "Billing", "Invoice Ref", "Amount", "Actions"].map(col => (
                  <th key={col} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr><td colSpan={12} className="px-3 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-10 text-center text-sm text-muted-foreground">No visa applications match the current filters.</td></tr>
              ) : filtered.map(v => {
                const isEditing = editingRow === v.id;
                const isSaving = saving === v.id;
                const bs = (v.billing_status ?? "pending_review") as BillingStatus;
                return (
                  <tr key={v.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2">
                      {bs === "pending_invoice" ? (
                        <input type="checkbox" aria-label={`Select ${visaName(v)}`}
                          checked={selected.has(v.id)}
                          onChange={() => setSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(v.id)) next.delete(v.id); else next.add(v.id);
                            return next;
                          })} />
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">{visaName(v)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{v.yacht?.vessel_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{v.nationality ?? "—"}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{v.visa_type ?? "—"}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{v.visa_number ?? "—"}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDate(v.submitted_at ?? v.created_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${VISA_STATUS_COLOR[v.status] ?? "bg-muted/60 text-muted-foreground"}`}>
                        {(v.status ?? "—").replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2"><BillingBadge status={bs} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{isEditing ? null : (v.invoice_ref ?? "—")}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{isEditing ? null : (v.invoice_amount ? `AED ${v.invoice_amount.toLocaleString()}` : "—")}</td>
                    <td className="px-3 py-2">
                      <BillingActions
                        id={v.id} bs={bs} saving={isSaving} isEditing={isEditing}
                        editRef={editingRow === v.id ? editRef : ""}
                        editAmount={editingRow === v.id ? editAmount : ""}
                        onSetEditRef={setEditRef} onSetEditAmount={setEditAmount}
                        onStartEdit={() => { setEditingRow(v.id); setEditRef(v.invoice_ref ?? ""); setEditAmount(v.invoice_amount ? String(v.invoice_amount) : ""); }}
                        onCancelEdit={() => setEditingRow(null)}
                        onSaveInvoiced={() => updateBilling(v.id, "invoiced", editRef, editAmount ? parseFloat(editAmount) : null)}
                        onFlag={() => updateBilling(v.id, "pending_invoice")}
                        onNotBillable={() => updateBilling(v.id, "not_billable")}
                        onReset={() => updateBilling(v.id, "pending_review")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
            Showing {filtered.length} of {items.length} visa applications
          </div>
        )}
      </div>
      {showGen && selectedApps.length > 0 && (
        <GenerateInvoiceDialog
          apps={selectedApps}
          onClose={() => setShowGen(false)}
          onDone={() => { setShowGen(false); setSelected(new Set()); void load(); }}
        />
      )}
    </div>
  );
}

// ─── Unified Department Tracker ──────────────────────────────────────────────

type DeptKey = TrackerDept | "orbit" | "visas";

const DEPT_LIST: {
  key: DeptKey;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  available: boolean;
}[] = [
  { key: "crew",        label: "Crew Cab",                shortLabel: "Crew Cab",       icon: Car,         available: true  },
  { key: "packages",    label: "ShipSync",   shortLabel: "ShipSync",       icon: Package,     available: true  },
  { key: "it",          label: "Yacht IT Solutions",      shortLabel: "Yacht IT",       icon: Cpu,         available: true  },
  { key: "procurement", label: "Procurement",             shortLabel: "Procurement",    icon: ShoppingCart,available: true  },
  { key: "visas",       label: "Visas & Immigration",     shortLabel: "Visas",          icon: IdCard,      available: true  },
  { key: "orbit",       label: "Orbit (Projects)",        shortLabel: "Orbit",          icon: LayoutGrid,  available: false },
];

function DeptTracker() {
  const [dept, setDept] = useState<DeptKey>("crew");

  const current = DEPT_LIST.find(d => d.key === dept)!;

  return (
    <div className="space-y-5">

      {/* Department chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mr-1">Department</span>
        {DEPT_LIST.map(d => {
          const Icon = d.icon;
          const active = dept === d.key;
          return (
            <button
              key={d.key}
              onClick={() => d.available && setDept(d.key)}
              disabled={!d.available}
              title={!d.available ? `${d.label} billing tracker — coming soon` : d.label}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium border transition-all ${
                active
                  ? "bg-primary/15 border-primary/40 text-primary shadow-sm"
                  : d.available
                    ? "border-border/60 text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent/30"
                    : "border-border/30 text-muted-foreground/40 cursor-not-allowed opacity-50"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {d.shortLabel}
              {!d.available && <span className="text-[9px] ml-0.5 opacity-60">soon</span>}
            </button>
          );
        })}
      </div>

      {/* Active dept label */}
      <div className="flex items-center gap-2 -mt-2">
        <current.icon className="h-4 w-4 text-primary/70" />
        <span className="text-[13px] font-semibold text-foreground">{current.label}</span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {/* Content */}
      {dept === "crew"         && <InvoiceTracker />}
      {dept === "packages"     && <PackagesTracker />}
      {dept === "it"           && <YachtItTracker />}
      {dept === "procurement"  && <ProcurementTracker />}
      {dept === "visas"        && <VisaTracker />}
      {dept === "orbit"        && (
        <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
          <LayoutGrid className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium">Orbit billing tracker</p>
          <p className="text-xs text-muted-foreground mt-1">Project-level billing coming soon</p>
        </div>
      )}
    </div>
  );
}

// Keep TrackersSection as alias for backwards compatibility
function TrackersSection() { return <DeptTracker />; }

// ─── Main Page ────────────────────────────────────────────────────────────────

// ── Synced QBO documents (Invoices / Pro-Formas / Quotations) ─────────────────
type QboDoc = {
  id: string; doc_number: string | null; txn_date: string | null; due_date: string | null;
  customer_name: string | null; total_amt: number | null; balance: number | null;
  status: string | null; yacht_id: string | null; line_items: any[] | null;
  yacht?: { vessel_name: string } | null;
};
const DOC_TYPE: Record<"invoices" | "proforma" | "quotations", string> = { invoices: "invoice", proforma: "proforma", quotations: "estimate" };
const STATUS_COLOR: Record<string, string> = {
  Paid: "bg-emerald-500/15 text-emerald-400", Unpaid: "bg-amber-500/15 text-amber-400",
  Partial: "bg-blue-500/15 text-blue-400", Overdue: "bg-red-500/15 text-red-400",
  Accepted: "bg-emerald-500/15 text-emerald-400", Pending: "bg-amber-500/15 text-amber-400",
  Closed: "bg-slate-500/15 text-slate-400", Rejected: "bg-red-500/15 text-red-400",
};

function QboDocsTab({ docType }: { docType: "invoices" | "proforma" | "quotations" }) {
  const [rows, setRows] = useState<QboDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [yacht, setYacht] = useState("all");
  const [year, setYear] = useState("2026");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { void load(); }, [docType, year]);

  async function load() {
    setLoading(true);
    let qy = (supabase as any).from("qbo_invoices")
      .select("id, doc_number, txn_date, due_date, customer_name, total_amt, balance, status, yacht_id, line_items, yacht:yachts(vessel_name)")
      .eq("doc_type", DOC_TYPE[docType]).order("txn_date", { ascending: false }).limit(1000);
    if (year !== "all") qy = qy.gte("txn_date", `${year}-01-01`).lte("txn_date", `${year}-12-31`);
    const { data, error } = await qy;
    if (error) toast.error(error.message); else setRows((data ?? []) as QboDoc[]);
    setLoading(false);
  }

  const yachts = useMemo(() => Array.from(new Set(rows.map(r => r.yacht?.vessel_name).filter(Boolean))).sort() as string[], [rows]);
  const statuses = useMemo(() => Array.from(new Set(rows.map(r => r.status).filter(Boolean))).sort() as string[], [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (yacht !== "all" && r.yacht?.vessel_name !== yacht) return false;
    if (status !== "all" && r.status !== status) return false;
    if (q.trim()) {
      const s = q.toLowerCase();
      if (![r.doc_number, r.customer_name, r.yacht?.vessel_name].filter(Boolean).join(" ").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [rows, yacht, status, q]);

  const totals = useMemo(() => ({
    count: filtered.length,
    value: filtered.reduce((s, r) => s + (r.total_amt ?? 0), 0),
    outstanding: filtered.reduce((s, r) => s + (r.balance ?? 0), 0),
  }), [filtered]);

  async function viewPdf(id: string) {
    const t = await authToken();
    toast.loading("Fetching PDF…", { id: "qbpdf" });
    try {
      const r = await fetch(`/api/qb/doc-pdf?id=${id}`, { headers: { Authorization: `Bearer ${t}` } });
      const j = await r.json();
      toast.dismiss("qbpdf");
      if (j.ok && j.url) window.open(j.url, "_blank"); else toast.error(j.error ?? "No PDF");
    } catch (e: any) { toast.dismiss("qbpdf"); toast.error(String(e?.message ?? e)); }
  }

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const fmtAed = (n: number | null) => n != null ? `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
  const dueLabel = docType === "invoices" ? "Due Date" : docType === "proforma" ? "Expiry" : "Valid Until";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: "Documents", value: totals.count },
          { label: "Total Value", value: fmtAed(totals.value) },
          { label: "Outstanding", value: fmtAed(totals.outstanding) },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
            <div className="text-lg font-bold text-foreground tabular-nums">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search #, customer, vessel…" className="pl-8 h-8 text-sm" />
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {["2026", "2025", "2024"].map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={yacht} onValueChange={setYacht}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="All vessels" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vessels</SelectItem>
            {yachts.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {["#", "Customer / Vessel", "Date", dueLabel, "Amount", "Status", ""].map(c => (
                  <th key={c} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">No {docType === "quotations" ? "quotations" : docType === "proforma" ? "pro-formas" : "invoices"} match the filters.</td></tr>
              ) : filtered.map(r => (
                <>
                  <tr key={r.id} className="hover:bg-muted/10 cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">{r.doc_number ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="font-medium">{r.customer_name ?? "—"}</div>
                      {r.yacht?.vessel_name && <div className="text-[11px] text-muted-foreground">{r.yacht.vessel_name}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDate(r.txn_date)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDate(r.due_date)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap font-medium tabular-nums">{fmtAed(r.total_amt)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[r.status ?? ""] ?? "bg-muted/60 text-muted-foreground"}`}>{r.status ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={(e) => { e.stopPropagation(); viewPdf(r.id); }} title="View QuickBooks PDF"
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-primary/10 hover:text-primary">
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  {expanded === r.id && (r.line_items?.length ?? 0) > 0 && (
                    <tr className="bg-muted/20"><td colSpan={7} className="px-6 py-2">
                      <div className="space-y-0.5">
                        {r.line_items!.map((li: any, i: number) => (
                          <div key={i} className="flex justify-between text-[11px] text-muted-foreground">
                            <span>{li.item ?? li.description ?? "—"}{li.qty ? ` × ${li.qty}` : ""}</span>
                            <span className="tabular-nums">{fmtAed(li.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </td></tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">Showing {filtered.length} of {rows.length} (max 1000 / year)</div>}
      </div>
    </div>
  );
}

export function FinancePage() {
  const [tab, setTab] = useState<FinanceTab>("trackers");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/qb/sync", { headers: { Authorization: `Bearer ${await authToken()}` } });
        const j = await r.json();
        if (j.ok) setLastSync(j.state?.last_run_at ?? null);
      } catch { /* ignore */ }
    })();
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await fetch("/api/qb/sync", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await authToken()}` }, body: "{}" });
      const j = await r.json();
      if (j.ok) { toast.success(`Synced ${j.count ?? 0} document(s)`); setLastSync(new Date().toISOString()); }
      else toast.error(j.error ?? "Sync failed");
    } catch (e: any) { toast.error(String(e?.message ?? e)); } finally { setSyncing(false); }
  }

  const isQbTab = tab === "invoices" || tab === "proforma" || tab === "quotations";

  const QB_TABS: { key: "invoices" | "proforma" | "quotations"; label: string; icon: React.ComponentType<{ className?: string }>; cols: string[] }[] = [
    { key: "invoices",   label: "Invoices",   icon: FileText,  cols: ["#", "Customer / Vessel", "Date", "Due Date", "Amount", "Status"] },
    { key: "proforma",   label: "Pro-Forma",  icon: FileCheck, cols: ["#", "Customer / Vessel", "Date", "Expiry",   "Amount", "Status"] },
    { key: "quotations", label: "Quotations", icon: Quote,     cols: ["#", "Customer / Vessel", "Date", "Valid Until", "Amount", "Status"] },
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/40 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Finance</div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Finance</h1>
        </div>
        {isQbTab && (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              {lastSync ? `Synced ${new Date(lastSync).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Not synced yet"}
            </span>
            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing} className="gap-1.5">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync from QuickBooks
            </Button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {/* Unified Invoice Tracker (all departments) */}
          <button
            onClick={() => setTab("trackers")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === "trackers" || tab === "tracker" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Invoice Tracker
          </button>
          {QB_TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {(tab === "trackers" || tab === "tracker") && <DeptTracker />}
        {tab === "invoices" && <QboDocsTab docType="invoices" />}
        {tab === "proforma" && <QboDocsTab docType="proforma" />}
        {tab === "quotations" && <QboDocsTab docType="quotations" />}
      </div>
    </div>
  );
}
