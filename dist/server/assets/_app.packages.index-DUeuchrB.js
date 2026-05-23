import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-BhSB73Oa.js";
import { u as useAuth, s as supabase, t as toast } from "./router-DtI2KWt0.js";
import { B as Button } from "./button-DOuRXxl4.js";
import { I as Input } from "./input-tSns-MFM.js";
import { L as Label } from "./label-Ds3qDWN_.js";
import { T as Textarea } from "./textarea-DR2LoV9d.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./select-tXTXPZMs.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-Ccda9G2L.js";
import { A as AlertDialog, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-C7GSg9K8.js";
import { P as Package } from "./package-DG1tfq5s.js";
import { S as Search } from "./search-Bc0LlnDZ.js";
import { P as Plus } from "./plus-CfTJ2ZaO.js";
import { T as Truck } from "./truck-CPriy9OO.js";
import { C as CircleCheck } from "./circle-check-7tBlyRXp.js";
import { T as TriangleAlert } from "./triangle-alert-VZ0QUpdk.js";
import { L as LoaderCircle } from "./loader-circle-w1KYOQxo.js";
import { P as Pencil } from "./index-C-33PlkV.js";
import { T as Trash2 } from "./index-DBkBZibR.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./utils-Bz4m9VPB.js";
import "./Combination-B8MApAKg.js";
import "./index-Br3F6A4M.js";
import "./createLucideIcon-DhyYiX_6.js";
import "./chevron-down-HwTvS_C7.js";
import "./x-DFtrhGVJ.js";
const STATUSES = [
  { value: "received", label: "Received", color: "bg-blue-500/15 text-blue-400" },
  { value: "in_transit", label: "In Transit", color: "bg-amber-500/15 text-amber-400" },
  { value: "out_for_delivery", label: "Out for Delivery", color: "bg-orange-500/15 text-orange-400" },
  { value: "delivered", label: "Delivered", color: "bg-emerald-500/15 text-emerald-400" },
  { value: "returned", label: "Returned", color: "bg-muted text-muted-foreground" },
  { value: "lost", label: "Lost", color: "bg-destructive/15 text-destructive" }
];
const CARRIERS = ["DHL", "FedEx", "UPS", "Aramex", "Emirates Post", "DHL Express", "TNT", "Other"];
const EMPTY = {
  yacht_id: "__none",
  tracking_number: "",
  carrier: "",
  description: "",
  sender_name: "",
  recipient_name: "",
  received_date: "",
  delivered_date: "",
  status: "received",
  notes: ""
};
function StatusBadge({ status }) {
  const s = STATUSES.find((x) => x.value === status);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2.5 py-0.5 text-xs font-medium ${s?.color ?? "bg-muted text-muted-foreground"}`, children: s?.label ?? status });
}
const SETUP_SQL = `-- Run this in Supabase SQL Editor if packages table doesn't exist:
create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid references yachts(id) on delete set null,
  tracking_number text,
  carrier text,
  description text,
  sender_name text,
  recipient_name text,
  received_date date,
  delivered_date date,
  status text not null default 'received',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table packages enable row level security;
create policy "auth users can manage packages" on packages
  for all to authenticated using (true) with check (true);
create trigger set_packages_updated_at before update on packages
  for each row execute function set_updated_at();`;
function PackagesPage() {
  const { user } = useAuth();
  const [packages, setPackages] = reactExports.useState([]);
  const [yachts, setYachts] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [tableError, setTableError] = reactExports.useState(false);
  const [q, setQ] = reactExports.useState("");
  const [statusFilter, setStatusFilter] = reactExports.useState("all");
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState(EMPTY);
  const [busy, setBusy] = reactExports.useState(false);
  const [deleteTarget, setDeleteTarget] = reactExports.useState(null);
  const [sqlVisible, setSqlVisible] = reactExports.useState(false);
  reactExports.useEffect(() => {
    void load();
    void loadYachts();
  }, []);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("packages").select("*").order("created_at", { ascending: false });
    if (error) {
      if (String(error.message).includes("does not exist") || String(error.code) === "42P01") {
        setTableError(true);
      } else {
        toast.error(error.message);
      }
    } else {
      setPackages(data);
      setTableError(false);
    }
    setLoading(false);
  }
  async function loadYachts() {
    const { data } = await supabase.from("yachts").select("id, vessel_name").order("vessel_name");
    setYachts(data ?? []);
  }
  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }
  function openEdit(p) {
    setEditing(p);
    setForm({
      yacht_id: p.yacht_id ?? "__none",
      tracking_number: p.tracking_number ?? "",
      carrier: p.carrier ?? "",
      description: p.description ?? "",
      sender_name: p.sender_name ?? "",
      recipient_name: p.recipient_name ?? "",
      received_date: p.received_date ?? "",
      delivered_date: p.delivered_date ?? "",
      status: p.status,
      notes: p.notes ?? ""
    });
    setOpen(true);
  }
  async function handleSave() {
    setBusy(true);
    try {
      const payload = {
        yacht_id: form.yacht_id === "__none" ? null : form.yacht_id,
        tracking_number: form.tracking_number || null,
        carrier: form.carrier || null,
        description: form.description || null,
        sender_name: form.sender_name || null,
        recipient_name: form.recipient_name || null,
        received_date: form.received_date || null,
        delivered_date: form.delivered_date || null,
        status: form.status,
        notes: form.notes || null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (editing) {
        const { error } = await supabase.from("packages").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Package updated");
      } else {
        const { error } = await supabase.from("packages").insert([{ ...payload, created_by: user?.id }]);
        if (error) throw error;
        toast.success("Package logged");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("packages").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Package removed");
      await load();
    }
    setDeleteTarget(null);
  }
  const yachtName = (id) => yachts.find((y) => y.id === id)?.vessel_name ?? "—";
  const stats = reactExports.useMemo(() => ({
    total: packages.length,
    inTransit: packages.filter((p) => ["received", "in_transit", "out_for_delivery"].includes(p.status)).length,
    delivered: packages.filter((p) => p.status === "delivered").length,
    issues: packages.filter((p) => ["returned", "lost"].includes(p.status)).length
  }), [packages]);
  const filtered = reactExports.useMemo(() => {
    let rows = packages;
    if (statusFilter !== "all") rows = rows.filter((p) => p.status === statusFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      rows = rows.filter(
        (p) => [
          p.tracking_number,
          p.carrier,
          p.sender_name,
          p.recipient_name,
          p.description,
          p.yacht_id ? yachtName(p.yacht_id) : ""
        ].some((v) => String(v ?? "").toLowerCase().includes(s))
      );
    }
    return rows;
  }, [packages, statusFilter, q]);
  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  if (tableError) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-5 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "Port & Operations / Packages" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-base font-semibold tracking-tight", children: "Packages & Deliveries" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Package, { className: "h-12 w-12 text-muted-foreground/40" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "font-display text-lg font-semibold", children: "Database table not set up yet" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "max-w-sm text-sm text-muted-foreground", children: [
          "The ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "rounded bg-muted px-1 py-0.5 font-mono text-xs", children: "packages" }),
          " table doesn't exist in your Supabase database. Run the SQL below in the",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Supabase SQL Editor" }),
          " to enable this module."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", size: "sm", onClick: () => setSqlVisible((v) => !v), children: sqlVisible ? "Hide SQL" : "Show SQL to run" }),
        sqlVisible && /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "w-full max-w-2xl overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-left text-xs text-muted-foreground", children: SETUP_SQL }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { onClick: load, variant: "default", size: "sm", children: "Retry" })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-5 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "Port & Operations / Packages" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-base font-semibold tracking-tight", children: "Packages & Deliveries" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              value: q,
              onChange: (e) => setQ(e.target.value),
              placeholder: "Search packages…",
              className: "h-8 w-56 pl-8"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: statusFilter, onValueChange: setStatusFilter, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 w-44 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "All statuses" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "all", children: "All Statuses" }),
            STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.value, children: s.label }, s.value))
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", className: "h-8 gap-1.5 text-xs", onClick: openNew, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3.5 w-3.5" }),
          " Log Package"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-3 px-5 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(StatCard, { label: "Total", value: stats.total, icon: Package, accent: "text-primary" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(StatCard, { label: "Active", value: stats.inTransit, icon: Truck, accent: "text-blue-400" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(StatCard, { label: "Delivered", value: stats.delivered, icon: CircleCheck, accent: "text-success" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(StatCard, { label: "Issues", value: stats.issues, icon: TriangleAlert, accent: "text-destructive" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto px-5 pb-5", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Package, { className: "h-10 w-10 text-muted-foreground/60" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-3 font-display text-lg font-semibold", children: q || statusFilter !== "all" ? "No matching packages" : "No packages logged yet" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: q || statusFilter !== "all" ? "Try adjusting your search or filter." : "Log your first package to get started." }),
      !q && statusFilter === "all" && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, className: "mt-4 gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
        " Log Package"
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto rounded-lg border border-border bg-card", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "min-w-full text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-card/95 backdrop-blur border-b border-border", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "text-[11px] uppercase tracking-wider text-muted-foreground", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Tracking #" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Carrier" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Yacht" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Sender" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Recipient" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Received" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Delivered" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-right font-medium", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: filtered.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border/50 transition hover:bg-accent/30", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 font-mono font-medium", children: p.tracking_number ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground", children: p.carrier ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: yachtName(p.yacht_id) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground", children: p.sender_name ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: p.recipient_name ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 tabular-nums text-muted-foreground", children: p.received_date ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 tabular-nums text-muted-foreground", children: p.delivered_date ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: p.status }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-right", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "inline-flex gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", className: "h-7 w-7 p-0", onClick: () => openEdit(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Button,
            {
              variant: "ghost",
              size: "sm",
              className: "h-7 w-7 p-0 text-destructive/70 hover:text-destructive",
              onClick: () => setDeleteTarget(p),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" })
            }
          )
        ] }) })
      ] }, p.id)) })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-2xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: editing ? "Edit Package" : "Log Package" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Tracking Number" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.tracking_number, onChange: setF("tracking_number"), placeholder: "1Z999AA10123456784", className: "font-mono" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Carrier" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.carrier, onValueChange: (v) => setForm((f) => ({ ...f, carrier: v })), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select carrier" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: CARRIERS.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: c, children: c }, c)) })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Yacht" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.yacht_id, onValueChange: (v) => setForm((f) => ({ ...f, yacht_id: v })), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select yacht" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
              yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.status, onValueChange: (v) => setForm((f) => ({ ...f, status: v })), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.value, children: s.label }, s.value)) })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Sender Name" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.sender_name, onChange: setF("sender_name"), placeholder: "Company or person" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Recipient Name" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.recipient_name, onChange: setF("recipient_name"), placeholder: "Who it's for" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Date Received" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: form.received_date, onChange: setF("received_date") })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Date Delivered" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: form.delivered_date, onChange: setF("delivered_date") })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Description" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.description, onChange: setF("description"), placeholder: "What's in the package?" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Notes" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Textarea, { rows: 2, value: form.notes, onChange: setF("notes"), placeholder: "Any additional notes…" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 flex justify-end gap-2 border-t border-border pt-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setOpen(false), disabled: busy, children: "Cancel" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSave, disabled: busy, className: "gap-1.5", children: [
            busy && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
            editing ? "Save Changes" : "Log Package"
          ] })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: !!deleteTarget, onOpenChange: (o) => !o && setDeleteTarget(null), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: "Delete package?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogDescription, { children: [
          "Tracking ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: deleteTarget?.tracking_number ?? "record" }),
          " will be permanently removed."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogCancel, { children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          AlertDialogAction,
          {
            onClick: confirmDelete,
            className: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            children: "Delete"
          }
        )
      ] })
    ] }) })
  ] });
}
function StatCard({
  label,
  value,
  icon: Icon,
  accent
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] uppercase tracking-wider text-muted-foreground", children: label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `font-display text-2xl font-bold tabular-nums ${accent}`, children: value })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: `h-7 w-7 ${accent} opacity-60` })
  ] });
}
const SplitComponent = PackagesPage;
export {
  SplitComponent as component
};
