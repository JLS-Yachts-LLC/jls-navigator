import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { PERMIT_META, daysUntil, expiryVariant } from "@/lib/permit-types";
import type { PermitType } from "@/lib/permit-types";
import {
  Anchor,
  CheckCircle2,
  FileCheck2,
  Clock,
  AlertTriangle,
  Car,
  Loader2,
  MapPin,
  ArrowRight,
  Package,
  ShoppingCart,
  CalendarDays,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Yacht = { id: string; vessel_name: string; status: string };

type Permit = {
  id: string;
  permit_type: PermitType;
  yacht_id: string | null;
  expiry_date: string | null;
  status: string;
};

type CrewCabTrip = {
  id: string;
  pickup_location: string | null;
  dropoff_location: string | null;
  pickup_datetime: string | null;
  status: string | null;
  driver_id: string | null;
};

type CrewDriver = {
  id: string;
  full_name: string;
};

type DashboardData = {
  yachts: Yacht[];
  permits: Permit[];
  trips: CrewCabTrip[];
  drivers: CrewDriver[];
  pendingPackages: number;
  pendingProcurement: number;
  permitsThisMonth: number;
  tripsThisMonth: number;
};

function Stat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`font-display text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      </div>
      <Icon className={`h-7 w-7 ${accent} opacity-60`} />
    </div>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DirectorPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const db = supabase as any;

      // Core queries — must succeed
      const [yachtsRes, permitsRes, tripsRes, driversRes] = await Promise.all([
        fetchAllRows(() => supabase.from("yachts").select("id, vessel_name, status").order("vessel_name")),
        fetchAllRows(() => supabase.from("permits").select("id, permit_type, yacht_id, expiry_date, status").order("expiry_date", { ascending: true, nullsFirst: false })),
        db.from("crew_trips").select("id, pickup_location, dropoff_location, pickup_datetime, status, driver_id").gte("pickup_datetime", now).lte("pickup_datetime", in7Days).order("pickup_datetime", { ascending: true }).limit(10),
        fetchAllRows(() => db.from("crew_drivers").select("id, full_name")),
      ]);

      if (yachtsRes.error) throw yachtsRes.error;
      if (permitsRes.error) throw permitsRes.error;

      // Optional count queries — degrade gracefully if tables don't exist
      const [pkgRes, procRes, permitsMoRes, tripsMoRes] = await Promise.allSettled([
        db.from("packages").select("id", { count: "exact", head: true }).in("status", ["pending", "in_transit", "received"]),
        db.from("procurement_items").select("id", { count: "exact", head: true }).in("status", ["requested", "ordered"]),
        db.from("permits").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
        db.from("crew_trips").select("id", { count: "exact", head: true }).gte("pickup_datetime", monthStart),
      ]);

      const safeCount = (r: PromiseSettledResult<any>) => r.status === "fulfilled" ? (r.value?.count ?? 0) : 0;

      setData({
        yachts: (yachtsRes.data ?? []) as Yacht[],
        permits: (permitsRes.data ?? []) as Permit[],
        trips: ((tripsRes as any).data ?? []) as CrewCabTrip[],
        drivers: ((driversRes as any).data ?? []) as CrewDriver[],
        pendingPackages: safeCount(pkgRes),
        pendingProcurement: safeCount(procRes),
        permitsThisMonth: safeCount(permitsMoRes),
        tripsThisMonth: safeCount(tripsMoRes),
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

  // Permits expiring within 60 days (includes expired), sorted ascending
  const expiringPermits = (() => {
    if (!data) return [];
    const yachtMap = new Map(data.yachts.map((y) => [y.id, y.vessel_name]));
    return data.permits
      .filter((p) => {
        const d = daysUntil(p.expiry_date);
        return d !== null && d <= 60;
      })
      .map((p) => ({
        ...p,
        vessel_name: p.yacht_id ? (yachtMap.get(p.yacht_id) ?? "Unknown") : "—",
        days: daysUntil(p.expiry_date)!,
      }))
      .sort((a, b) => a.days - b.days);
  })();

  const driversMap = (() => {
    if (!data) return new Map<string, string>();
    return new Map(data.drivers.map((d) => [d.id, d.full_name]));
  })();

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card/40 px-5 py-3">
        <div className="text-xs text-muted-foreground">Director / Dashboard</div>
        <h1 className="font-display text-base font-semibold tracking-tight">Director Dashboard</h1>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
          {/* Stats — row 1: Yachts & Permits */}
          <div className="grid grid-cols-6 gap-3">
            <Stat label="Total Yachts" value={stats?.totalYachts ?? 0} icon={Anchor} accent="text-primary" />
            <Stat label="Active Yachts" value={stats?.activeYachts ?? 0} icon={CheckCircle2} accent="text-success" />
            <Stat label="Total Permits" value={stats?.totalPermits ?? 0} icon={FileCheck2} accent="text-primary" />
            <Stat label="Expiring ≤ 30d" value={stats?.expiringCount ?? 0} icon={Clock} accent="text-warning" />
            <Stat label="Expired Permits" value={stats?.expiredCount ?? 0} icon={AlertTriangle} accent="text-destructive" />
            <Stat label="Upcoming Trips" value={stats?.upcomingTrips ?? 0} icon={Car} accent="text-primary" />
          </div>
          {/* Stats — row 2: Operations this month */}
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Permits This Month" value={data?.permitsThisMonth ?? 0} icon={CalendarDays} accent="text-info" />
            <Stat label="Trips This Month" value={data?.tripsThisMonth ?? 0} icon={TrendingUp} accent="text-success" />
            <Stat label="Packages In Progress" value={data?.pendingPackages ?? 0} icon={Package} accent="text-warning" />
            <Stat label="Pending Procurement" value={data?.pendingProcurement ?? 0} icon={ShoppingCart} accent="text-primary" />
          </div>

          {/* Bottom panels */}
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
            {/* Expiring Permits */}
            <div className="flex flex-col rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="font-display text-sm font-semibold">Expiring Permits</h2>
                <span className="text-xs text-muted-foreground">within 60 days</span>
              </div>
              <div className="flex-1 overflow-auto">
                {expiringPermits.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    No permits expiring within 60 days
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-card/95 sticky top-0">
                      <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">Permit Type</th>
                        <th className="px-3 py-2 text-left font-medium">Yacht</th>
                        <th className="px-3 py-2 text-right font-medium">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expiringPermits.map((p) => {
                        const variant = expiryVariant(p.days);
                        const label = PERMIT_META[p.permit_type as PermitType]?.label ?? p.permit_type;
                        const dayText =
                          p.days < 0
                            ? `${Math.abs(p.days)}d ago`
                            : p.days === 0
                              ? "Today"
                              : `${p.days}d`;
                        return (
                          <tr
                            key={p.id}
                            className="border-b border-border/50 transition hover:bg-accent/30"
                          >
                            <td className="px-3 py-2">{label}</td>
                            <td className="px-3 py-2 text-muted-foreground">{p.vessel_name}</td>
                            <td className="px-3 py-2 text-right">
                              <span
                                className={cn(
                                  "pill",
                                  variant === "pill-danger" && "pill-danger",
                                  variant === "pill-warning" && "pill-warning",
                                  variant === "pill-success" && "pill-success",
                                  variant === "pill-muted" && "pill-muted",
                                )}
                              >
                                {dayText}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Upcoming Trips */}
            <div className="flex flex-col rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="font-display text-sm font-semibold">Upcoming Trips</h2>
                <span className="text-xs text-muted-foreground">next 7 days</span>
              </div>
              <div className="flex-1 overflow-auto">
                {data?.trips.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    No upcoming trips in the next 7 days
                  </div>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {data?.trips.map((trip) => {
                      const driverName = trip.driver_id
                        ? (driversMap.get(trip.driver_id) ?? "Unknown driver")
                        : "Unassigned";
                      return (
                        <li key={trip.id} className="flex items-start gap-3 px-4 py-3 transition hover:bg-accent/30">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-sm">
                              <span className="truncate font-medium">{trip.pickup_location ?? "—"}</span>
                              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">{trip.dropoff_location ?? "—"}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{driverName}</span>
                              <span>·</span>
                              <span className="tabular-nums">{formatDateTime(trip.pickup_datetime)}</span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
