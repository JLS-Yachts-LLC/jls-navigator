import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-BhSB73Oa.js";
import { B as Button } from "./button-DOuRXxl4.js";
import { I as Input } from "./input-tSns-MFM.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./select-tXTXPZMs.js";
import { t as toast, s as supabase } from "./router-DtI2KWt0.js";
import { L as LoaderCircle } from "./loader-circle-w1KYOQxo.js";
import { R as RefreshCw } from "./refresh-cw-rFV6Acfq.js";
import { D as DollarSign } from "./dollar-sign-DIJT0ICI.js";
import { C as CircleCheck } from "./circle-check-7tBlyRXp.js";
import { C as CircleX, R as RotateCcw } from "./rotate-ccw-CP1jVpJD.js";
import { E as ExternalLink } from "./external-link-BUmczbTn.js";
import { c as createLucideIcon } from "./createLucideIcon-DhyYiX_6.js";
import { S as Search } from "./search-Bc0LlnDZ.js";
import { T as TriangleAlert } from "./triangle-alert-VZ0QUpdk.js";
import { C as Check } from "./index-Br3F6A4M.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./utils-Bz4m9VPB.js";
import "./Combination-B8MApAKg.js";
import "./chevron-down-HwTvS_C7.js";
const __iconNode$3 = [
  ["rect", { width: "8", height: "4", x: "8", y: "2", rx: "1", ry: "1", key: "tgr4d6" }],
  [
    "path",
    {
      d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
      key: "116196"
    }
  ],
  ["path", { d: "M12 11h4", key: "1jrz19" }],
  ["path", { d: "M12 16h4", key: "n85exb" }],
  ["path", { d: "M8 11h.01", key: "1dfujw" }],
  ["path", { d: "M8 16h.01", key: "18s6g9" }]
];
const ClipboardList = createLucideIcon("clipboard-list", __iconNode$3);
const __iconNode$2 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "m9 15 2 2 4-4", key: "1grp1n" }]
];
const FileCheck = createLucideIcon("file-check", __iconNode$2);
const __iconNode$1 = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M10 9H8", key: "b1mrlr" }],
  ["path", { d: "M16 13H8", key: "t4e002" }],
  ["path", { d: "M16 17H8", key: "z1uh3a" }]
];
const FileText = createLucideIcon("file-text", __iconNode$1);
const __iconNode = [
  [
    "path",
    {
      d: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
      key: "rib7q0"
    }
  ],
  [
    "path",
    {
      d: "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
      key: "1ymkrd"
    }
  ]
];
const Quote = createLucideIcon("quote", __iconNode);
const BILLING_LABEL = {
  pending_review: "Pending Review",
  pending_invoice: "Needs Invoice",
  invoiced: "Invoiced",
  not_billable: "Not Billable"
};
const BILLING_COLOR = {
  pending_review: "bg-muted/60 text-muted-foreground border-border",
  pending_invoice: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  invoiced: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  not_billable: "bg-slate-500/15 text-slate-400 border-slate-500/20"
};
const TRIP_TYPE_LABEL = {
  arrival_transport: "Arrival Transport",
  departure_transport: "Departure Transport",
  crew_pickup: "Crew Pickup",
  inhouse: "In-House",
  airport_transfer: "Airport Transfer",
  delivery_collection: "Delivery & Collection",
  seaport_crew_change: "Seaport Crew Change",
  shorebased: "Shorebased"
};
function InvoiceTracker() {
  const [trips, setTrips] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [saving, setSaving] = reactExports.useState(null);
  const [q, setQ] = reactExports.useState("");
  const [filterYacht, setFilterYacht] = reactExports.useState("all");
  const [filterBilling, setFilterBilling] = reactExports.useState("all");
  const [filterType, setFilterType] = reactExports.useState("all");
  const [editingRow, setEditingRow] = reactExports.useState(null);
  const [editInvoiceRef, setEditInvoiceRef] = reactExports.useState("");
  const [editAmount, setEditAmount] = reactExports.useState("");
  reactExports.useEffect(() => {
    void load();
  }, []);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("crew_trips").select("id, trip_type, pickup_datetime, passenger_name, pickup_address, dropoff_address, notes, status, billing_status, invoice_ref, invoice_amount, driver:crew_drivers(full_name), yacht:yachts(vessel_name)").order("pickup_datetime", { ascending: false }).limit(500);
    if (error) toast.error(error.message);
    else setTrips(data ?? []);
    setLoading(false);
  }
  const yachts = reactExports.useMemo(() => {
    const names = /* @__PURE__ */ new Set();
    trips.forEach((t) => {
      if (t.yacht?.vessel_name) names.add(t.yacht.vessel_name);
    });
    return Array.from(names).sort();
  }, [trips]);
  const filtered = reactExports.useMemo(() => trips.filter((t) => {
    if (filterYacht !== "all" && t.yacht?.vessel_name !== filterYacht) return false;
    if (filterBilling !== "all" && t.billing_status !== filterBilling) return false;
    if (filterType !== "all" && t.trip_type !== filterType) return false;
    if (q.trim()) {
      const qq = q.toLowerCase();
      const hay = [
        t.passenger_name,
        t.pickup_address,
        t.dropoff_address,
        t.yacht?.vessel_name,
        t.driver?.full_name,
        t.invoice_ref,
        t.notes
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  }), [trips, filterYacht, filterBilling, filterType, q]);
  const stats = reactExports.useMemo(() => ({
    total: trips.length,
    needs_invoice: trips.filter((t) => t.billing_status === "pending_invoice").length,
    invoiced: trips.filter((t) => t.billing_status === "invoiced").length,
    pending_review: trips.filter((t) => t.billing_status === "pending_review").length,
    total_invoiced: trips.filter((t) => t.billing_status === "invoiced" && t.invoice_amount).reduce((s, t) => s + (t.invoice_amount ?? 0), 0)
  }), [trips]);
  async function updateBilling(id, billing_status, invoice_ref, invoice_amount) {
    setSaving(id);
    const patch = { billing_status };
    if (invoice_ref !== void 0) patch.invoice_ref = invoice_ref || null;
    if (invoice_amount !== void 0) patch.invoice_amount = invoice_amount;
    const { error } = await supabase.from("crew_trips").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      setSaving(null);
      return;
    }
    setTrips((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));
    setEditingRow(null);
    setSaving(null);
    toast.success("Updated");
  }
  function startEdit(trip) {
    setEditingRow(trip.id);
    setEditInvoiceRef(trip.invoice_ref ?? "");
    setEditAmount(trip.invoice_amount ? String(trip.invoice_amount) : "");
  }
  function fmtDate(dt) {
    if (!dt) return "—";
    return new Date(dt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtAed(n) {
    if (!n) return "—";
    return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 md:grid-cols-5 gap-3", children: [
      { label: "Total Trips", value: stats.total, color: "text-foreground" },
      { label: "Pending Review", value: stats.pending_review, color: "text-muted-foreground" },
      { label: "Needs Invoice", value: stats.needs_invoice, color: "text-amber-400" },
      { label: "Invoiced", value: stats.invoiced, color: "text-emerald-400" },
      { label: "Total Invoiced", value: `AED ${stats.total_invoiced.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, color: "text-primary" }
    ].map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border bg-card/60 px-3 py-2.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `text-lg font-bold ${s.color}`, children: s.value }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: s.label })
    ] }, s.label)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex-1 min-w-48", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search trips…", className: "pl-8 h-8 text-sm" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: filterYacht, onValueChange: setFilterYacht, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 text-xs w-40", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "All yachts" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "all", children: "All Yachts" }),
          yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y, children: y }, y))
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: filterBilling, onValueChange: setFilterBilling, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 text-xs w-40", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "All statuses" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "all", children: "All Billing" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "pending_review", children: "Pending Review" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "pending_invoice", children: "Needs Invoice" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "invoiced", children: "Invoiced" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "not_billable", children: "Not Billable" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: filterType, onValueChange: setFilterType, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 text-xs w-44", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "All types" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "all", children: "All Types" }),
          Object.entries(TRIP_TYPE_LABEL).map(([v, l]) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: v, children: l }, v))
        ] })
      ] }),
      (q || filterYacht !== "all" || filterBilling !== "all" || filterType !== "all") && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "ghost", className: "h-8 text-xs gap-1", onClick: () => {
        setQ("");
        setFilterYacht("all");
        setFilterBilling("all");
        setFilterType("all");
      }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { className: "h-3 w-3" }),
        " Clear"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", className: "h-8 text-xs gap-1.5 ml-auto", onClick: load, disabled: loading, children: [
        loading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3 w-3 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "h-3 w-3" }),
        "Refresh"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm min-w-[900px]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: "bg-muted/40 border-b border-border", children: ["Date", "Type", "Yacht", "Driver", "Pickup → Dropoff", "Notes", "Billing Status", "Invoice Ref", "Amount (AED)", "Actions"].map((col) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap", children: col }, col)) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-border/50", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 10, className: "px-3 py-10 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin mx-auto text-muted-foreground" }) }) }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 10, className: "px-3 py-10 text-center text-sm text-muted-foreground", children: "No trips match the current filters." }) }) : filtered.map((trip) => {
          const isEditing = editingRow === trip.id;
          const isSaving = saving === trip.id;
          const bs = trip.billing_status ?? "pending_review";
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/10 transition-colors", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-xs whitespace-nowrap text-muted-foreground", children: fmtDate(trip.pickup_datetime) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-xs whitespace-nowrap", children: TRIP_TYPE_LABEL[trip.trip_type] ?? trip.trip_type }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-xs font-medium whitespace-nowrap", children: trip.yacht?.vessel_name ?? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: "—" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-xs whitespace-nowrap text-muted-foreground", children: trip.driver?.full_name ?? "—" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-xs max-w-[200px]", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-muted-foreground", children: [trip.pickup_address, trip.dropoff_address].filter(Boolean).join(" → ") || "—" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-xs max-w-[150px]", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-muted-foreground", children: trip.notes ?? "—" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${BILLING_COLOR[bs]}`, children: BILLING_LABEL[bs] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-xs", children: isEditing ? /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                autoFocus: true,
                value: editInvoiceRef,
                onChange: (e) => setEditInvoiceRef(e.target.value),
                placeholder: "INV-001",
                className: "h-6 w-24 rounded border border-border bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              }
            ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: trip.invoice_ref ?? "—" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-xs", children: isEditing ? /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                value: editAmount,
                onChange: (e) => setEditAmount(e.target.value),
                placeholder: "0.00",
                type: "number",
                step: "0.01",
                className: "h-6 w-20 rounded border border-border bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              }
            ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: fmtAed(trip.invoice_amount) }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: isEditing ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => updateBilling(trip.id, "invoiced", editInvoiceRef, editAmount ? parseFloat(editAmount) : null),
                  disabled: isSaving,
                  className: "rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-1.5 py-0.5 text-[10px] font-medium",
                  children: isSaving ? "…" : "Save"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setEditingRow(null), className: "rounded bg-muted/60 text-muted-foreground hover:bg-muted px-1.5 py-0.5 text-[10px]", children: "Cancel" })
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-0.5", children: [
              bs === "pending_review" && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => updateBilling(trip.id, "pending_invoice"),
                  disabled: isSaving,
                  title: "Mark as Needs Invoice",
                  className: "rounded p-1 text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-3.5 w-3.5" })
                }
              ),
              bs !== "invoiced" && bs !== "not_billable" && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => startEdit(trip),
                  disabled: isSaving,
                  title: "Mark as Invoiced",
                  className: "rounded p-1 text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/10 transition",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "h-3.5 w-3.5" })
                }
              ),
              bs !== "not_billable" && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => updateBilling(trip.id, "not_billable"),
                  disabled: isSaving,
                  title: "Mark as Not Billable",
                  className: "rounded p-1 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/40 transition",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "h-3.5 w-3.5" })
                }
              ),
              bs !== "pending_review" && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => updateBilling(trip.id, "pending_review"),
                  disabled: isSaving,
                  title: "Reset to Pending Review",
                  className: "rounded p-1 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/40 transition",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { className: "h-3 w-3" })
                }
              )
            ] }) })
          ] }, trip.id);
        }) })
      ] }) }),
      filtered.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground", children: [
        "Showing ",
        filtered.length,
        " of ",
        trips.length,
        " trips"
      ] })
    ] })
  ] });
}
function FinancePage() {
  const [tab, setTab] = reactExports.useState("tracker");
  const [connected] = reactExports.useState(false);
  const [syncing, setSyncing] = reactExports.useState(false);
  async function handleSync() {
    if (!connected) {
      toast.error("Connect QuickBooks first");
      return;
    }
    setSyncing(true);
    await new Promise((r) => setTimeout(r, 1e3));
    setSyncing(false);
    toast.success("Sync complete");
  }
  const QB_TABS = [
    { key: "invoices", label: "Invoices", icon: FileText, cols: ["#", "Customer / Vessel", "Date", "Due Date", "Amount", "Status"] },
    { key: "proforma", label: "Pro-Forma", icon: FileCheck, cols: ["#", "Customer / Vessel", "Date", "Expiry", "Amount", "Status"] },
    { key: "quotations", label: "Quotations", icon: Quote, cols: ["#", "Customer / Vessel", "Date", "Valid Until", "Amount", "Status"] }
  ];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "border-b border-border bg-card/40 px-6 py-3 flex items-center justify-between flex-wrap gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "Finance" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-xl font-semibold tracking-tight", children: "Finance" })
      ] }),
      tab !== "tracker" && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "outline", onClick: handleSync, disabled: syncing, className: "gap-1.5", children: [
        syncing ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "h-3.5 w-3.5" }),
        "Sync from QuickBooks"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6 space-y-5", children: [
      tab !== "tracker" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border bg-card/60 p-4 flex items-center justify-between flex-wrap gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-lg bg-[#2CA01C]/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { className: "h-5 w-5 text-[#2CA01C]" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold", children: "QuickBooks Online" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1.5 mt-0.5", children: connected ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-3.5 w-3.5 text-emerald-400" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-emerald-400", children: "Connected" })
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "h-3.5 w-3.5 text-muted-foreground" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "Not connected" })
            ] }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          connected && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", variant: "ghost", className: "gap-1.5 h-7 text-xs", onClick: () => toast.info("Opening QuickBooks…"), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "h-3.5 w-3.5" }),
            " Open QuickBooks"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Button,
            {
              size: "sm",
              variant: connected ? "outline" : "default",
              className: "h-7 text-xs",
              onClick: () => toast.info("QuickBooks OAuth integration — coming soon"),
              children: connected ? "Reconnect" : "Connect QuickBooks"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 border-b border-border", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => setTab("tracker"),
            className: `flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === "tracker" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ClipboardList, { className: "h-3.5 w-3.5" }),
              "Invoice Tracker"
            ]
          }
        ),
        QB_TABS.map((t) => {
          const Icon = t.icon;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setTab(t.key),
              className: `flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "h-3.5 w-3.5" }),
                t.label
              ]
            },
            t.key
          );
        })
      ] }),
      tab === "tracker" ? /* @__PURE__ */ jsxRuntimeExports.jsx(InvoiceTracker, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-border overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: "bg-muted/40 border-b border-border", children: QB_TABS.find((t) => t.key === tab).cols.map((col) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", children: col }, col)) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: QB_TABS.find((t) => t.key === tab).cols.length, className: "px-3 py-12 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-2 text-muted-foreground", children: [
          (() => {
            const Icon = QB_TABS.find((t) => t.key === tab).icon;
            return /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "h-8 w-8 opacity-30" });
          })(),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm", children: [
            "No ",
            QB_TABS.find((t) => t.key === tab).label.toLowerCase(),
            " yet."
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs opacity-70", children: "Connect QuickBooks and sync to import records." })
        ] }) }) }) })
      ] }) })
    ] })
  ] });
}
const SplitComponent = FinancePage;
export {
  SplitComponent as component
};
