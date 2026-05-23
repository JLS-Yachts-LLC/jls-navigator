import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-BhSB73Oa.js";
import { s as supabase, t as toast, d as daysUntil, e as expiryVariant, P as PERMIT_META } from "./router-DtI2KWt0.js";
import { c as cn } from "./utils-Bz4m9VPB.js";
import { L as LoaderCircle } from "./loader-circle-w1KYOQxo.js";
import { A as Anchor } from "./anchor-HrhtZFCA.js";
import { C as CircleCheck } from "./circle-check-7tBlyRXp.js";
import { F as FileCheckCorner } from "./file-check-corner-pYHAnnlp.js";
import { C as Clock } from "./clock-Bd7PLjhz.js";
import { T as TriangleAlert } from "./triangle-alert-VZ0QUpdk.js";
import { C as Car } from "./car-DqbaTNnc.js";
import { M as MapPin } from "./map-pin-CfDOFZG6.js";
import { c as createLucideIcon } from "./createLucideIcon-DhyYiX_6.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const __iconNode = [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "m12 5 7 7-7 7", key: "xquz4c" }]
];
const ArrowRight = createLucideIcon("arrow-right", __iconNode);
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
function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function DirectorPage() {
  const [loading, setLoading] = reactExports.useState(true);
  const [data, setData] = reactExports.useState(null);
  reactExports.useEffect(() => {
    void load();
  }, []);
  async function load() {
    setLoading(true);
    try {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString();
      const [yachtsRes, permitsRes, tripsRes, driversRes] = await Promise.all([
        supabase.from("yachts").select("id, vessel_name, status").order("vessel_name"),
        supabase.from("permits").select("id, permit_type, yacht_id, expiry_date, status").order("expiry_date", { ascending: true, nullsFirst: false }),
        supabase.from("crew_cab_trips").select("id, pickup_location, dropoff_location, pickup_datetime, status, driver_id").gte("pickup_datetime", now).lte("pickup_datetime", in7Days).order("pickup_datetime", { ascending: true }).limit(10),
        supabase.from("crew_drivers").select("id, full_name")
      ]);
      if (yachtsRes.error) throw yachtsRes.error;
      if (permitsRes.error) throw permitsRes.error;
      if (tripsRes.error) throw tripsRes.error;
      if (driversRes.error) throw driversRes.error;
      setData({
        yachts: yachtsRes.data ?? [],
        permits: permitsRes.data ?? [],
        trips: tripsRes.data ?? [],
        drivers: driversRes.data ?? []
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }
  const stats = (() => {
    if (!data) return null;
    const totalYachts = data.yachts.length;
    const activeYachts = data.yachts.filter((y) => y.status?.toLowerCase() === "active").length;
    const totalPermits = data.permits.length;
    let expiringCount = 0;
    let expiredCount = 0;
    for (const p of data.permits) {
      const d = daysUntil(p.expiry_date);
      if (d !== null && d < 0) expiredCount++;
      else if (d !== null && d <= 30) expiringCount++;
    }
    const upcomingTrips = data.trips.length;
    return { totalYachts, activeYachts, totalPermits, expiringCount, expiredCount, upcomingTrips };
  })();
  const expiringPermits = (() => {
    if (!data) return [];
    const yachtMap = new Map(data.yachts.map((y) => [y.id, y.vessel_name]));
    return data.permits.filter((p) => {
      const d = daysUntil(p.expiry_date);
      return d !== null && d <= 60;
    }).map((p) => ({
      ...p,
      vessel_name: p.yacht_id ? yachtMap.get(p.yacht_id) ?? "Unknown" : "—",
      days: daysUntil(p.expiry_date)
    })).sort((a, b) => a.days - b.days);
  })();
  const driversMap = (() => {
    if (!data) return /* @__PURE__ */ new Map();
    return new Map(data.drivers.map((d) => [d.id, d.full_name]));
  })();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "border-b border-border bg-card/40 px-5 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "Director / Dashboard" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-base font-semibold tracking-tight", children: "Director Dashboard" })
    ] }),
    loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-1 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-1 flex-col gap-4 overflow-auto p-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-6 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Total Yachts", value: stats?.totalYachts ?? 0, icon: Anchor, accent: "text-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Active Yachts", value: stats?.activeYachts ?? 0, icon: CircleCheck, accent: "text-success" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Total Permits", value: stats?.totalPermits ?? 0, icon: FileCheckCorner, accent: "text-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Expiring ≤ 30d", value: stats?.expiringCount ?? 0, icon: Clock, accent: "text-warning" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Expired Permits", value: stats?.expiredCount ?? 0, icon: TriangleAlert, accent: "text-destructive" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Upcoming Trips", value: stats?.upcomingTrips ?? 0, icon: Car, accent: "text-primary" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid min-h-0 flex-1 grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col rounded-lg border border-border bg-card overflow-hidden", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-border px-4 py-2.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "font-display text-sm font-semibold", children: "Expiring Permits" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "within 60 days" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: expiringPermits.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-32 items-center justify-center text-sm text-muted-foreground", children: "No permits expiring within 60 days" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-card/95 sticky top-0", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Permit Type" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Yacht" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-right font-medium", children: "Days" })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: expiringPermits.map((p) => {
              const variant = expiryVariant(p.days);
              const label = PERMIT_META[p.permit_type]?.label ?? p.permit_type;
              const dayText = p.days < 0 ? `${Math.abs(p.days)}d ago` : p.days === 0 ? "Today" : `${p.days}d`;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "tr",
                {
                  className: "border-b border-border/50 transition hover:bg-accent/30",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: label }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-muted-foreground", children: p.vessel_name }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-right", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "span",
                      {
                        className: cn(
                          "pill",
                          variant === "pill-danger" && "pill-danger",
                          variant === "pill-warning" && "pill-warning",
                          variant === "pill-success" && "pill-success",
                          variant === "pill-muted" && "pill-muted"
                        ),
                        children: dayText
                      }
                    ) })
                  ]
                },
                p.id
              );
            }) })
          ] }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col rounded-lg border border-border bg-card overflow-hidden", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-border px-4 py-2.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "font-display text-sm font-semibold", children: "Upcoming Trips" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "next 7 days" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: data?.trips.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-32 items-center justify-center text-sm text-muted-foreground", children: "No upcoming trips in the next 7 days" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "divide-y divide-border/50", children: data?.trips.map((trip) => {
            const driverName = trip.driver_id ? driversMap.get(trip.driver_id) ?? "Unknown driver" : "Unassigned";
            return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-3 px-4 py-3 transition hover:bg-accent/30", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-sm", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate font-medium", children: trip.pickup_location ?? "—" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRight, { className: "h-3.5 w-3.5 shrink-0 text-muted-foreground" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: trip.dropoff_location ?? "—" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-0.5 flex items-center gap-2 text-xs text-muted-foreground", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: driverName }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "·" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tabular-nums", children: formatDateTime(trip.pickup_datetime) })
                ] })
              ] })
            ] }, trip.id);
          }) }) })
        ] })
      ] })
    ] })
  ] });
}
const SplitComponent = DirectorPage;
export {
  SplitComponent as component
};
