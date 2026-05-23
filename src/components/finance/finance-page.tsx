import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, RefreshCw, CheckCircle2, XCircle, FileText, FileCheck,
  Quote, Loader2, ExternalLink, ClipboardList, Search, Check, AlertTriangle,
  RotateCcw, LayoutGrid, Package, Cpu, ShoppingCart, Car,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
        </Button>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {["Date", "Type", "Yacht", "Driver", "Pickup → Dropoff", "Notes", "Billing Status", "Invoice Ref", "Amount (AED)", "Actions"].map(col => (
                  <th key={col} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr><td colSpan={10} className="px-3 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">No trips match the current filters.</td></tr>
              ) : filtered.map(trip => {
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
                        editRef={editingRow === trip.id ? editInvoiceRef : ""}
                        editAmount={editingRow === trip.id ? editAmount : ""}
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
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto" onClick={load} disabled={loading}>
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
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto" onClick={load} disabled={loading}>
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
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto" onClick={load} disabled={loading}>
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

// ─── Trackers Section (all departments) ──────────────────────────────────────

const DEPT_TABS: { key: TrackerDept; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "crew",        label: "Crew Cab",           icon: Car },
  { key: "packages",   label: "Packages",            icon: Package },
  { key: "it",         label: "Yacht IT Solutions",  icon: Cpu },
  { key: "procurement",label: "Procurement",         icon: ShoppingCart },
];

function TrackersSection() {
  const [dept, setDept] = useState<TrackerDept>("crew");

  return (
    <div className="space-y-4">
      {/* Department sub-tabs */}
      <div className="flex items-center gap-1 border-b border-border/60">
        {DEPT_TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setDept(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition ${
                dept === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Department content */}
      {dept === "crew"         && <InvoiceTracker />}
      {dept === "packages"     && <PackagesTracker />}
      {dept === "it"           && <YachtItTracker />}
      {dept === "procurement"  && <ProcurementTracker />}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function FinancePage() {
  const [tab, setTab] = useState<FinanceTab>("trackers");
  const [connected] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    if (!connected) { toast.error("Connect QuickBooks first"); return; }
    setSyncing(true);
    await new Promise(r => setTimeout(r, 1000));
    setSyncing(false);
    toast.success("Sync complete");
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
          <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing} className="gap-1.5">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync from QuickBooks
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* QuickBooks connection card — only for QB tabs */}
        {isQbTab && (
          <div className="rounded-lg border border-border bg-card/60 p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2CA01C]/10">
                <DollarSign className="h-5 w-5 text-[#2CA01C]" />
              </div>
              <div>
                <p className="text-sm font-semibold">QuickBooks Online</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {connected
                    ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /><span className="text-xs text-emerald-400">Connected</span></>
                    : <><XCircle className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Not connected</span></>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {connected && (
                <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs" onClick={() => toast.info("Opening QuickBooks…")}>
                  <ExternalLink className="h-3.5 w-3.5" /> Open QuickBooks
                </Button>
              )}
              <Button size="sm" variant={connected ? "outline" : "default"} className="h-7 text-xs"
                onClick={() => toast.info("QuickBooks OAuth integration — coming soon")}>
                {connected ? "Reconnect" : "Connect QuickBooks"}
              </Button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {/* Trackers */}
          <button
            onClick={() => setTab("trackers")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === "trackers" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Trackers
          </button>
          {/* Invoice Tracker (legacy crew-only view) */}
          <button
            onClick={() => setTab("tracker")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === "tracker" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
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
        {tab === "trackers" && <TrackersSection />}
        {tab === "tracker"  && <InvoiceTracker />}
        {isQbTab && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {QB_TABS.find(t => t.key === tab)!.cols.map(col => (
                    <th key={col} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={QB_TABS.find(t => t.key === tab)!.cols.length} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      {(() => { const Icon = QB_TABS.find(t => t.key === tab)!.icon; return <Icon className="h-8 w-8 opacity-30" />; })()}
                      <p className="text-sm">No {QB_TABS.find(t => t.key === tab)!.label.toLowerCase()} yet.</p>
                      <p className="text-xs opacity-70">Connect QuickBooks and sync to import records.</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
