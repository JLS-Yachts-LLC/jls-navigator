import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-DsQ-8Irl.js";
import { s as supabase, t as toast, L as Link } from "./router-DIZelgi3.js";
import { B as Button } from "./button-BpYf_3Uk.js";
import { I as Input } from "./input-BJ_AqVVM.js";
import { S as StatusPill } from "./status-pill-C3L2jko_.js";
import { D as DEFAULT_VISIBLE_COLUMNS, Y as YACHT_COLUMNS } from "./yacht-fields-BxFZKucR.js";
import { D as DropdownMenu, a as DropdownMenuTrigger, S as SlidersHorizontal, b as DropdownMenuContent, d as DropdownMenuLabel, e as DropdownMenuSeparator, h as DropdownMenuCheckboxItem } from "./dropdown-menu-yuUGF0UD.js";
import { A as Anchor } from "./anchor-BDwc_XVF.js";
import { S as Search } from "./search-BweoIQVw.js";
import { c as createLucideIcon } from "./createLucideIcon-MgZLU5K_.js";
import { L as LayoutGrid } from "./layout-grid-Ct7oPvJQ.js";
import { e as Plus } from "./Combination-DYVvUise.js";
import { S as Ship } from "./ship-D9em-a1X.js";
import { M as MapPin } from "./map-pin-DAwq8JE1.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./index-EFGDcBO_.js";
import "./circle-DgUrBvuL.js";
import "./chevron-right-WKf6QYSv.js";
const __iconNode$1 = [
  ["path", { d: "M8 2v4", key: "1cmpym" }],
  ["path", { d: "M16 2v4", key: "4m81vk" }],
  ["rect", { width: "18", height: "18", x: "3", y: "4", rx: "2", key: "1hopcy" }],
  ["path", { d: "M3 10h18", key: "8toen8" }]
];
const Calendar = createLucideIcon("calendar", __iconNode$1);
const __iconNode = [
  ["path", { d: "M3 5h.01", key: "18ugdj" }],
  ["path", { d: "M3 12h.01", key: "nlz23k" }],
  ["path", { d: "M3 19h.01", key: "noohij" }],
  ["path", { d: "M8 5h13", key: "1pao27" }],
  ["path", { d: "M8 12h13", key: "1za7za" }],
  ["path", { d: "M8 19h13", key: "m83p4d" }]
];
const List = createLucideIcon("list", __iconNode);
function YachtsPage() {
  const [view, setView] = reactExports.useState("list");
  const [yachts, setYachts] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [q, setQ] = reactExports.useState("");
  const [visible, setVisible] = reactExports.useState(DEFAULT_VISIBLE_COLUMNS);
  reactExports.useEffect(() => {
    void load();
  }, []);
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
  const filtered = reactExports.useMemo(() => {
    if (!q.trim()) return yachts;
    const s = q.toLowerCase();
    return yachts.filter((y) => Object.values(y).some((v) => String(v ?? "").toLowerCase().includes(s)));
  }, [yachts, q]);
  const stats = reactExports.useMemo(() => {
    const total = yachts.length;
    const inPort = yachts.filter((y) => String(y.status ?? "").toLowerCase().includes("active") || String(y.status ?? "").toLowerCase().includes("port")).length;
    const archived = yachts.filter((y) => y.archive === true).length;
    return {
      total,
      inPort,
      archived
    };
  }, [yachts]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-6 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Anchor, { className: "h-3.5 w-3.5" }),
          " Port & Operations",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "opacity-40", children: "/" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-foreground", children: "Yachts" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-xl font-semibold tracking-tight", children: "Yacht Registry" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search yachts…", className: "h-9 w-64 pl-8" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-9 rounded-md border border-border bg-card p-0.5", children: [
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
          /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", size: "sm", className: "h-9 gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SlidersHorizontal, { className: "h-3.5 w-3.5" }),
            " Columns"
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenuContent, { align: "end", className: "max-h-96 overflow-y-auto w-64", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuLabel, { children: "Visible columns" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuSeparator, {}),
            YACHT_COLUMNS.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuCheckboxItem, { checked: visible.includes(c.key), onCheckedChange: (v) => setVisible((prev) => v ? [...prev, c.key] : prev.filter((k) => k !== c.key)), children: c.label }, c.key))
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { asChild: true, size: "sm", className: "h-9 gap-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/yachts/new", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3.5 w-3.5" }),
          " Add Yacht"
        ] }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3 px-6 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Total Vessels", value: stats.total, icon: Ship, accent: "text-primary" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Active / In Port", value: stats.inPort, icon: MapPin, accent: "text-success" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Archived", value: stats.archived, icon: Calendar, accent: "text-muted-foreground" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto px-6 pb-6", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center text-sm text-muted-foreground", children: "Loading…" }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, {}) : view === "list" ? /* @__PURE__ */ jsxRuntimeExports.jsx(ListView, { rows: filtered, visible }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CardsView, { rows: filtered }) })
  ] });
}
function Stat({
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
function EmptyState() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Ship, { className: "h-10 w-10 text-muted-foreground/60" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "mt-3 font-display text-lg font-semibold", children: "No yachts yet" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: "Add your first vessel to get started." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { asChild: true, className: "mt-4 gap-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/yachts/new", children: [
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
  visible
}) {
  const cols = YACHT_COLUMNS.filter((c) => visible.includes(c.key));
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto rounded-lg border border-border bg-card", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "min-w-full text-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 z-10 bg-card/95 backdrop-blur", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "●" }),
      cols.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "whitespace-nowrap px-3 py-2 text-left font-medium", children: c.label }, c.key))
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: rows.map((y, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border/50 transition hover:bg-accent/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-muted-foreground tabular-nums text-xs", children: String(i + 1).padStart(3, "0") }),
      cols.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "whitespace-nowrap px-3 py-2", children: c.key === "vessel_name" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/yachts/$id", params: {
        id: y.id
      }, className: "font-medium text-foreground hover:text-primary", children: fmt(y[c.key]) }) : c.key === "status" ? /* @__PURE__ */ jsxRuntimeExports.jsx(StatusPill, { status: y[c.key] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-foreground/80", children: fmt(y[c.key]) }) }, c.key))
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
