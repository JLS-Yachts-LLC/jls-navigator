import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-D7ynLlqD.js";
import { s as supabase, t as toast, L as Link } from "./router-DOVXXrXT.js";
import { B as Button } from "./button-9fOcQ-L3.js";
import { I as Input } from "./input-eaXjLIH7.js";
import { S as StatusPill } from "./status-pill-D94Ns90E.js";
import { Y as YACHT_COLUMNS, D as DEFAULT_VISIBLE_COLUMNS } from "./yacht-fields-BxFZKucR.js";
import { D as DropdownMenu, a as DropdownMenuTrigger, S as SlidersHorizontal, b as DropdownMenuContent, d as DropdownMenuLabel, e as DropdownMenuSeparator, h as DropdownMenuCheckboxItem } from "./dropdown-menu-BfQpzdqJ.js";
import { A as Anchor } from "./anchor-_uQM2Zg8.js";
import { S as Search } from "./search-jx6tuJRa.js";
import { c as createLucideIcon } from "./createLucideIcon-DK6ljyX0.js";
import { L as LayoutGrid } from "./layout-grid-Dk5v-hNl.js";
import { e as Plus, C as ChevronUp } from "./Combination-Bn5qB9iH.js";
import { S as Ship } from "./ship-BzL4VlfS.js";
import { M as MapPin } from "./map-pin-BjkyEfOR.js";
import { L as LogOut } from "./log-out-CPI4wifK.js";
import { P as Pencil } from "./pencil-Du1FrOwP.js";
import { C as ChevronDown } from "./chevron-down-G_oG5OlX.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./utils-Bz4m9VPB.js";
import "./index-DLh2Sz4e.js";
import "./circle-mZtg4CaV.js";
import "./chevron-right-Jyswiac2.js";
const __iconNode$2 = [
  ["path", { d: "m7 15 5 5 5-5", key: "1hf1tw" }],
  ["path", { d: "m7 9 5-5 5 5", key: "sgt6xg" }]
];
const ChevronsUpDown = createLucideIcon("chevrons-up-down", __iconNode$2);
const __iconNode$1 = [
  ["path", { d: "M3 5h.01", key: "18ugdj" }],
  ["path", { d: "M3 12h.01", key: "nlz23k" }],
  ["path", { d: "M3 19h.01", key: "noohij" }],
  ["path", { d: "M8 5h13", key: "1pao27" }],
  ["path", { d: "M8 12h13", key: "1za7za" }],
  ["path", { d: "M8 19h13", key: "m83p4d" }]
];
const List = createLucideIcon("list", __iconNode$1);
const __iconNode = [
  ["path", { d: "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "14sxne" }],
  ["path", { d: "M3 3v5h5", key: "1xhq8a" }],
  ["path", { d: "M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16", key: "1hlbsb" }],
  ["path", { d: "M16 16h5v5", key: "ccwih5" }]
];
const RefreshCcw = createLucideIcon("refresh-ccw", __iconNode);
const LS_VISIBLE_KEY = "jls-yachts-visible-columns";
function loadVisibleCols() {
  try {
    const raw = localStorage.getItem(LS_VISIBLE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const valid = YACHT_COLUMNS.map((c) => c.key);
      const filtered = parsed.filter((k) => valid.includes(k));
      if (filtered.length > 0) return filtered;
    }
  } catch {
  }
  return DEFAULT_VISIBLE_COLUMNS;
}
function YachtsPage() {
  const [view, setView] = reactExports.useState("list");
  const [yachts, setYachts] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [q, setQ] = reactExports.useState("");
  const [statusFilter, setStatusFilter] = reactExports.useState("all");
  const [visible, setVisible] = reactExports.useState(loadVisibleCols);
  const [sortKey, setSortKey] = reactExports.useState(null);
  const [sortDir, setSortDir] = reactExports.useState("asc");
  const [quickEditId, setQuickEditId] = reactExports.useState(null);
  reactExports.useEffect(() => {
    void load();
  }, []);
  reactExports.useEffect(() => {
    localStorage.setItem(LS_VISIBLE_KEY, JSON.stringify(visible));
  }, [visible]);
  async function updateStatus(id, status) {
    const {
      error
    } = await supabase.from("yachts").update({
      status
    }).eq("id", id);
    if (error) toast.error(error.message);
    else setYachts((prev) => prev.map((y) => y.id === id ? {
      ...y,
      status
    } : y));
    setQuickEditId(null);
  }
  async function load() {
    setLoading(true);
    const {
      data,
      error
    } = await supabase.from("yachts").select("*").order("created_at", {
      ascending: false
    });
    if (error) toast.error(error.message);
    else setYachts(data ?? []);
    setLoading(false);
  }
  const stats = reactExports.useMemo(() => {
    const total = yachts.length;
    const inCountry = yachts.filter((y) => String(y.status ?? "").toLowerCase() === "in country").length;
    const departed = yachts.filter((y) => String(y.status ?? "").toLowerCase() === "departed").length;
    const changeAgency = yachts.filter((y) => String(y.status ?? "").toLowerCase() === "change agency").length;
    return {
      total,
      inCountry,
      departed,
      changeAgency
    };
  }, [yachts]);
  const STATUS_TARGETS = {
    in_country: "in country",
    departed: "departed",
    change_agency: "change agency"
  };
  const filtered = reactExports.useMemo(() => {
    let rows = yachts;
    if (statusFilter !== "all") {
      const target = STATUS_TARGETS[statusFilter];
      rows = rows.filter((y) => String(y.status ?? "").toLowerCase() === target);
    }
    if (q.trim()) {
      const s = q.toLowerCase();
      rows = rows.filter((y) => Object.values(y).some((v) => String(v ?? "").toLowerCase().includes(s)));
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = String(a[sortKey] ?? "").toLowerCase();
        const bv = String(b[sortKey] ?? "").toLowerCase();
        const cmp = av.localeCompare(bv, void 0, {
          numeric: true
        });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [yachts, q, statusFilter, sortKey, sortDir]);
  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }
  function toggleStatFilter(filter) {
    setStatusFilter((prev) => prev === filter ? "all" : filter);
  }
  function toggleVisible(key, checked) {
    setVisible((prev) => checked ? [...prev, key] : prev.filter((k) => k !== key));
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-5 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-xs text-muted-foreground", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Anchor, { className: "h-3.5 w-3.5" }),
          " Port & Operations",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "opacity-40", children: "/" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-foreground", children: "Yachts" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-base font-semibold tracking-tight", children: "Yacht Registry" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search yachts…", className: "h-8 w-56 pl-8" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-8 rounded-md border border-border bg-card p-0.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setView("list"), className: `flex items-center gap-1 rounded px-2.5 text-xs ${view === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(List, { className: "h-3.5 w-3.5" }),
            " List"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setView("cards"), className: `flex items-center gap-1 rounded px-2.5 text-xs ${view === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(LayoutGrid, { className: "h-3.5 w-3.5" }),
            " Cards"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenu, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", size: "sm", className: "h-8 gap-1.5 text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SlidersHorizontal, { className: "h-3.5 w-3.5" }),
            " Columns"
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenuContent, { align: "end", className: "max-h-96 overflow-y-auto w-64", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuLabel, { children: "Visible columns" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuSeparator, {}),
            YACHT_COLUMNS.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuCheckboxItem, { checked: visible.includes(c.key), onCheckedChange: (v) => toggleVisible(c.key, v), children: c.label }, c.key))
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { asChild: true, size: "sm", className: "h-8 gap-1.5 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/yachts/new", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3.5 w-3.5" }),
          " Add Yacht"
        ] }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-3 px-5 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(StatCard, { label: "Total Vessels", value: stats.total, icon: Ship, accent: "text-primary", active: statusFilter === "all", onClick: () => setStatusFilter("all") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(StatCard, { label: "In Country", value: stats.inCountry, icon: MapPin, accent: "text-success", active: statusFilter === "in_country", onClick: () => toggleStatFilter("in_country") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(StatCard, { label: "Departed", value: stats.departed, icon: LogOut, accent: "text-muted-foreground", active: statusFilter === "departed", onClick: () => toggleStatFilter("departed") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(StatCard, { label: "Change Agency", value: stats.changeAgency, icon: RefreshCcw, accent: "text-warning", active: statusFilter === "change_agency", onClick: () => toggleStatFilter("change_agency") })
    ] }),
    statusFilter !== "all" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-5 pb-1 flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground", children: [
        "Filtering by: ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "text-foreground capitalize", children: statusFilter })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setStatusFilter("all"), className: "text-xs text-primary hover:underline", children: "Clear" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto px-5 pb-5", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center text-sm text-muted-foreground", children: "Loading…" }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { hasFilter: !!q || statusFilter !== "all" }) : view === "list" ? /* @__PURE__ */ jsxRuntimeExports.jsx(ListView, { rows: filtered, visible, sortKey, sortDir, onSort: toggleSort, quickEditId, setQuickEditId, updateStatus }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CardsView, { rows: filtered }) })
  ] });
}
function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  active,
  onClick
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick, className: `flex items-center justify-between rounded-lg border px-4 py-3 text-left transition hover:border-primary/40 hover:bg-card/80 ${active ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card"}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] uppercase tracking-wider text-muted-foreground", children: label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `font-display text-2xl font-bold tabular-nums ${accent}`, children: value })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: `h-7 w-7 ${accent} opacity-60` })
  ] });
}
function SortIcon({
  col,
  sortKey,
  sortDir
}) {
  if (sortKey !== col) return /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronsUpDown, { className: "h-3 w-3 opacity-30" });
  return sortDir === "asc" ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronUp, { className: "h-3 w-3 text-primary" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "h-3 w-3 text-primary" });
}
function EmptyState({
  hasFilter
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Ship, { className: "h-10 w-10 text-muted-foreground/60" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-3 font-display text-lg font-semibold", children: hasFilter ? "No matching yachts" : "No yachts yet" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: hasFilter ? "Try adjusting your search or filter." : "Add your first vessel to get started." }),
    !hasFilter && /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { asChild: true, className: "mt-4 gap-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/yachts/new", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
      " Add Yacht"
    ] }) })
  ] });
}
function fmt(v) {
  if (v === null || v === void 0 || v === "") return "—";
  return String(v);
}
function ListView({
  rows,
  visible,
  sortKey,
  sortDir,
  onSort,
  quickEditId,
  setQuickEditId,
  updateStatus
}) {
  const cols = YACHT_COLUMNS.filter((c) => visible.includes(c.key));
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto rounded-lg border border-border bg-card", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "min-w-full text-xs", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 z-10 bg-card/95 backdrop-blur", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "●" }),
      cols.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "whitespace-nowrap px-3 py-2 text-left font-medium cursor-pointer select-none hover:text-foreground transition", onClick: () => onSort(c.key), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
        c.label,
        /* @__PURE__ */ jsxRuntimeExports.jsx(SortIcon, { col: c.key, sortKey, sortDir })
      ] }) }, c.key))
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: rows.map((y, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border/50 transition hover:bg-accent/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground tabular-nums", children: String(i + 1).padStart(3, "0") }),
      cols.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "whitespace-nowrap px-3 py-1.5", children: c.key === "vessel_name" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/yachts/$id", params: {
        id: y.id
      }, className: "font-medium text-foreground hover:text-primary", children: fmt(y[c.key]) }) : c.key === "status" ? quickEditId === y.id ? /* @__PURE__ */ jsxRuntimeExports.jsx("select", { autoFocus: true, defaultValue: y.status ?? "", onBlur: (e) => updateStatus(y.id, e.target.value), onChange: (e) => updateStatus(y.id, e.target.value), className: "h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary", onClick: (e) => e.stopPropagation(), children: ["In Country", "Departed", "Change Agency", "Active", "Inactive", "Arrived", "Pending"].map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: s, children: s }, s)) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 group/status cursor-pointer", onClick: () => setQuickEditId(y.id), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(StatusPill, { status: y[c.key] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/status:opacity-60 transition-opacity" })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-foreground/80", children: fmt(y[c.key]) }) }, c.key))
    ] }, y.id)) })
  ] }) });
}
function CardsView({
  rows
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", children: rows.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/yachts/$id", params: {
    id: y.id
  }, className: "group overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary/50 hover:shadow-[0_8px_30px_-10px_oklch(0.62_0.18_245/.35)]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "aspect-[16/9] overflow-hidden bg-muted", children: y.vessel_image ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: y.vessel_image, alt: "", className: "h-full w-full object-cover transition group-hover:scale-105" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full w-full items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Ship, { className: "h-10 w-10 text-muted-foreground/40" }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-display font-semibold leading-tight", children: fmt(y.vessel_name) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(StatusPill, { status: y.status })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-muted-foreground", children: [
        fmt(y.vessel_type),
        " · ",
        fmt(y.flag)
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2 pt-2 text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-muted-foreground", children: "Berth" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium", children: fmt(y.berth) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-muted-foreground", children: "LOA" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "font-medium tabular-nums", children: [
            fmt(y.length_overall_m),
            " m"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-muted-foreground", children: "ETA" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium tabular-nums", children: fmt(y.eta) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-muted-foreground", children: "ETD" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium tabular-nums", children: fmt(y.etd) })
        ] })
      ] })
    ] })
  ] }, y.id)) });
}
export {
  YachtsPage as component
};
